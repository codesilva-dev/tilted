import { Server, Socket } from 'socket.io';
import { createServer } from 'http';
import { HandController, HandEvent } from '../game/engine/hand-controller';
import { TableState, GameAction, createInitialTableState, createPlayer } from '../game/types/game-state';

/**
 * Socket.IO Server v2 - With Seat Selection
 *
 * New features:
 * - Two-step process: join-room (spectate) → take-seat (play)
 * - Visual seat selection (10 seats)
 * - Create custom tables
 * - Permanent quickplay table
 */

// Port configuration
const PORT = process.env.PORT
  ? parseInt(process.env.PORT)
  : process.env.SOCKET_PORT
    ? parseInt(process.env.SOCKET_PORT)
    : 3001;

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// Table configuration
interface TableConfig {
  tableId: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;
  isQuickplay: boolean;
}

// Game room management
interface GameRoom {
  config: TableConfig;
  controller: HandController;
  spectators: Map<string, { id: string; name: string }>; // Players watching but not seated
  seatedPlayers: Set<string>; // Player IDs who are seated
}

const gameRooms = new Map<string, GameRoom>();
const socketToPlayer = new Map<string, { playerId: string; playerName: string; tableId?: string }>();

/**
 * Create HTTP server and Socket.IO instance
 */
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

/**
 * Get or create a game room
 */
function getOrCreateRoom(config: TableConfig): GameRoom {
  let room = gameRooms.get(config.tableId);

  if (!room) {
    const initialState = createInitialTableState(config.tableId, config.name, config.smallBlind, config.bigBlind);
    const controller = new HandController(initialState);

    room = {
      config,
      controller,
      spectators: new Map(),
      seatedPlayers: new Set()
    };

    setupControllerEventHandlers(controller, config.tableId);
    gameRooms.set(config.tableId, room);

    console.log(`[Table Created] ${config.name} (${config.tableId}) - SB: ${config.smallBlind}, BB: ${config.bigBlind}`);
  }

  return room;
}

/**
 * Create quickplay table on server start
 */
function createQuickplayTable() {
  const quickplayConfig: TableConfig = {
    tableId: 'quickplay-1',
    name: 'Quickplay',
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 1000,
    maxBuyIn: 5000,
    maxSeats: 9,
    isQuickplay: true
  };

  getOrCreateRoom(quickplayConfig);
  console.log('[Quickplay] Permanent quickplay table created');
}

/**
 * Setup event handlers to broadcast HandController events
 */
function setupControllerEventHandlers(controller: HandController, tableId: string): void {
  controller.on((event: HandEvent) => {
    switch (event.type) {
      case 'hand-started':
        io.to(tableId).emit('hand-started', { table: event.table });
        console.log(`[Event] Hand started at table ${tableId}`);
        break;

      case 'blinds-posted':
        io.to(tableId).emit('blinds-posted', { table: event.table });
        console.log(`[Event] Blinds posted at table ${tableId}`);
        break;

      case 'cards-dealt':
        io.to(tableId).emit('cards-dealt', { table: event.table });
        console.log(`[Event] Cards dealt at table ${tableId}`);
        break;

      case 'action-processed':
        io.to(tableId).emit('action-processed', {
          table: event.table,
          action: event.action
        });
        console.log(`[Event] Action processed at table ${tableId}:`, event.action.type);
        break;

      case 'street-changed':
        io.to(tableId).emit('street-changed', {
          table: event.table,
          street: event.street
        });
        console.log(`[Event] Street changed to ${event.street} at table ${tableId}`);
        break;

      case 'hand-completed':
        io.to(tableId).emit('hand-completed', {
          table: event.table,
          result: event.result
        });
        io.to(tableId).emit('game-state', { table: event.table });
        console.log(`[Event] Hand completed at table ${tableId}`);
        // Leaving players will be removed when startHand is called after the countdown
        break;

      case 'players-removed':
        // Clean up server-side tracking for removed players
        const roomForRemoval = gameRooms.get(tableId);
        if (roomForRemoval) {
          for (const player of event.removedPlayers) {
            roomForRemoval.seatedPlayers.delete(player.id);
            // Move to spectators so they can sit again
            roomForRemoval.spectators.set(player.id, { id: player.id, name: player.name });
            console.log(`[Event] Player ${player.name} moved to spectators`);
          }
        }

        // Broadcast updated game state
        io.to(tableId).emit('game-state', { table: event.table });
        io.to(tableId).emit('players-removed', { playerIds: event.removedPlayers.map(p => p.id) });
        console.log(`[Event] Removed ${event.removedPlayers.length} players from table ${tableId}`);
        break;

      case 'error':
        io.to(tableId).emit('game-error', {
          message: event.error.message
        });
        console.error(`[Error] at table ${tableId}:`, event.error.message);
        break;
    }
  });
}

/**
 * Get table info for lobby
 */
function getTableInfo(room: GameRoom) {
  const state = room.controller.getState();
  return {
    tableId: room.config.tableId,
    name: room.config.name,
    smallBlind: room.config.smallBlind,
    bigBlind: room.config.bigBlind,
    minBuyIn: room.config.minBuyIn,
    maxBuyIn: room.config.maxBuyIn,
    maxSeats: room.config.maxSeats,
    seatedPlayers: state.players.length,
    spectators: room.spectators.size,
    isQuickplay: room.config.isQuickplay,
    status: state.players.length >= 2 ? 'active' : 'waiting'
  };
}

/**
 * Handle client connections
 */
io.on('connection', (socket: Socket) => {
  console.log(`[Connection] Client connected: ${socket.id}`);

  /**
   * Get list of all tables (for lobby)
   */
  socket.on('get-tables', () => {
    const tables = Array.from(gameRooms.values()).map(room => getTableInfo(room));
    socket.emit('tables-list', { tables });
  });

  /**
   * Create a new table
   */
  socket.on('create-table', (data: Omit<TableConfig, 'tableId' | 'isQuickplay'>) => {
    try {
      const tableId = `table-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const config: TableConfig = {
        ...data,
        tableId,
        isQuickplay: false
      };

      getOrCreateRoom(config);

      // Broadcast to all clients that a new table was created
      io.emit('table-created', { table: getTableInfo(gameRooms.get(tableId)!) });

      socket.emit('table-created-success', { tableId });
      console.log(`[Table Created] ${config.name} by ${socket.id}`);

    } catch (error) {
      console.error('[Create Table Error]', error);
      socket.emit('create-table-error', {
        message: error instanceof Error ? error.message : 'Failed to create table'
      });
    }
  });

  /**
   * Join a table as spectator
   */
  socket.on('join-room', (data: { tableId: string; playerId: string; playerName: string }) => {
    try {
      const { tableId, playerId, playerName } = data;

      const room = gameRooms.get(tableId);
      if (!room) {
        throw new Error('Table not found');
      }

      // Join Socket.IO room
      socket.join(tableId);

      // Store player info
      socket.data.tableId = tableId;
      socket.data.playerId = playerId;
      socket.data.playerName = playerName;
      socketToPlayer.set(socket.id, { playerId, playerName, tableId });

      // Add as spectator
      room.spectators.set(playerId, { id: playerId, name: playerName });

      // Send current game state
      socket.emit('game-state', { table: room.controller.getState() });

      // Notify others
      socket.to(tableId).emit('spectator-joined', {
        playerId,
        playerName,
        spectatorCount: room.spectators.size
      });

      // Send seat availability (seats 1-9)
      const state = room.controller.getState();
      const occupiedSeats = state.players.map(p => p.seatPosition);
      const availableSeats = Array.from({ length: room.config.maxSeats }, (_, i) => i + 1)
        .filter(seat => !occupiedSeats.includes(seat));

      socket.emit('seats-available', { availableSeats, occupiedSeats });

      console.log(`[Join Room] ${playerName} joined ${tableId} as spectator`);

    } catch (error) {
      console.error('[Join Room Error]', error);
      socket.emit('join-room-error', {
        message: error instanceof Error ? error.message : 'Failed to join room'
      });
    }
  });

  /**
   * Take a seat at the table
   */
  socket.on('take-seat', (data: { tableId: string; playerId: string; seatPosition: number; buyIn: number }) => {
    try {
      const { tableId, playerId, seatPosition, buyIn } = data;

      const room = gameRooms.get(tableId);
      if (!room) {
        throw new Error('Table not found');
      }

      const state = room.controller.getState();

      // Validate buy-in
      if (buyIn < room.config.minBuyIn || buyIn > room.config.maxBuyIn) {
        throw new Error(`Buy-in must be between ${room.config.minBuyIn} and ${room.config.maxBuyIn}`);
      }

      // Check if seat is available
      const occupiedSeats = state.players.map(p => p.seatPosition);
      if (occupiedSeats.includes(seatPosition)) {
        throw new Error('Seat is already taken');
      }

      // Check table capacity
      if (state.players.length >= room.config.maxSeats) {
        throw new Error('Table is full');
      }

      // Get player info from spectators
      const spectator = room.spectators.get(playerId);
      if (!spectator) {
        throw new Error('Must join room before taking a seat');
      }

      // Create player and add to table
      const player = createPlayer(playerId, spectator.name, seatPosition, buyIn);
      state.players.push(player);

      // Move from spectator to seated
      room.spectators.delete(playerId);
      room.seatedPlayers.add(playerId);

      // Broadcast updated state
      io.to(tableId).emit('game-state', { table: state });
      io.to(tableId).emit('player-seated', {
        playerId,
        playerName: spectator.name,
        seatPosition,
        stack: buyIn,
        seatedCount: state.players.length
      });

      console.log(`[Take Seat] ${spectator.name} sat at seat ${seatPosition} on ${tableId}`);

    } catch (error) {
      console.error('[Take Seat Error]', error);
      socket.emit('take-seat-error', {
        message: error instanceof Error ? error.message : 'Failed to take seat'
      });
    }
  });

  /**
   * Leave seat (stand up but stay in room)
   */
  socket.on('leave-seat', async (data: { tableId: string; playerId: string }) => {
    try {
      const { tableId, playerId } = data;

      const room = gameRooms.get(tableId);
      if (!room) {
        throw new Error('Table not found');
      }

      const state = room.controller.getState();
      const player = state.players.find(p => p.id === playerId);

      if (!player) {
        throw new Error('Player not seated');
      }

      const playerName = player.name;
      const seatPosition = player.seatPosition;

      // Check if hand is in progress (but not at showdown - showdown means hand is complete)
      const handInProgress = player.holeCards.length > 0 && state.currentStreet !== 'showdown';

      if (handInProgress) {
        // Mid-hand: Fold and mark as leaving
        if (player.status === 'active') {
          console.log(`[Leave Seat] ${playerName} leaving mid-hand - folding and marking as leaving`);
          const foldAction: GameAction = {
            type: 'fold',
            playerId,
            timestamp: new Date()
          };
          await room.controller.handleAction(foldAction);
        }

        // Mark player as leaving (will be removed at end of hand)
        room.controller.markPlayerAsLeaving(playerId);

        // Get updated state after fold
        const updatedState = room.controller.getState();

        // Broadcast updated state (player still at table but folded and marked as leaving)
        io.to(tableId).emit('game-state', { table: updatedState });

        console.log(`[Leave Seat] ${playerName} marked as leaving, will be removed after hand`);

      } else if (state.currentStreet === 'showdown') {
        // At showdown: Mark as leaving, will be removed when next hand starts
        console.log(`[Leave Seat] ${playerName} leaving during showdown - marking as leaving`);
        room.controller.markPlayerAsLeaving(playerId);

        const updatedState = room.controller.getState();
        io.to(tableId).emit('game-state', { table: updatedState });

        console.log(`[Leave Seat] ${playerName} marked as leaving, will be removed when countdown ends`);

      } else {
        // No hand in progress: Remove immediately
        console.log(`[Leave Seat] ${playerName} leaving between hands - removing immediately`);

        // Remove from seated players using the controller method
        room.controller.removePlayer(playerId);
        room.seatedPlayers.delete(playerId);

        // Add back to spectators
        room.spectators.set(playerId, { id: playerId, name: playerName });

        // Get updated state after removal
        const updatedState = room.controller.getState();

        // Broadcast updated state
        io.to(tableId).emit('game-state', { table: updatedState });
        io.to(tableId).emit('player-left-seat', {
          playerId,
          seatPosition,
          seatedCount: updatedState.players.length
        });

        console.log(`[Leave Seat] ${playerName} left seat on ${tableId}`);
      }

    } catch (error) {
      console.error('[Leave Seat Error]', error);
      socket.emit('leave-seat-error', {
        message: error instanceof Error ? error.message : 'Failed to leave seat'
      });
    }
  });

  /**
   * Leave room entirely
   */
  socket.on('leave-room', async (data: { tableId: string; playerId: string }) => {
    try {
      const { tableId, playerId } = data;

      const room = gameRooms.get(tableId);
      if (!room) {
        return;
      }

      // If player is seated and in an active hand, fold them first
      const state = room.controller.getState();
      const player = state.players.find(p => p.id === playerId);

      if (player) {
        const handInProgress = player.holeCards.length > 0;

        if (handInProgress) {
          // Mid-hand: Fold and mark as leaving
          if (player.status === 'active') {
            console.log(`[Leave Room] ${player.name} leaving mid-hand - folding`);
            const foldAction: GameAction = {
              type: 'fold',
              playerId,
              timestamp: new Date()
            };
            await room.controller.handleAction(foldAction);
          }

          // Mark player as leaving
          room.controller.markPlayerAsLeaving(playerId);

          console.log(`[Leave Room] ${player.name} marked as leaving, will be removed after hand`);
        } else {
          // No hand in progress: Remove immediately
          room.controller.removePlayer(playerId);
          room.seatedPlayers.delete(playerId);
          console.log(`[Leave Room] ${player.name} removed from table`);
        }
      }

      // Remove from spectators
      room.spectators.delete(playerId);

      socket.leave(tableId);
      socketToPlayer.delete(socket.id);

      // Get updated state
      const updatedState = room.controller.getState();

      // Notify others
      socket.to(tableId).emit('player-left-room', { playerId });
      io.to(tableId).emit('game-state', { table: updatedState });

      console.log(`[Leave Room] ${playerId} left ${tableId}`);

      // Clean up non-quickplay empty rooms
      if (!room.config.isQuickplay && room.spectators.size === 0 && room.seatedPlayers.size === 0) {
        gameRooms.delete(tableId);
        io.emit('table-deleted', { tableId });
        console.log(`[Table Deleted] ${tableId} (empty)`);
      }

    } catch (error) {
      console.error('[Leave Room Error]', error);
    }
  });

  /**
   * Start a hand
   */
  socket.on('start-hand', async (data: { tableId: string }) => {
    try {
      const { tableId } = data;
      const room = gameRooms.get(tableId);

      if (!room) {
        throw new Error('Table not found');
      }

      // Check if a hand is already in progress (prevent duplicate startHand calls)
      const currentState = room.controller.getState();
      const isActiveStreet = currentState.currentStreet !== 'showdown' && currentState.currentStreet !== 'pre-flop';
      const isPreflopWithAction = currentState.currentStreet === 'pre-flop' && currentState.activePlayerPosition !== null;
      const handInProgress = isActiveStreet || isPreflopWithAction;

      if (handInProgress) {
        console.log(`[Start Hand] Hand already in progress at table ${tableId}, ignoring duplicate call`);
        return;
      }

      // First, cleanup any leaving players
      const leavingPlayers = room.controller.removeLeavingPlayers();
      if (leavingPlayers.length > 0) {
        // Move them to spectators
        for (const player of leavingPlayers) {
          room.seatedPlayers.delete(player.id);
          room.spectators.set(player.id, { id: player.id, name: player.name });
          console.log(`[Start Hand] Player ${player.name} removed and moved to spectators`);
        }
        io.to(tableId).emit('players-removed', { playerIds: leavingPlayers.map(p => p.id) });
      }

      // Check if we have enough players to start
      // Note: players with small stacks (< BB) can still play - they'll go all-in on the blind
      const state = room.controller.getState();
      const activePlayers = state.players.filter(p => !p.isLeaving && p.stack > 0);

      if (activePlayers.length < 2) {
        // Not enough players - just reset to waiting state, don't try to start
        console.log(`[Start Hand] Not enough active players with chips (${activePlayers.length}) - resetting to waiting`);
        room.controller.resetToWaiting();
        const updatedState = room.controller.getState();
        io.to(tableId).emit('game-state', { table: updatedState });
        return;
      }

      // Enough players - start the hand
      console.log(`[Start Hand] Starting hand at table ${tableId}`);
      await room.controller.startHand();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start hand';
      console.error('[Start Hand Error]', errorMessage);

      // If error is about not enough players, reset to waiting state
      const isPlayerCountError = errorMessage.includes('at least 2') && errorMessage.includes('players');
      if (isPlayerCountError) {
        const { tableId } = data;
        const room = gameRooms.get(tableId);
        if (room) {
          room.controller.resetToWaiting();
          const updatedState = room.controller.getState();
          io.to(tableId).emit('game-state', { table: updatedState });
          console.log(`[Start Hand] Table ${tableId} reset to waiting state (not enough players)`);
        }
      } else {
        socket.emit('action-error', { message: errorMessage });
      }
    }
  });

  /**
   * Player action
   */
  socket.on('player-action', async (data: { tableId: string; action: GameAction }) => {
    try {
      const { tableId, action } = data;

      const room = gameRooms.get(tableId);
      if (!room) {
        throw new Error('Table not found');
      }

      console.log(`[Action] Player ${action.playerId} at table ${tableId}: ${action.type}${action.amount ? ` ${action.amount}` : ''}`);

      await room.controller.handleAction(action);

    } catch (error) {
      console.error('[Action Error]', error);
      socket.emit('action-error', {
        message: error instanceof Error ? error.message : 'Invalid action',
        action: data.action
      });
    }
  });

  /**
   * Get game state
   */
  socket.on('get-game-state', (data: { tableId: string }) => {
    try {
      const { tableId } = data;
      const room = gameRooms.get(tableId);

      if (!room) {
        throw new Error('Table not found');
      }

      socket.emit('game-state', { table: room.controller.getState() });

    } catch (error) {
      console.error('[Get State Error]', error);
      socket.emit('state-error', {
        message: error instanceof Error ? error.message : 'Failed to get game state'
      });
    }
  });

  /**
   * Handle disconnect
   */
  socket.on('disconnect', async () => {
    console.log(`[Disconnect] Client disconnected: ${socket.id}`);

    const playerInfo = socketToPlayer.get(socket.id);
    if (playerInfo && playerInfo.tableId) {
      const { playerId, tableId } = playerInfo;
      const room = gameRooms.get(tableId);

      if (room) {
        // If player is seated and in an active hand, fold them first
        const state = room.controller.getState();
        const player = state.players.find(p => p.id === playerId);

        if (player) {
          const handInProgress = player.holeCards.length > 0;

          if (handInProgress) {
            // Mid-hand: Fold and mark as leaving
            if (player.status === 'active') {
              console.log(`[Disconnect] ${player.name} disconnected mid-hand - folding`);
              try {
                const foldAction: GameAction = {
                  type: 'fold',
                  playerId,
                  timestamp: new Date()
                };
                await room.controller.handleAction(foldAction);
              } catch (error) {
                console.error('[Disconnect] Error folding player hand:', error);
              }
            }

            // Mark player as leaving
            room.controller.markPlayerAsLeaving(playerId);
            console.log(`[Disconnect] ${player.name} marked as leaving, will be removed after hand`);
          } else {
            // No hand in progress: Remove immediately
            room.controller.removePlayer(playerId);
            room.seatedPlayers.delete(playerId);
            console.log(`[Disconnect] ${player.name} removed from table`);
          }
        }

        // Remove from spectators and seated players
        room.spectators.delete(playerId);

        // Get updated state
        const updatedState = room.controller.getState();

        socket.to(tableId).emit('player-disconnected', { playerId });
        io.to(tableId).emit('game-state', { table: updatedState });

        console.log(`[Disconnect] Player ${playerId} disconnected from ${tableId}`);

        // Clean up non-quickplay empty rooms
        if (!room.config.isQuickplay && room.spectators.size === 0 && room.seatedPlayers.size === 0) {
          gameRooms.delete(tableId);
          io.emit('table-deleted', { tableId });
          console.log(`[Table Deleted] ${tableId} (empty after disconnect)`);
        }
      }
    }

    socketToPlayer.delete(socket.id);
  });
});

/**
 * Start the server
 */
httpServer.listen(PORT, () => {
  // Create quickplay table
  createQuickplayTable();

  console.log(`
╔═══════════════════════════════════════════════════════╗
║     Poker Socket.IO Server v2                        ║
║     Port: ${PORT.toString().padEnd(43)}║
║     Client URL: ${CLIENT_URL.padEnd(36)}║
║     Status: ✅ Running                                ║
╚═══════════════════════════════════════════════════════╝
  `);
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
  console.log('\n[Shutdown] Received SIGTERM, closing server...');
  httpServer.close(() => {
    console.log('[Shutdown] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[Shutdown] Received SIGINT, closing server...');
  httpServer.close(() => {
    console.log('[Shutdown] Server closed');
    process.exit(0);
  });
});

export { io, httpServer, gameRooms };
