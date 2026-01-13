# Poker Socket.IO Server

This is the real-time WebSocket server for the Tilted poker application. It exposes the game engine over Socket.IO for multiplayer gameplay.

## Architecture

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

## Running the Server

### Development Mode

```bash
# Run socket server only
npm run dev:socket

# Run both Next.js and Socket.IO server
npm run dev:all
```

The socket server runs on **port 3001** by default.

### Production Mode

```bash
# Build TypeScript
tsc

# Start the server
npm run start:socket
```

## Environment Variables

```env
SOCKET_PORT=3001          # Socket.IO server port (default: 3001)
CLIENT_URL=http://localhost:3000  # Allowed CORS origin (default: http://localhost:3000)
```

## Socket.IO Events

### Client → Server

#### `join-table`
Join a poker table.

**Payload:**
```typescript
{
  tableId: string;      // Table ID
  playerId: string;     // Unique player ID
  playerName: string;   // Display name
  buyIn: number;        // Starting chip count
  seatPosition?: number; // Preferred seat (0-9), auto-assigned if not provided
}
```

**Response:** `game-state` event with current table state

**Error:** `join-error` event

#### `leave-table`
Leave a poker table.

**Payload:**
```typescript
{
  tableId: string;
  playerId: string;
}
```

#### `start-hand`
Start a new hand at the table.

**Payload:**
```typescript
{
  tableId: string;
}
```

**Error:** `action-error` event

#### `player-action`
Take a poker action (fold, check, call, bet, raise).

**Payload:**
```typescript
{
  tableId: string;
  action: {
    type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';
    playerId: string;
    amount?: number;  // Required for bet/raise
    timestamp: Date;
  }
}
```

**Error:** `action-error` event

#### `get-game-state`
Request current game state.

**Payload:**
```typescript
{
  tableId: string;
}
```

**Response:** `game-state` event

### Server → Client

#### `game-state`
Full game state (sent on join or when requested).

**Payload:**
```typescript
{
  table: TableState;
}
```

#### `player-joined`
A new player joined the table.

**Payload:**
```typescript
{
  playerId: string;
  playerName: string;
  seatPosition: number;
  stack: number;
}
```

#### `player-left`
A player left the table.

**Payload:**
```typescript
{
  playerId: string;
}
```

#### `player-disconnected`
A player disconnected unexpectedly.

**Payload:**
```typescript
{
  playerId: string;
}
```

#### `hand-started`
A new hand has started.

**Payload:**
```typescript
{
  table: TableState;
}
```

#### `blinds-posted`
Blinds have been posted.

**Payload:**
```typescript
{
  table: TableState;
}
```

#### `cards-dealt`
Hole cards have been dealt to players.

**Payload:**
```typescript
{
  table: TableState;
}
```

#### `action-processed`
A player's action was processed.

**Payload:**
```typescript
{
  table: TableState;
  action: GameAction;
}
```

#### `street-changed`
The game advanced to a new street (flop, turn, river).

**Payload:**
```typescript
{
  table: TableState;
  street: 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';
}
```

#### `hand-completed`
A hand finished and pots were distributed.

**Payload:**
```typescript
{
  table: TableState;
  result: HandResult;
}
```

#### Error Events

- `join-error`: Failed to join table
- `action-error`: Invalid action or action failed
- `state-error`: Failed to retrieve state
- `game-error`: General game error

All error events have:
```typescript
{
  message: string;
}
```

## Example Client Usage

### JavaScript (Browser)

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

// Join a table
socket.emit('join-table', {
  tableId: 'table-1',
  playerId: 'player-123',
  playerName: 'Alice',
  buyIn: 1000
});

// Listen for game state
socket.on('game-state', (data) => {
  console.log('Current game state:', data.table);
});

// Listen for actions
socket.on('action-processed', (data) => {
  console.log('Action:', data.action.type, 'by', data.action.playerId);
});

// Take an action
socket.emit('player-action', {
  tableId: 'table-1',
  action: {
    type: 'call',
    playerId: 'player-123',
    timestamp: new Date()
  }
});
```

### React Hook Example

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { TableState, GameAction } from '@/game/types/game-state';

export function useGameSocket(tableId: string, playerId: string, playerName: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<TableState | null>(null);

  useEffect(() => {
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);

    // Join table on connect
    newSocket.emit('join-table', {
      tableId,
      playerId,
      playerName,
      buyIn: 1000
    });

    // Listen for events
    newSocket.on('game-state', (data) => setGameState(data.table));
    newSocket.on('action-processed', (data) => setGameState(data.table));
    newSocket.on('street-changed', (data) => setGameState(data.table));
    newSocket.on('hand-completed', (data) => setGameState(data.table));

    return () => {
      newSocket.close();
    };
  }, [tableId, playerId, playerName]);

  const takeAction = (action: Omit<GameAction, 'timestamp'>) => {
    socket?.emit('player-action', {
      tableId,
      action: {
        ...action,
        timestamp: new Date()
      }
    });
  };

  const startHand = () => {
    socket?.emit('start-hand', { tableId });
  };

  return { gameState, takeAction, startHand };
}
```

## Room Management

- Each table is a separate Socket.IO room
- Rooms are created on-demand when first player joins
- Rooms are deleted when all players leave
- Each room has its own HandController instance

## Testing

### Manual Testing with Browser Console

```javascript
// Open browser console at http://localhost:3000
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

### Testing with Multiple Tabs

1. Open multiple browser tabs
2. Join the same table with different player IDs
3. Use one tab to emit events
4. Verify other tabs receive updates

## Security Considerations (TODO)

For production, implement:

- [ ] Authentication token validation
- [ ] Rate limiting
- [ ] Input sanitization
- [ ] Private hole cards (only send to respective players)
- [ ] Reconnection with session recovery
- [ ] Player balance verification with database

## Troubleshooting

### Port already in use
```bash
# Find process using port 3001
lsof -i :3001  # macOS/Linux
netstat -ano | findstr :3001  # Windows

# Kill the process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

### CORS errors
Ensure `CLIENT_URL` environment variable matches your frontend URL.

### Socket won't connect
1. Check socket server is running: `npm run dev:socket`
2. Check port 3001 is accessible
3. Check browser console for errors
4. Verify Socket.IO client version matches server

## Next Steps

- [ ] Add authentication/authorization
- [ ] Implement database persistence
- [ ] Add lobby system for table management
- [ ] Implement spectator mode
- [ ] Add chat functionality
- [ ] Implement reconnection logic
- [ ] Add comprehensive logging
