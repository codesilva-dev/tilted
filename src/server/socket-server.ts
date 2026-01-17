import { Server, Socket } from 'socket.io';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { HandController, HandEvent } from '../game/engine/hand-controller';
import { TableState, GameAction, createInitialTableState, createPlayer } from '../game/types/game-state';
import { log } from '../util/log';

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

// Track disconnected players for reconnection grace period
interface DisconnectedPlayer {
  playerId: string;
  playerName: string;
  tableId: string;
  disconnectedAt: Date;
  timeoutId: NodeJS.Timeout;
}
const disconnectedPlayers = new Map<string, DisconnectedPlayer>();

// Reconnection grace period in milliseconds (30 seconds)
const RECONNECT_GRACE_PERIOD = 30000;

/**
 * Handle disconnection timeout - called when grace period expires
 */
async function handleDisconnectTimeout(playerId: string): Promise<void> {
  const disconnectInfo = disconnectedPlayers.get(playerId);
  if (!disconnectInfo) {
    return; // Player already reconnected or was removed
  }

  const { playerName, tableId } = disconnectInfo;
  disconnectedPlayers.delete(playerId);

  log(`[Reconnect] Grace period expired for ${playerName} - processing disconnect`);

  const room = gameRooms.get(tableId);
  if (!room) {
    return;
  }

  try {
    const state = room.controller.getState();
    const player = state.players.find(p => p.id === playerId);

    if (!player) {
      log(`[Reconnect] Player ${playerName} no longer at table`);
      return;
    }

    const handInProgress = player.holeCards.length > 0 && state.currentStreet !== 'showdown';

    if (handInProgress) {
      // Fold if it's their turn
      if (player.status === 'active' && state.activePlayerPosition === player.seatPosition) {
        log(`[Reconnect] ${playerName} timed out - folding (it's their turn)`);
        try {
          const foldAction: GameAction = {
            type: 'fold',
            playerId,
            timestamp: new Date()
          };
          await room.controller.handleAction(foldAction);
        } catch (error) {
          console.error('[Reconnect] Error folding player:', error);
        }
      }

      // Mark as leaving
      room.controller.markPlayerAsLeaving(playerId);
      log(`[Reconnect] ${playerName} marked as leaving after timeout`);

      // Check if hand ended
      const updatedState = room.controller.getState();
      if (updatedState.currentStreet === 'showdown') {
        const remainingActivePlayers = updatedState.players.filter(p => !p.isLeaving);
        if (remainingActivePlayers.length < 2) {
          log(`[Reconnect] Cleaning up after timeout - not enough players`);
          const leavingPlayers = room.controller.removeLeavingPlayers();
          for (const leavingPlayer of leavingPlayers) {
            room.seatedPlayers.delete(leavingPlayer.id);
          }
          room.controller.resetToWaiting();
        }
      }
    } else {
      // No hand in progress - remove immediately
      room.controller.removePlayer(playerId);
      room.seatedPlayers.delete(playerId);
      log(`[Reconnect] ${playerName} removed after timeout (no hand in progress)`);

      const updatedState = room.controller.getState();
      const remainingPlayers = updatedState.players.filter(p => !p.isLeaving);
      if (remainingPlayers.length < 2 && updatedState.currentStreet === 'showdown') {
        room.controller.resetToWaiting();
      }
    }

    // Remove from spectators
    room.spectators.delete(playerId);

    // Broadcast updates
    const finalState = room.controller.getState();
    io.to(tableId).emit('player-disconnected', { playerId });
    io.to(tableId).emit('game-state', { table: finalState });

  } catch (error) {
    console.error('[Reconnect] Error handling disconnect timeout:', error);
  }
}

/**
 * Create HTTP server and Socket.IO instance
 */
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Health check endpoint for Render and other hosting platforms
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      tables: gameRooms.size,
      uptime: process.uptime()
    }));
    return;
  }
  // Return 404 for other routes
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Aggressive ping/pong to prevent Render's proxy from killing "idle" connections
  // Render and other cloud proxies terminate WebSocket connections they perceive as idle
  pingInterval: 10000,  // Send ping every 10 seconds (default: 25000)
  pingTimeout: 5000,    // Wait 5 seconds for pong response (default: 20000)
  // Allow both transports but prefer websocket
  transports: ['websocket', 'polling']
});

/**
 * Get or create a game room
 */
function getOrCreateRoom(config: TableConfig): GameRoom {
  let room = gameRooms.get(config.tableId);

  if (!room) {
    const initialState = createInitialTableState(
      config.tableId,
      config.name,
      config.smallBlind,
      config.bigBlind,
      config.minBuyIn,
      config.maxBuyIn
    );
    const controller = new HandController(initialState);

    room = {
      config,
      controller,
      spectators: new Map(),
      seatedPlayers: new Set()
    };

    setupControllerEventHandlers(controller, config.tableId);
    gameRooms.set(config.tableId, room);

    log(`[Table Created] ${config.name} (${config.tableId}) - SB: ${config.smallBlind}, BB: ${config.bigBlind}`);
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
  log('[Quickplay] Permanent quickplay table created');
}

/**
 * Setup event handlers to broadcast HandController events
 */
function setupControllerEventHandlers(controller: HandController, tableId: string): void {
  controller.on((event: HandEvent) => {
    // Handle error event separately (doesn't have table property)
    if (event.type === 'error') {
      console.error(`[Event][${tableId}] ERROR: ${event.error.message}`);
      io.to(tableId).emit('game-error', {
        message: event.error.message
      });
      return;
    }

    // Create log prefix with hand number for context
    const handNum = event.table.handNumber;
    const prefix = `[Event][Hand #${handNum}][${tableId}]`;

    switch (event.type) {
      case 'hand-started':
        io.to(tableId).emit('hand-started', { table: event.table });
        log(`${prefix} HAND STARTED - ${event.table.players.length} players`);
        break;

      case 'blinds-posted':
        io.to(tableId).emit('blinds-posted', { table: event.table });
        log(`${prefix} Blinds posted: pot=${event.table.pot}`);
        break;

      case 'cards-dealt':
        io.to(tableId).emit('cards-dealt', { table: event.table });
        log(`${prefix} Cards dealt to ${event.table.players.length} players`);
        break;

      case 'action-processed':
        const actor = event.table.players.find(p => p.id === event.action.playerId);
        const actorName = actor?.name || event.action.playerId;
        io.to(tableId).emit('action-processed', {
          table: event.table,
          action: event.action
        });
        log(`${prefix} ACTION: ${actorName} ${event.action.type}${event.action.amount ? ` ${event.action.amount}` : ''} | pot=${event.table.pot}`);
        break;

      case 'street-changed':
        const communityCards = event.table.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' ');
        io.to(tableId).emit('street-changed', {
          table: event.table,
          street: event.street
        });
        log(`${prefix} STREET -> ${event.street.toUpperCase()} | board=[${communityCards}] pot=${event.table.pot}`);
        break;

      case 'hand-completed':
        io.to(tableId).emit('hand-completed', {
          table: event.table,
          result: event.result
        });
        io.to(tableId).emit('game-state', { table: event.table });
        const winners = event.table.players.filter(p => p.isWinner).map(p => p.name);
        log(`${prefix} HAND COMPLETE - Winners: [${winners.join(', ')}] | Distributed: ${event.result.totalDistributed}`);
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
          }
        }

        // Broadcast updated game state
        io.to(tableId).emit('game-state', { table: event.table });
        io.to(tableId).emit('players-removed', { playerIds: event.removedPlayers.map(p => p.id) });
        log(`${prefix} PLAYERS REMOVED: [${event.removedPlayers.map(p => p.name).join(', ')}]`);
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
  log(`[Connection] Client connected: ${socket.id}`);

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
      log(`[Table Created] ${config.name} by ${socket.id}`);

    } catch (error) {
      console.error('[Create Table Error]', error);
      socket.emit('create-table-error', {
        message: error instanceof Error ? error.message : 'Failed to create table'
      });
    }
  });

  /**
   * Join a table as spectator (or reconnect if disconnected)
   */
  socket.on('join-room', (data: { tableId: string; playerId: string; playerName: string }) => {
    try {
      const { tableId, playerId, playerName } = data;

      const room = gameRooms.get(tableId);
      if (!room) {
        throw new Error('Table not found');
      }

      // Check if this is a reconnection
      const disconnectInfo = disconnectedPlayers.get(playerId);
      if (disconnectInfo && disconnectInfo.tableId === tableId) {
        // Cancel the disconnect timeout
        clearTimeout(disconnectInfo.timeoutId);
        disconnectedPlayers.delete(playerId);

        log(`[Reconnect] ${playerName} reconnected to ${tableId} within grace period!`);

        // Join Socket.IO room
        socket.join(tableId);

        // Store player info
        socket.data.tableId = tableId;
        socket.data.playerId = playerId;
        socket.data.playerName = playerName;
        socketToPlayer.set(socket.id, { playerId, playerName, tableId });

        // Send current game state
        const state = room.controller.getState();
        socket.emit('game-state', { table: state });

        // Notify others that player reconnected
        socket.to(tableId).emit('player-reconnected', {
          playerId,
          playerName
        });

        // Send seat availability
        const occupiedSeats = state.players.map(p => p.seatPosition);
        const availableSeats = Array.from({ length: room.config.maxSeats }, (_, i) => i + 1)
          .filter(seat => !occupiedSeats.includes(seat));
        socket.emit('seats-available', { availableSeats, occupiedSeats });

        return;
      }

      // Normal join (not a reconnection)
      // Join Socket.IO room
      socket.join(tableId);

      // Store player info
      socket.data.tableId = tableId;
      socket.data.playerId = playerId;
      socket.data.playerName = playerName;
      socketToPlayer.set(socket.id, { playerId, playerName, tableId });

      // Check if player is already seated (browser refresh scenario)
      const state = room.controller.getState();
      const existingPlayer = state.players.find(p => p.id === playerId);

      if (existingPlayer) {
        // Player is already seated - just reconnect them
        log(`[Join Room] ${playerName} rejoined ${tableId} (already seated at position ${existingPlayer.seatPosition})`);

        // Send current game state
        socket.emit('game-state', { table: state });

        // Notify others
        socket.to(tableId).emit('player-reconnected', {
          playerId,
          playerName
        });
      } else {
        // Add as spectator
        room.spectators.set(playerId, { id: playerId, name: playerName });

        // Send current game state
        socket.emit('game-state', { table: state });

        // Notify others
        socket.to(tableId).emit('spectator-joined', {
          playerId,
          playerName,
          spectatorCount: room.spectators.size
        });

        log(`[Join Room] ${playerName} joined ${tableId} as spectator`);
      }

      // Send seat availability (seats 1-9)
      const occupiedSeats = state.players.map(p => p.seatPosition);
      const availableSeats = Array.from({ length: room.config.maxSeats }, (_, i) => i + 1)
        .filter(seat => !occupiedSeats.includes(seat));

      socket.emit('seats-available', { availableSeats, occupiedSeats });

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


      // Check if player is already seated at the table
      const existingPlayer = state.players.find(p => p.id === playerId);
      if (existingPlayer) {
        if (existingPlayer.isLeaving) {
          // Player was leaving but changed their mind - cancel the leave request
          room.controller.unmarkPlayerAsLeaving(playerId);
          room.seatedPlayers.add(playerId);

          const updatedState = room.controller.getState();
          io.to(tableId).emit('game-state', { table: updatedState });

          log(`[Take Seat] ${existingPlayer.name} canceled leave request and is staying at seat ${existingPlayer.seatPosition} on ${tableId}`);
          return;
        }
        // Player is seated and not leaving - can't take another seat
        throw new Error('You are already seated at this table');
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

      log(`[Take Seat] ${spectator.name} sat at seat ${seatPosition} on ${tableId}`);

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
          log(`[Leave Seat] ${playerName} leaving mid-hand - folding and marking as leaving`);
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
        let updatedState = room.controller.getState();

        // Check if the fold caused the hand to end (now at showdown)
        // AND if all remaining players are also leaving
        if (updatedState.currentStreet === 'showdown') {
          const remainingActivePlayers = updatedState.players.filter(p => !p.isLeaving);
          if (remainingActivePlayers.length < 2) {
            // All players are leaving or only one remains - cleanup immediately
            log(`[Leave Seat] Hand ended and not enough active players remaining - cleaning up`);
            const leavingPlayers = room.controller.removeLeavingPlayers();
            for (const leavingPlayer of leavingPlayers) {
              room.seatedPlayers.delete(leavingPlayer.id);
              room.spectators.set(leavingPlayer.id, { id: leavingPlayer.id, name: leavingPlayer.name });
              log(`[Leave Seat] Removed leaving player ${leavingPlayer.name}`);
            }
            room.controller.resetToWaiting();
            updatedState = room.controller.getState();
          }
        }

        // Broadcast updated state (player still at table but folded and marked as leaving)
        io.to(tableId).emit('game-state', { table: updatedState });

        log(`[Leave Seat] ${playerName} marked as leaving, will be removed after hand`);

      } else if (state.currentStreet === 'showdown') {
        // At showdown: Hand is complete, player can leave immediately
        log(`[Leave Seat] ${playerName} leaving during showdown - removing immediately`);

        // Remove from seated players
        room.controller.removePlayer(playerId);
        room.seatedPlayers.delete(playerId);

        // Add back to spectators
        room.spectators.set(playerId, { id: playerId, name: playerName });

        // Get updated state after removal
        let updatedState = room.controller.getState();

        // Check if we need to reset to waiting (not enough players left)
        const remainingPlayers = updatedState.players.filter(p => !p.isLeaving);
        if (remainingPlayers.length < 2) {
          log(`[Leave Seat] Not enough players remaining (${remainingPlayers.length}) - resetting to waiting`);
          room.controller.resetToWaiting();
          updatedState = room.controller.getState();
        }

        // Broadcast updated state
        io.to(tableId).emit('game-state', { table: updatedState });
        io.to(tableId).emit('player-left-seat', {
          playerId,
          seatPosition,
          seatedCount: updatedState.players.length
        });

        log(`[Leave Seat] ${playerName} left seat on ${tableId}`);

      } else {
        // No hand in progress: Remove immediately
        log(`[Leave Seat] ${playerName} leaving between hands - removing immediately`);

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

        log(`[Leave Seat] ${playerName} left seat on ${tableId}`);
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
            log(`[Leave Room] ${player.name} leaving mid-hand - folding`);
            const foldAction: GameAction = {
              type: 'fold',
              playerId,
              timestamp: new Date()
            };
            await room.controller.handleAction(foldAction);
          }

          // Mark player as leaving
          room.controller.markPlayerAsLeaving(playerId);

          log(`[Leave Room] ${player.name} marked as leaving, will be removed after hand`);
        } else {
          // No hand in progress: Remove immediately
          room.controller.removePlayer(playerId);
          room.seatedPlayers.delete(playerId);
          log(`[Leave Room] ${player.name} removed from table`);
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

      log(`[Leave Room] ${playerId} left ${tableId}`);

      // Clean up non-quickplay empty rooms
      if (!room.config.isQuickplay && room.spectators.size === 0 && room.seatedPlayers.size === 0) {
        gameRooms.delete(tableId);
        io.emit('table-deleted', { tableId });
        log(`[Table Deleted] ${tableId} (empty)`);
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
      const currentHandNum = currentState.handNumber;
      const prefix = `[Socket][Hand #${currentHandNum}][${tableId}]`;

      const isActiveStreet = currentState.currentStreet !== 'showdown' && currentState.currentStreet !== 'pre-flop';
      const isPreflopWithAction = currentState.currentStreet === 'pre-flop' && currentState.activePlayerPosition !== null;
      const handInProgress = isActiveStreet || isPreflopWithAction;

      if (handInProgress) {
        log(`${prefix} Start hand IGNORED - hand already in progress (street=${currentState.currentStreet}, activePos=${currentState.activePlayerPosition})`);
        return;
      }

      log(`${prefix} Start hand request received`);
      log(`${prefix}   Current players: ${currentState.players.map(p => `${p.name}(stack:${p.stack})`).join(', ')}`);

      // First, cleanup any leaving players
      const leavingPlayers = room.controller.removeLeavingPlayers();
      if (leavingPlayers.length > 0) {
        // Move them to spectators
        for (const player of leavingPlayers) {
          room.seatedPlayers.delete(player.id);
          room.spectators.set(player.id, { id: player.id, name: player.name });
        }
        log(`${prefix} Removed leaving players: [${leavingPlayers.map(p => p.name).join(', ')}]`);
        io.to(tableId).emit('players-removed', { playerIds: leavingPlayers.map(p => p.id) });
      }

      // Remove players with 0 chips (they're busted)
      const bustedPlayers = room.controller.removeBustedPlayers();
      if (bustedPlayers.length > 0) {
        for (const player of bustedPlayers) {
          room.seatedPlayers.delete(player.id);
          room.spectators.set(player.id, { id: player.id, name: player.name });
        }
        log(`${prefix} Removed busted players (0 chips): [${bustedPlayers.map(p => p.name).join(', ')}]`);
        io.to(tableId).emit('players-removed', { playerIds: bustedPlayers.map(p => p.id) });
      }

      // Check if we have enough players to start
      // Note: players with small stacks (< BB) can still play - they'll go all-in on the blind
      const state = room.controller.getState();
      const activePlayers = state.players.filter(p => !p.isLeaving && p.stack > 0);

      if (activePlayers.length < 2) {
        // Not enough players - just reset to waiting state, don't try to start
        log(`${prefix} Not enough active players (${activePlayers.length}) - resetting to waiting`);
        room.controller.resetToWaiting();
        const updatedState = room.controller.getState();
        io.to(tableId).emit('game-state', { table: updatedState });
        return;
      }

      // Enough players - start the hand
      log(`${prefix} Starting new hand with ${activePlayers.length} players: [${activePlayers.map(p => `${p.name}(${p.stack})`).join(', ')}]`);
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
          log(`[Socket][${tableId}] Table reset to waiting state (not enough players)`);
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

      const state = room.controller.getState();
      const handNum = state.handNumber;
      const player = state.players.find(p => p.id === action.playerId);
      const playerName = player?.name || action.playerId;
      const prefix = `[Socket][Hand #${handNum}][${tableId}]`;

      log(`${prefix} Received action from ${playerName}: ${action.type}${action.amount ? ` ${action.amount}` : ''}`);
      log(`${prefix}   Current state: street=${state.currentStreet}, pot=${state.pot}, activePos=${state.activePlayerPosition}`);

      await room.controller.handleAction(action);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid action';
      console.error('[Action Error]', errorMessage, error);
      socket.emit('action-error', {
        message: errorMessage,
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
    log(`[Disconnect] Client disconnected: ${socket.id}`);

    const playerInfo = socketToPlayer.get(socket.id);
    if (playerInfo && playerInfo.tableId) {
      const { playerId, playerName, tableId } = playerInfo;
      const room = gameRooms.get(tableId);

      if (room) {
        const state = room.controller.getState();
        const player = state.players.find(p => p.id === playerId);

        // If player is seated, start reconnection grace period
        if (player) {
          log(`[Disconnect] ${player.name} disconnected - starting ${RECONNECT_GRACE_PERIOD / 1000}s grace period for reconnection`);

          // Cancel any existing timeout for this player
          const existingDisconnect = disconnectedPlayers.get(playerId);
          if (existingDisconnect) {
            clearTimeout(existingDisconnect.timeoutId);
          }

          // Start grace period timeout
          const timeoutId = setTimeout(() => {
            handleDisconnectTimeout(playerId);
          }, RECONNECT_GRACE_PERIOD);

          disconnectedPlayers.set(playerId, {
            playerId,
            playerName: player.name,
            tableId,
            disconnectedAt: new Date(),
            timeoutId
          });

          // Notify other players that this player is disconnected (but not removed yet)
          socket.to(tableId).emit('player-disconnected-temp', {
            playerId,
            playerName: player.name,
            gracePeriod: RECONNECT_GRACE_PERIOD
          });

        } else {
          // Player was just a spectator - remove immediately
          room.spectators.delete(playerId);
          log(`[Disconnect] Spectator ${playerName || playerId} removed from ${tableId}`);
        }

        // Clean up non-quickplay empty rooms (only if no seated players)
        if (!room.config.isQuickplay && room.spectators.size === 0 && room.seatedPlayers.size === 0) {
          // Check if any disconnected players might reconnect
          const hasDisconnectedPlayers = Array.from(disconnectedPlayers.values())
            .some(dp => dp.tableId === tableId);

          if (!hasDisconnectedPlayers) {
            gameRooms.delete(tableId);
            io.emit('table-deleted', { tableId });
            log(`[Table Deleted] ${tableId} (empty after disconnect)`);
          }
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

  log(`
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
  log('\n[Shutdown] Received SIGTERM, closing server...');
  httpServer.close(() => {
    log('[Shutdown] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('\n[Shutdown] Received SIGINT, closing server...');
  httpServer.close(() => {
    log('[Shutdown] Server closed');
    process.exit(0);
  });
});

/**
 * Handle uncaught exceptions to prevent silent crashes
 */
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error);
  console.error(error.stack);
  // Keep the server running but log the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
  console.error('Promise:', promise);
  // Keep the server running but log the error
});

export { io, httpServer, gameRooms };
