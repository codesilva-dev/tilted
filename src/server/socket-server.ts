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
    const initialState = createInitialTableState(config.tableId, config.smallBlind, config.bigBlind);
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
        console.log(`[Event] Hand completed at table ${tableId}`);
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
  socket.on('leave-seat', (data: { tableId: string; playerId: string }) => {
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

      // Remove from seated players
      state.players = state.players.filter(p => p.id !== playerId);
      room.seatedPlayers.delete(playerId);

      // Add back to spectators
      room.spectators.set(playerId, { id: playerId, name: player.name });

      // Broadcast updated state
      io.to(tableId).emit('game-state', { table: state });
      io.to(tableId).emit('player-left-seat', {
        playerId,
        seatPosition: player.seatPosition,
        seatedCount: state.players.length
      });

      console.log(`[Leave Seat] ${player.name} left seat on ${tableId}`);

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
  socket.on('leave-room', (data: { tableId: string; playerId: string }) => {
    try {
      const { tableId, playerId } = data;

      const room = gameRooms.get(tableId);
      if (!room) {
        return;
      }

      // Remove from spectators
      room.spectators.delete(playerId);

      // Remove from seated players
      const state = room.controller.getState();
      state.players = state.players.filter(p => p.id !== playerId);
      room.seatedPlayers.delete(playerId);

      socket.leave(tableId);
      socketToPlayer.delete(socket.id);

      // Notify others
      socket.to(tableId).emit('player-left-room', { playerId });

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

      console.log(`[Start Hand] Starting hand at table ${tableId}`);
      await room.controller.startHand();

    } catch (error) {
      console.error('[Start Hand Error]', error);
      socket.emit('action-error', {
        message: error instanceof Error ? error.message : 'Failed to start hand'
      });
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
  socket.on('disconnect', () => {
    console.log(`[Disconnect] Client disconnected: ${socket.id}`);

    const playerInfo = socketToPlayer.get(socket.id);
    if (playerInfo && playerInfo.tableId) {
      const { playerId, tableId } = playerInfo;
      const room = gameRooms.get(tableId);

      if (room) {
        // Remove from spectators and seated players
        room.spectators.delete(playerId);
        room.seatedPlayers.delete(playerId);

        const state = room.controller.getState();
        state.players = state.players.filter(p => p.id !== playerId);

        socket.to(tableId).emit('player-disconnected', { playerId });

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
