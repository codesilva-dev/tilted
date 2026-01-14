"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameRooms = exports.httpServer = exports.io = void 0;
const socket_io_1 = require("socket.io");
const http_1 = require("http");
const hand_controller_1 = require("../game/engine/hand-controller");
const game_state_1 = require("../game/types/game-state");
/**
 * Socket.IO Server for real-time poker game communication
 *
 * This server:
 * - Manages multiple game tables as separate rooms
 * - Each table has its own HandController instance
 * - Broadcasts game state changes to all players at a table
 * - Handles player actions (fold, check, call, bet, raise)
 */
// Port configuration
// Railway and other platforms set PORT env var, use that if available
const PORT = process.env.PORT
    ? parseInt(process.env.PORT)
    : process.env.SOCKET_PORT
        ? parseInt(process.env.SOCKET_PORT)
        : 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const gameRooms = new Map();
exports.gameRooms = gameRooms;
/**
 * Create HTTP server and Socket.IO instance
 */
const httpServer = (0, http_1.createServer)();
exports.httpServer = httpServer;
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: CLIENT_URL,
        methods: ['GET', 'POST'],
        credentials: true
    }
});
exports.io = io;
/**
 * Get or create a game room
 */
function getOrCreateRoom(tableId, smallBlind = 10, bigBlind = 20) {
    let room = gameRooms.get(tableId);
    if (!room) {
        // Create initial table state
        const initialState = (0, game_state_1.createInitialTableState)(tableId, smallBlind, bigBlind);
        const controller = new hand_controller_1.HandController(initialState);
        room = {
            tableId,
            controller,
            players: new Set()
        };
        // Wire up HandController events to Socket.IO broadcasts
        setupControllerEventHandlers(controller, tableId);
        gameRooms.set(tableId, room);
        console.log(`[Room Created] Table ${tableId} (SB: ${smallBlind}, BB: ${bigBlind})`);
    }
    return room;
}
/**
 * Setup event handlers to broadcast HandController events to all clients in a room
 */
function setupControllerEventHandlers(controller, tableId) {
    controller.on((event) => {
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
                // Send full state to all players (in production, should send hole cards only to respective players)
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
 * Handle client connections
 */
io.on('connection', (socket) => {
    console.log(`[Connection] Client connected: ${socket.id}`);
    /**
     * Client joins a table
     * Payload: { tableId: string, playerId: string, playerName: string, buyIn: number }
     */
    socket.on('join-table', async (data) => {
        try {
            const { tableId, playerId, playerName, buyIn, seatPosition } = data;
            console.log(`[Join] Player ${playerName} (${playerId}) joining table ${tableId} with ${buyIn} chips`);
            // Join Socket.IO room
            socket.join(tableId);
            // Store player's table association
            socket.data.tableId = tableId;
            socket.data.playerId = playerId;
            // Get or create game room
            const room = getOrCreateRoom(tableId);
            room.players.add(playerId);
            // Add player to game state
            const currentState = room.controller.getState();
            // Find available seat or use specified position
            let seat = seatPosition;
            if (seat === undefined) {
                // Find first available seat
                const occupiedSeats = currentState.players.map(p => p.seatPosition);
                for (let i = 0; i < 10; i++) {
                    if (!occupiedSeats.includes(i)) {
                        seat = i;
                        break;
                    }
                }
            }
            if (seat === undefined) {
                throw new Error('No available seats at this table');
            }
            // Create player and add to table
            const player = (0, game_state_1.createPlayer)(playerId, playerName, seat, buyIn);
            currentState.players.push(player);
            // Send current game state to the joining player
            socket.emit('game-state', { table: currentState });
            // Notify other players
            socket.to(tableId).emit('player-joined', {
                playerId,
                playerName,
                seatPosition: seat,
                stack: buyIn
            });
            console.log(`[Join] Player ${playerName} joined table ${tableId} at seat ${seat}`);
        }
        catch (error) {
            console.error('[Join Error]', error);
            socket.emit('join-error', {
                message: error instanceof Error ? error.message : 'Failed to join table'
            });
        }
    });
    /**
     * Client leaves a table
     */
    socket.on('leave-table', (data) => {
        try {
            const { tableId, playerId } = data;
            socket.leave(tableId);
            const room = gameRooms.get(tableId);
            if (room) {
                room.players.delete(playerId);
                // Remove player from game state
                const currentState = room.controller.getState();
                currentState.players = currentState.players.filter(p => p.id !== playerId);
                // Notify others
                socket.to(tableId).emit('player-left', { playerId });
                console.log(`[Leave] Player ${playerId} left table ${tableId}`);
                // Clean up empty rooms
                if (room.players.size === 0) {
                    gameRooms.delete(tableId);
                    console.log(`[Room Deleted] Table ${tableId} (no players remaining)`);
                }
            }
        }
        catch (error) {
            console.error('[Leave Error]', error);
        }
    });
    /**
     * Client starts a hand
     */
    socket.on('start-hand', async (data) => {
        try {
            const { tableId } = data;
            const room = gameRooms.get(tableId);
            if (!room) {
                throw new Error('Table not found');
            }
            console.log(`[Start Hand] Starting hand at table ${tableId}`);
            await room.controller.startHand();
        }
        catch (error) {
            console.error('[Start Hand Error]', error);
            socket.emit('action-error', {
                message: error instanceof Error ? error.message : 'Failed to start hand'
            });
        }
    });
    /**
     * Client takes an action (fold, check, call, bet, raise)
     */
    socket.on('player-action', async (data) => {
        try {
            const { tableId, action } = data;
            const room = gameRooms.get(tableId);
            if (!room) {
                throw new Error('Table not found');
            }
            console.log(`[Action] Player ${action.playerId} at table ${tableId}: ${action.type}${action.amount ? ` ${action.amount}` : ''}`);
            // Process the action through the game controller
            await room.controller.handleAction(action);
        }
        catch (error) {
            console.error('[Action Error]', error);
            socket.emit('action-error', {
                message: error instanceof Error ? error.message : 'Invalid action',
                action: data.action
            });
        }
    });
    /**
     * Client requests current game state
     */
    socket.on('get-game-state', (data) => {
        try {
            const { tableId } = data;
            const room = gameRooms.get(tableId);
            if (!room) {
                throw new Error('Table not found');
            }
            socket.emit('game-state', { table: room.controller.getState() });
        }
        catch (error) {
            console.error('[Get State Error]', error);
            socket.emit('state-error', {
                message: error instanceof Error ? error.message : 'Failed to get game state'
            });
        }
    });
    /**
     * Handle client disconnect
     */
    socket.on('disconnect', () => {
        console.log(`[Disconnect] Client disconnected: ${socket.id}`);
        // Clean up player from their table if they were in one
        const tableId = socket.data.tableId;
        const playerId = socket.data.playerId;
        if (tableId && playerId) {
            const room = gameRooms.get(tableId);
            if (room) {
                room.players.delete(playerId);
                // Notify others
                socket.to(tableId).emit('player-disconnected', { playerId });
                console.log(`[Disconnect] Player ${playerId} disconnected from table ${tableId}`);
                // Clean up empty rooms
                if (room.players.size === 0) {
                    gameRooms.delete(tableId);
                    console.log(`[Room Deleted] Table ${tableId} (no players remaining)`);
                }
            }
        }
    });
});
/**
 * Start the server
 */
httpServer.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║     Poker Socket.IO Server                           ║
║     Port: ${PORT}                                      ║
║     Client URL: ${CLIENT_URL}                         ║
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
