# Phase 5: Socket.IO Server Layer - Complete Implementation Guide

## Overview

Now that the game engine works perfectly in isolation (283 tests passing!), it's time to **expose it over WebSockets** so multiple players can connect and play together in real-time.

**Time estimate:** 3-4 hours
**Difficulty:** Intermediate (networking + async patterns)
**Prerequisites:** Steps 1-3 completed (game engine fully tested)

---

## Philosophy: Thin Wrapper Pattern

The Socket.IO server is a **thin wrapper** around your game engine:

```
┌─────────────┐         ┌──────────────────┐         ┌───────────────┐
│   Clients   │  <--->  │  Socket.IO       │  <--->  │ HandController│
│  (Browsers) │   WS    │  Server          │         │ (Game Engine) │
└─────────────┘         └──────────────────┘         └───────────────┘
                               │
                               ├─ Room Management
                               ├─ Event Broadcasting
                               └─ Error Handling
```

**Key concept:** The game engine has NO knowledge of Socket.IO. It just emits events. The Socket.IO server listens to those events and broadcasts them to clients.

**Why this matters:**
- Game engine stays 100% testable (no networking code)
- Can swap Socket.IO for WebRTC, HTTP polling, etc. without touching game logic
- Debugging is easier (can test engine and networking separately)

---

## File Structure

```
src/server/
├── socket-server.ts     # Main Socket.IO server
├── test-client.ts       # Test client for manual testing
└── README.md            # API documentation
```

---

## Part 1: Server Setup

### 1.1 Dependencies

Install required packages:

```bash
npm install socket.io
npm install --save-dev @types/socket.io socket.io-client ts-node-dev concurrently
```

**What these do:**
- `socket.io` - WebSocket server library
- `@types/socket.io` - TypeScript types
- `socket.io-client` - For testing (client side)
- `ts-node-dev` - Run TypeScript in dev mode with auto-reload
- `concurrently` - Run Next.js and Socket.IO server together

### 1.2 Basic Server Structure

**File:** `src/server/socket-server.ts`

```typescript
import { Server, Socket } from 'socket.io';
import { createServer } from 'http';
import { HandController, HandEvent } from '../game/engine/hand-controller';
import { TableState, GameAction, createInitialTableState } from '../game/types/game-state';

// Configuration
const PORT = process.env.SOCKET_PORT ? parseInt(process.env.SOCKET_PORT) : 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// Create HTTP server and Socket.IO instance
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
```

**Design decisions:**
- **Separate port (3001) from Next.js (3000):** Keeps concerns separated. Frontend is static, backend is real-time.
- **CORS enabled:** Frontend on localhost:3000 can connect to localhost:3001
- **Environment variables:** Easy to configure for production

---

## Part 2: Room Management

### 2.1 Game Room Structure

Each poker table is a separate Socket.IO room. Multiple rooms can exist simultaneously.

```typescript
interface GameRoom {
  tableId: string;
  controller: HandController;  // Game engine instance
  players: Set<string>;        // Player IDs in this room
}

// Store all active game rooms
const gameRooms = new Map<string, GameRoom>();
```

**Why Map?** Fast lookups by tableId. Each room is isolated.

### 2.2 Get or Create Room

```typescript
function getOrCreateRoom(tableId: string, smallBlind: number = 10, bigBlind: number = 20): GameRoom {
  let room = gameRooms.get(tableId);

  if (!room) {
    // Create initial table state
    const initialState = createInitialTableState(tableId, smallBlind, bigBlind);
    const controller = new HandController(initialState);

    room = {
      tableId,
      controller,
      players: new Set()
    };

    // Wire up HandController events to Socket.IO broadcasts
    setupControllerEventHandlers(controller, tableId);

    gameRooms.set(tableId, room);
    console.log(`[Room Created] Table ${tableId}`);
  }

  return room;
}
```

**Key points:**
- Rooms are created on-demand (lazy initialization)
- Each room has its own HandController instance
- State is isolated between rooms

### 2.3 Event Wiring

This is where the magic happens - connecting game engine events to Socket.IO:

```typescript
function setupControllerEventHandlers(controller: HandController, tableId: string): void {
  controller.on((event: HandEvent) => {
    switch (event.type) {
      case 'hand-started':
        io.to(tableId).emit('hand-started', { table: event.table });
        break;

      case 'blinds-posted':
        io.to(tableId).emit('blinds-posted', { table: event.table });
        break;

      case 'cards-dealt':
        io.to(tableId).emit('cards-dealt', { table: event.table });
        break;

      case 'action-processed':
        io.to(tableId).emit('action-processed', {
          table: event.table,
          action: event.action
        });
        break;

      case 'street-changed':
        io.to(tableId).emit('street-changed', {
          table: event.table,
          street: event.street
        });
        break;

      case 'hand-completed':
        io.to(tableId).emit('hand-completed', {
          table: event.table,
          result: event.result
        });
        break;

      case 'error':
        io.to(tableId).emit('game-error', {
          message: event.error.message
        });
        break;
    }
  });
}
```

**What `io.to(tableId).emit()` does:**
- Broadcasts event to ALL clients in that room
- Clients in other rooms don't receive it
- Automatic filtering by Socket.IO

---

## Part 3: Client Event Handlers

### 3.1 Connection Handler

```typescript
io.on('connection', (socket: Socket) => {
  console.log(`[Connection] Client connected: ${socket.id}`);

  // All event handlers go here...
});
```

### 3.2 Join Table Event

```typescript
socket.on('join-table', async (data: {
  tableId: string;
  playerId: string;
  playerName: string;
  buyIn: number;
  seatPosition?: number;
}) => {
  try {
    const { tableId, playerId, playerName, buyIn, seatPosition } = data;

    // Join Socket.IO room
    socket.join(tableId);

    // Store player's table association on socket
    socket.data.tableId = tableId;
    socket.data.playerId = playerId;

    // Get or create game room
    const room = getOrCreateRoom(tableId);
    room.players.add(playerId);

    // Add player to game state
    const currentState = room.controller.getState();

    // Find available seat
    let seat = seatPosition;
    if (seat === undefined) {
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
    const player = createPlayer(playerId, playerName, seat, buyIn);
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

  } catch (error) {
    console.error('[Join Error]', error);
    socket.emit('join-error', {
      message: error instanceof Error ? error.message : 'Failed to join table'
    });
  }
});
```

**Key points:**
- `socket.join(tableId)` - Adds socket to room
- `socket.data` - Store player info on socket for later reference
- `socket.emit()` - Send to THIS client only
- `socket.to(tableId).emit()` - Send to OTHER clients in room

### 3.3 Player Action Event

```typescript
socket.on('player-action', async (data: {
  tableId: string;
  action: GameAction
}) => {
  try {
    const { tableId, action } = data;

    const room = gameRooms.get(tableId);
    if (!room) {
      throw new Error('Table not found');
    }

    console.log(`[Action] Player ${action.playerId}: ${action.type}${action.amount ? ` ${action.amount}` : ''}`);

    // Process the action through the game controller
    // Controller will emit events automatically
    await room.controller.handleAction(action);

  } catch (error) {
    console.error('[Action Error]', error);
    socket.emit('action-error', {
      message: error instanceof Error ? error.message : 'Invalid action',
      action: data.action
    });
  }
});
```

**Pattern:**
1. Validate request
2. Get game room
3. Call controller method
4. Controller emits events automatically
5. Events get broadcast to all players (via setupControllerEventHandlers)

### 3.4 Start Hand Event

```typescript
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
```

### 3.5 Disconnect Handler

```typescript
socket.on('disconnect', () => {
  console.log(`[Disconnect] Client disconnected: ${socket.id}`);

  // Clean up player from their table
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
```

**Cleanup strategy:**
- Remove player from room
- If room is empty, delete it
- Prevents memory leaks

---

## Part 4: NPM Scripts

Update `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:socket": "ts-node-dev --respawn --transpile-only src/server/socket-server.ts",
    "dev:all": "concurrently \"npm run dev\" \"npm run dev:socket\"",
    "start:socket": "node dist/server/socket-server.js",
    "test:socket": "ts-node src/server/test-client.ts"
  }
}
```

**Usage:**
```bash
# Run both servers together
npm run dev:all

# Or separately:
npm run dev          # Next.js (port 3000)
npm run dev:socket   # Socket.IO (port 3001)

# Test the socket server
npm run test:socket
```

---

## Part 5: Test Client

**File:** `src/server/test-client.ts`

Create a simple client to test the server without building a frontend:

```typescript
import { io, Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';
const TABLE_ID = 'test-table-1';

const players = [
  { id: 'player-1', name: 'Alice', buyIn: 1000 },
  { id: 'player-2', name: 'Bob', buyIn: 1000 },
  { id: 'player-3', name: 'Charlie', buyIn: 1000 }
];

function setupPlayer(playerId: string, playerName: string, buyIn: number): Socket {
  const socket = io(SERVER_URL);

  socket.on('connect', () => {
    console.log(`[${playerName}] Connected`);

    socket.emit('join-table', {
      tableId: TABLE_ID,
      playerId,
      playerName,
      buyIn
    });
  });

  socket.on('game-state', (data) => {
    console.log(`[${playerName}] Game state received`);
  });

  socket.on('hand-started', () => {
    console.log(`[${playerName}] Hand started!`);
  });

  socket.on('action-processed', (data) => {
    console.log(`[${playerName}] Action: ${data.action.type}`);
  });

  return socket;
}

// Connect all players
const sockets: Socket[] = [];
for (const player of players) {
  const socket = setupPlayer(player.id, player.name, player.buyIn);
  sockets.push(socket);
}

// Simulate some actions after delay
setTimeout(() => {
  console.log('\n>>> Starting hand...');
  sockets[0].emit('start-hand', { tableId: TABLE_ID });
}, 2000);

setTimeout(() => {
  console.log('\n>>> Player 1 calls...');
  sockets[0].emit('player-action', {
    tableId: TABLE_ID,
    action: {
      type: 'call',
      playerId: 'player-1',
      timestamp: new Date()
    }
  });
}, 4000);
```

**Run with:**
```bash
npm run test:socket
```

---

## Part 6: API Documentation

**File:** `src/server/README.md`

Create comprehensive API docs for frontend developers:

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `join-table` | `{ tableId, playerId, playerName, buyIn, seatPosition? }` | Join a poker table |
| `leave-table` | `{ tableId, playerId }` | Leave a table |
| `start-hand` | `{ tableId }` | Start a new hand |
| `player-action` | `{ tableId, action }` | Take action (fold/check/call/bet/raise) |
| `get-game-state` | `{ tableId }` | Request current state |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `game-state` | `{ table }` | Full game state |
| `player-joined` | `{ playerId, playerName, seatPosition, stack }` | New player joined |
| `player-left` | `{ playerId }` | Player left |
| `hand-started` | `{ table }` | New hand started |
| `blinds-posted` | `{ table }` | Blinds posted |
| `cards-dealt` | `{ table }` | Cards dealt |
| `action-processed` | `{ table, action }` | Action processed |
| `street-changed` | `{ table, street }` | Advanced to next street |
| `hand-completed` | `{ table, result }` | Hand finished |

---

## Part 7: Testing Strategy

### 7.1 Manual Testing with Browser Console

Open browser console at `http://localhost:3000`:

```javascript
const socket = io('http://localhost:3001');

socket.on('connect', () => console.log('Connected!'));
socket.on('game-state', (data) => console.log('State:', data));

socket.emit('join-table', {
  tableId: 'test-1',
  playerId: 'test-player',
  playerName: 'Test Player',
  buyIn: 1000
});
```

### 7.2 Multiple Browser Tabs

1. Open 3+ browser tabs
2. Each tab connects with different player ID
3. Join same table ID
4. Use one tab to start hand
5. Verify all tabs receive updates

### 7.3 Test Client Script

```bash
# Terminal 1: Start server
npm run dev:socket

# Terminal 2: Run test client (simulates 3 players)
npm run test:socket
```

### 7.4 Chrome DevTools

1. Open DevTools → Network tab
2. Filter by "WS" (WebSocket)
3. Click on the WebSocket connection
4. View messages in real-time

---

## Part 8: Common Issues & Solutions

### Issue: CORS Error

**Symptom:** `Access-Control-Allow-Origin` error in browser console

**Fix:** Ensure `CLIENT_URL` matches your frontend URL exactly:
```typescript
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
```

### Issue: Port Already in Use

**Symptom:** `EADDRINUSE: address already in use`

**Fix:** Find and kill the process:
```bash
# macOS/Linux
lsof -ti:3001 | xargs kill -9

# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

### Issue: Events Not Broadcasting

**Symptom:** One client receives events, others don't

**Debug:**
1. Check clients joined the same room (`socket.join(tableId)`)
2. Verify using `io.to(tableId).emit()` not `socket.emit()`
3. Check tableId matches exactly (case-sensitive)

### Issue: State Not Persisting

**Symptom:** Server restart loses all games

**Expected:** This is normal! State is in-memory only. Add database persistence in Phase 6.

---

## Part 9: Environment Variables

Create `.env.local`:

```env
# Socket.IO server port
SOCKET_PORT=3001

# Allowed CORS origin (your frontend URL)
CLIENT_URL=http://localhost:3000

# For production
# SOCKET_PORT=443
# CLIENT_URL=https://yourapp.vercel.app
```

---

## Part 10: Security Considerations (Future)

For production deployment, add:

- [ ] **Authentication:** Verify JWT tokens on connection
- [ ] **Rate limiting:** Prevent spam/DoS attacks
- [ ] **Input validation:** Sanitize all incoming data
- [ ] **Private hole cards:** Don't broadcast hole cards to other players
- [ ] **Reconnection handling:** Resume game state after disconnect
- [ ] **Admin events:** Server-side actions (kick player, pause table)

---

## Validation Checklist

Before moving to Phase 6 (Database Persistence):

- [ ] Socket.IO server starts without errors
- [ ] Clients can connect from browser
- [ ] Players can join tables
- [ ] Rooms are created/deleted correctly
- [ ] Hand can be started
- [ ] Actions are processed and broadcast
- [ ] All game events reach all players in room
- [ ] Disconnects are handled gracefully
- [ ] Test client works with 3+ players
- [ ] No memory leaks (rooms are cleaned up)

---

## Summary

You've built a complete real-time multiplayer backend that:

✅ Exposes the game engine over WebSockets
✅ Manages multiple game rooms simultaneously
✅ Broadcasts state changes to all players
✅ Handles connections/disconnections
✅ Is fully testable without a frontend

**What you have now:**
- 283 tests passing (game engine)
- Socket.IO server running on port 3001
- Complete API for frontend developers
- Test client for manual verification

**What's next:**
- Phase 6: Add database persistence (save/load games)
- Phase 7: Build React frontend UI

The hard part (game logic) is done. The networking layer is done. Now it's time to make it look pretty! 🎨

---

## Quick Reference

```bash
# Start everything
npm run dev:all

# Test socket server
npm run test:socket

# Check server logs
# Look for: [Connection], [Join], [Action], [Error]

# Browser console test
const socket = io('http://localhost:3001')
socket.on('game-state', console.log)
socket.emit('join-table', { tableId: 't1', playerId: 'p1', playerName: 'Test', buyIn: 1000 })
```

Your poker game is now multiplayer! 🎰🚀
