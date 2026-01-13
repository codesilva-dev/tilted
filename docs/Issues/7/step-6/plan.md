# Step 7.1: Socket.IO Client Hook - Complete Implementation Guide

## Overview

You've built a complete poker backend (283 tests passing + Socket.IO server). Now it's time to **connect the frontend** so players can see the game and take actions from their browser.

This step creates a React hook that manages the WebSocket connection to your Socket.IO server. Think of it as the "bridge" between your game engine and the UI.

**Time estimate:** 2-3 hours
**Difficulty:** Intermediate (React hooks + async networking)
**Prerequisites:**
- Socket.IO server running (Step 5 completed)
- Understanding of React hooks (useState, useEffect, useRef)
- Next.js App Router basics

---

## Philosophy: Separation of Concerns

The hook follows the **Container/Presenter** pattern:

```
┌─────────────────────┐
│   UI Components     │  ← Just display data
│   (Presentational)  │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│   useGameSocket     │  ← Manages all networking
│   (Container Hook)  │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│   Socket.IO Server  │
└─────────────────────┘
```

**Benefits:**
- UI components don't know about Socket.IO
- Easy to test components in isolation
- Can swap networking layer without touching UI
- State management centralized in one place

---

## File Structure

```
src/app/game/[tableId]/
├── use-game-socket.ts     # Socket.IO client hook (this step)
├── page.tsx               # Game table page (Step 7.2)
└── components/            # UI components (Step 7.2)
    ├── PokerTable.tsx
    ├── PlayerSeat.tsx
    ├── CommunityCards.tsx
    └── ActionButtons.tsx
```

We're creating a **dynamic route** `[tableId]` so users can join any table via URL: `/game/table-1`, `/game/table-2`, etc.

---

## Part 1: Dependencies & Setup

### 1.1 Install Socket.IO Client

```bash
npm install socket.io-client
```

**Already installed** (we added it in Step 5 for testing). Verify in `package.json`:
```json
{
  "dependencies": {
    "socket.io-client": "^4.8.3"
  }
}
```

### 1.2 TypeScript Types

We'll import types from our game engine:

```typescript
import type { TableState, GameAction } from '@/game/types/game-state';
import type { Socket } from 'socket.io-client';
```

**Why use existing types?** Ensures frontend and backend stay in sync. If you change `TableState`, TypeScript will catch mismatches.

---

## Part 2: Hook Structure

### 2.1 Basic Hook Signature

**File:** `src/app/game/[tableId]/use-game-socket.ts`

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TableState, GameAction } from '@/game/types/game-state';

interface UseGameSocketOptions {
  tableId: string;
  playerId: string;
  playerName: string;
  buyIn: number;
}

interface UseGameSocketReturn {
  // State
  gameState: TableState | null;
  isConnected: boolean;
  error: string | null;

  // Actions
  startHand: () => void;
  takeAction: (action: Omit<GameAction, 'timestamp'>) => void;

  // Connection
  disconnect: () => void;
}

export function useGameSocket(options: UseGameSocketOptions): UseGameSocketReturn {
  // Implementation goes here...
}
```

**Design decisions:**

**Q: Why separate `playerId` and `playerName`?**
A: `playerId` is the unique identifier (from auth), `playerName` is display name. Could be different.

**Q: Why `Omit<GameAction, 'timestamp'>`?**
A: Hook adds timestamp automatically. Caller shouldn't worry about it.

**Q: Why return `isConnected`?**
A: UI can show connection status ("Connecting...", "Disconnected", "Connected").

---

## Part 3: State Management

### 3.1 Local State

```typescript
export function useGameSocket(options: UseGameSocketOptions): UseGameSocketReturn {
  const { tableId, playerId, playerName, buyIn } = options;

  // Game state from server
  const [gameState, setGameState] = useState<TableState | null>(null);

  // Connection status
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Error messages
  const [error, setError] = useState<string | null>(null);

  // Socket instance (persists across renders)
  const socketRef = useRef<Socket | null>(null);

  // ... rest of implementation
}
```

**Why `useRef` for socket?**
- Socket should persist across renders
- Changing socket shouldn't trigger re-renders
- Need to access socket in event handlers

**State flow:**
```
Connect → isConnected=false
↓
Server sends 'connect' → isConnected=true
↓
Server sends 'game-state' → gameState updates → UI re-renders
↓
Player clicks button → takeAction() → Server processes → 'action-processed' → gameState updates
```

---

## Part 4: Connection Management

### 4.1 Connection Effect

```typescript
useEffect(() => {
  // Don't reconnect if already connected
  if (socketRef.current) return;

  console.log('[Socket] Connecting to server...');

  // Create socket connection
  const socket = io('http://localhost:3001', {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
  });

  socketRef.current = socket;

  // Setup event listeners
  setupEventListeners(socket);

  // Join table on connect
  socket.on('connect', () => {
    console.log('[Socket] Connected!');
    setIsConnected(true);
    setError(null);

    socket.emit('join-table', {
      tableId,
      playerId,
      playerName,
      buyIn
    });
  });

  // Cleanup on unmount
  return () => {
    console.log('[Socket] Disconnecting...');
    socket.disconnect();
    socketRef.current = null;
  };
}, [tableId, playerId, playerName, buyIn]);
```

**Connection options explained:**

- `transports: ['websocket']` - Use WebSocket only (faster than polling)
- `reconnection: true` - Auto-reconnect on disconnect
- `reconnectionDelay: 1000` - Wait 1s before reconnecting
- `reconnectionAttempts: 5` - Try 5 times before giving up

**Why join on 'connect' event?**
- Socket might reconnect after network issues
- Need to re-join table each time we connect

### 4.2 Connection Status Handlers

```typescript
socket.on('connect', () => {
  console.log('[Socket] Connected!');
  setIsConnected(true);
  setError(null);

  // Re-join table (important for reconnections)
  socket.emit('join-table', {
    tableId,
    playerId,
    playerName,
    buyIn
  });
});

socket.on('disconnect', (reason) => {
  console.log('[Socket] Disconnected:', reason);
  setIsConnected(false);

  if (reason === 'io server disconnect') {
    // Server kicked us out, don't reconnect
    setError('Disconnected by server');
  }
});

socket.on('connect_error', (error) => {
  console.error('[Socket] Connection error:', error);
  setIsConnected(false);
  setError(`Connection failed: ${error.message}`);
});
```

**Disconnect reasons:**
- `'io server disconnect'` - Server forcibly closed connection
- `'io client disconnect'` - We called `socket.disconnect()`
- `'ping timeout'` - Network issues
- `'transport close'` - Connection dropped

---

## Part 5: Game Event Listeners

### 5.1 Setup Event Listeners Function

```typescript
function setupEventListeners(socket: Socket) {
  // Full game state (received on join or when requested)
  socket.on('game-state', (data: { table: TableState }) => {
    console.log('[Socket] Game state received');
    setGameState(data.table);
  });

  // Another player joined
  socket.on('player-joined', (data: {
    playerId: string;
    playerName: string;
    seatPosition: number;
    stack: number;
  }) => {
    console.log('[Socket] Player joined:', data.playerName);
    // Full state will come next, so we don't update manually
  });

  // Player left
  socket.on('player-left', (data: { playerId: string }) => {
    console.log('[Socket] Player left:', data.playerId);
  });

  // Hand started
  socket.on('hand-started', (data: { table: TableState }) => {
    console.log('[Socket] Hand started!');
    setGameState(data.table);
  });

  // Blinds posted
  socket.on('blinds-posted', (data: { table: TableState }) => {
    console.log('[Socket] Blinds posted');
    setGameState(data.table);
  });

  // Cards dealt
  socket.on('cards-dealt', (data: { table: TableState }) => {
    console.log('[Socket] Cards dealt');
    setGameState(data.table);
  });

  // Action processed
  socket.on('action-processed', (data: {
    table: TableState;
    action: GameAction;
  }) => {
    console.log('[Socket] Action:', data.action.type, 'by', data.action.playerId);
    setGameState(data.table);
  });

  // Street changed (flop, turn, river)
  socket.on('street-changed', (data: {
    table: TableState;
    street: string;
  }) => {
    console.log('[Socket] Street changed to:', data.street);
    setGameState(data.table);
  });

  // Hand completed
  socket.on('hand-completed', (data: {
    table: TableState;
    result: any;
  }) => {
    console.log('[Socket] Hand completed!');
    console.log('Winners:', data.result.potResults);
    setGameState(data.table);
  });

  // Errors
  socket.on('join-error', (data: { message: string }) => {
    console.error('[Socket] Join error:', data.message);
    setError(`Failed to join: ${data.message}`);
  });

  socket.on('action-error', (data: { message: string }) => {
    console.error('[Socket] Action error:', data.message);
    setError(`Invalid action: ${data.message}`);

    // Clear error after 3 seconds
    setTimeout(() => setError(null), 3000);
  });

  socket.on('game-error', (data: { message: string }) => {
    console.error('[Socket] Game error:', data.message);
    setError(`Game error: ${data.message}`);
  });
}
```

**Pattern:**
- Every event that includes `table` updates `gameState`
- Full state replacement (no merging) - simple and reliable
- Errors are temporary (auto-clear after 3s)

**Why not optimize with partial updates?**
- Premature optimization
- Full state is small (~1-5KB)
- Simpler = fewer bugs
- Can optimize later if needed

---

## Part 6: Action Methods

### 6.1 Start Hand Action

```typescript
const startHand = useCallback(() => {
  if (!socketRef.current?.connected) {
    console.error('[Socket] Cannot start hand: not connected');
    setError('Not connected to server');
    return;
  }

  console.log('[Socket] Starting hand...');
  socketRef.current.emit('start-hand', { tableId });
}, [tableId]);
```

**Why `useCallback`?**
- Prevents function from being recreated on every render
- Important for performance when passed to child components
- Dependencies: only `tableId` (stable)

### 6.2 Take Action Method

```typescript
const takeAction = useCallback((action: Omit<GameAction, 'timestamp'>) => {
  if (!socketRef.current?.connected) {
    console.error('[Socket] Cannot take action: not connected');
    setError('Not connected to server');
    return;
  }

  // Add timestamp and emit
  const fullAction: GameAction = {
    ...action,
    timestamp: new Date()
  };

  console.log('[Socket] Taking action:', fullAction.type);
  socketRef.current.emit('player-action', {
    tableId,
    action: fullAction
  });
}, [tableId]);
```

**Usage in UI:**
```typescript
// Fold
takeAction({ type: 'fold', playerId: currentPlayerId });

// Call
takeAction({ type: 'call', playerId: currentPlayerId });

// Bet 200
takeAction({ type: 'bet', playerId: currentPlayerId, amount: 200 });

// Raise to 500
takeAction({ type: 'raise', playerId: currentPlayerId, amount: 500 });
```

### 6.3 Disconnect Method

```typescript
const disconnect = useCallback(() => {
  if (socketRef.current) {
    console.log('[Socket] Manual disconnect');
    socketRef.current.disconnect();
    socketRef.current = null;
    setIsConnected(false);
  }
}, []);
```

**When to call?**
- User clicks "Leave Table" button
- User navigates away (optional - useEffect cleanup handles this)
- Error recovery (reconnect with new socket)

---

## Part 7: Complete Hook Implementation

### 7.1 Full Code

**File:** `src/app/game/[tableId]/use-game-socket.ts`

```typescript
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TableState, GameAction } from '@/game/types/game-state';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

interface UseGameSocketOptions {
  tableId: string;
  playerId: string;
  playerName: string;
  buyIn: number;
}

interface UseGameSocketReturn {
  gameState: TableState | null;
  isConnected: boolean;
  error: string | null;
  startHand: () => void;
  takeAction: (action: Omit<GameAction, 'timestamp'>) => void;
  disconnect: () => void;
}

export function useGameSocket(options: UseGameSocketOptions): UseGameSocketReturn {
  const { tableId, playerId, playerName, buyIn } = options;

  const [gameState, setGameState] = useState<TableState | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (socketRef.current) return;

    console.log('[Socket] Connecting to', SOCKET_URL);

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      console.log('[Socket] Connected!');
      setIsConnected(true);
      setError(null);

      socket.emit('join-table', {
        tableId,
        playerId,
        playerName,
        buyIn
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);

      if (reason === 'io server disconnect') {
        setError('Disconnected by server');
      }
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
      setIsConnected(false);
      setError(`Connection failed: ${error.message}`);
    });

    // Game event handlers
    socket.on('game-state', (data: { table: TableState }) => {
      console.log('[Socket] Game state received');
      setGameState(data.table);
    });

    socket.on('player-joined', (data: any) => {
      console.log('[Socket] Player joined:', data.playerName);
    });

    socket.on('player-left', (data: { playerId: string }) => {
      console.log('[Socket] Player left:', data.playerId);
    });

    socket.on('hand-started', (data: { table: TableState }) => {
      console.log('[Socket] Hand started!');
      setGameState(data.table);
    });

    socket.on('blinds-posted', (data: { table: TableState }) => {
      console.log('[Socket] Blinds posted');
      setGameState(data.table);
    });

    socket.on('cards-dealt', (data: { table: TableState }) => {
      console.log('[Socket] Cards dealt');
      setGameState(data.table);
    });

    socket.on('action-processed', (data: { table: TableState; action: GameAction }) => {
      console.log('[Socket] Action:', data.action.type);
      setGameState(data.table);
    });

    socket.on('street-changed', (data: { table: TableState; street: string }) => {
      console.log('[Socket] Street changed to:', data.street);
      setGameState(data.table);
    });

    socket.on('hand-completed', (data: { table: TableState; result: any }) => {
      console.log('[Socket] Hand completed!');
      setGameState(data.table);
    });

    // Error handlers
    socket.on('join-error', (data: { message: string }) => {
      console.error('[Socket] Join error:', data.message);
      setError(`Failed to join: ${data.message}`);
    });

    socket.on('action-error', (data: { message: string }) => {
      console.error('[Socket] Action error:', data.message);
      setError(`Invalid action: ${data.message}`);
      setTimeout(() => setError(null), 3000);
    });

    socket.on('game-error', (data: { message: string }) => {
      console.error('[Socket] Game error:', data.message);
      setError(`Game error: ${data.message}`);
    });

    return () => {
      console.log('[Socket] Cleaning up...');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [tableId, playerId, playerName, buyIn]);

  const startHand = useCallback(() => {
    if (!socketRef.current?.connected) {
      setError('Not connected to server');
      return;
    }

    console.log('[Socket] Starting hand...');
    socketRef.current.emit('start-hand', { tableId });
  }, [tableId]);

  const takeAction = useCallback((action: Omit<GameAction, 'timestamp'>) => {
    if (!socketRef.current?.connected) {
      setError('Not connected to server');
      return;
    }

    const fullAction: GameAction = {
      ...action,
      timestamp: new Date()
    };

    console.log('[Socket] Taking action:', fullAction.type);
    socketRef.current.emit('player-action', {
      tableId,
      action: fullAction
    });
  }, [tableId]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('[Socket] Manual disconnect');
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  return {
    gameState,
    isConnected,
    error,
    startHand,
    takeAction,
    disconnect
  };
}
```

---

## Part 8: Environment Variables

### 8.1 Configure Socket URL

**File:** `.env.local`

```env
# Socket.IO server URL
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001

# For production
# NEXT_PUBLIC_SOCKET_URL=https://your-socket-server.com
```

**Why `NEXT_PUBLIC_`?**
- Next.js exposes vars with this prefix to the browser
- Without it, var is only available on server-side
- Client-side code needs the socket URL

---

## Part 9: Usage Example

### 9.1 Simple Page Component

**File:** `src/app/game/[tableId]/page.tsx` (preview - full version in Step 7.2)

```typescript
'use client';

import { useGameSocket } from './use-game-socket';

export default function GamePage({ params }: { params: { tableId: string } }) {
  const { gameState, isConnected, error, startHand, takeAction } = useGameSocket({
    tableId: params.tableId,
    playerId: 'player-1', // TODO: Get from auth
    playerName: 'Test Player',
    buyIn: 1000
  });

  if (!isConnected) {
    return <div>Connecting to server...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!gameState) {
    return <div>Loading game...</div>;
  }

  return (
    <div>
      <h1>Table {params.tableId}</h1>
      <p>Pot: ${gameState.pot}</p>
      <p>Street: {gameState.currentStreet}</p>
      <p>Players: {gameState.players.length}</p>

      <button onClick={startHand}>Start Hand</button>
      <button onClick={() => takeAction({ type: 'fold', playerId: 'player-1' })}>
        Fold
      </button>
    </div>
  );
}
```

**To test:**
1. Start Socket.IO server: `npm run dev:socket`
2. Start Next.js: `npm run dev`
3. Visit: `http://localhost:3000/game/test-table-1`
4. Open browser console to see logs
5. Click "Start Hand" to begin

---

## Part 10: Testing Strategy

### 10.1 Browser Console Testing

Open DevTools console at `/game/test-table-1`:

```javascript
// Check connection status
// Should see: [Socket] Connected!

// Check game state
// Should see: [Socket] Game state received

// Manually emit events (for debugging)
// Note: This only works if you expose socket globally (for dev only)
```

### 10.2 Multiple Tabs Test

1. Open 3 browser tabs
2. Change player ID in code for each tab (temporary hack):
   ```typescript
   playerId: 'player-1'  // Tab 1
   playerId: 'player-2'  // Tab 2
   playerId: 'player-3'  // Tab 3
   ```
3. All tabs join same tableId
4. Start hand in one tab
5. Verify all tabs receive updates

### 10.3 Network Tab Inspection

1. Open DevTools → Network tab
2. Filter by "WS" (WebSocket)
3. Click on the WebSocket connection
4. View messages in real-time
5. Verify events flow both ways

### 10.4 Error Scenarios

Test error handling:

1. **Server not running:**
   - Stop socket server
   - Reload page
   - Should see: "Connection failed"

2. **Invalid action:**
   - Try to act out of turn
   - Should see: "Invalid action" error
   - Error should auto-clear after 3s

3. **Disconnect/reconnect:**
   - Stop server
   - Start server
   - Hook should auto-reconnect
   - Should re-join table automatically

---

## Part 11: Common Issues & Solutions

### Issue: "useGameSocket is not a function"

**Symptom:** Import error

**Fix:** Ensure you're using named export:
```typescript
// Wrong
import useGameSocket from './use-game-socket'

// Correct
import { useGameSocket } from './use-game-socket'
```

### Issue: "Cannot find module '@/game/types/game-state'"

**Symptom:** TypeScript can't find game types

**Fix:** Check `tsconfig.json` has path alias:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Issue: Hook re-connects on every render

**Symptom:** Console spam with "Connecting..."

**Fix:** Check useEffect dependencies:
```typescript
// Dependencies should only include values that require reconnection
useEffect(() => {
  // ...
}, [tableId, playerId, playerName, buyIn])

// Don't include functions or objects that change every render
```

### Issue: "NEXT_PUBLIC_SOCKET_URL is undefined"

**Symptom:** Connects to `undefined` URL

**Fix:**
1. Create `.env.local` file
2. Add `NEXT_PUBLIC_SOCKET_URL=http://localhost:3001`
3. Restart Next.js dev server (env vars loaded on startup)

### Issue: CORS errors

**Symptom:** "Access-Control-Allow-Origin" error

**Fix:** Verify socket server CORS config matches frontend URL:
```typescript
// In socket-server.ts
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3000', // Must match Next.js URL
    methods: ['GET', 'POST']
  }
});
```

---

## Part 12: Optimization (Future)

For production, consider these enhancements:

### 12.1 Optimistic Updates

```typescript
const takeAction = useCallback((action: Omit<GameAction, 'timestamp'>) => {
  // Optimistically update local state BEFORE server responds
  setGameState(prev => {
    if (!prev) return prev;
    // ... update logic
    return updatedState;
  });

  // Send to server
  socketRef.current.emit('player-action', { tableId, action });

  // Server will send authoritative state back
}, [tableId]);
```

**Benefits:**
- UI feels instant (no lag)
- Server still has final say

**Risks:**
- Optimistic update might be wrong (server rejects action)
- Needs rollback logic

### 12.2 Connection Indicator Component

```typescript
function ConnectionIndicator({ isConnected, error }: {
  isConnected: boolean;
  error: string | null;
}) {
  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!isConnected) {
    return <div className="connecting">Connecting...</div>;
  }

  return <div className="connected">Connected</div>;
}
```

### 12.3 Action Queuing

```typescript
// Queue actions when offline, send when reconnected
const actionQueue = useRef<GameAction[]>([]);

const takeAction = useCallback((action) => {
  if (!socketRef.current?.connected) {
    actionQueue.current.push(action);
    return;
  }

  // Flush queue on connect
  while (actionQueue.current.length > 0) {
    const queuedAction = actionQueue.current.shift()!;
    socketRef.current.emit('player-action', { tableId, action: queuedAction });
  }

  // Send current action
  socketRef.current.emit('player-action', { tableId, action });
}, [tableId]);
```

---

## Part 13: Security Considerations

### 13.1 Authentication (TODO - Future)

Currently, `playerId` is hardcoded. For production:

```typescript
// Get authenticated user
const session = await getServerSession();

const { gameState, ... } = useGameSocket({
  tableId: params.tableId,
  playerId: session.user.id,      // From NextAuth
  playerName: session.user.name,  // From NextAuth
  buyIn: 1000
});
```

### 13.2 Input Validation

The hook doesn't validate actions (server does that). But we can add client-side checks:

```typescript
const takeAction = useCallback((action: Omit<GameAction, 'timestamp'>) => {
  // Client-side validation (UX, not security)
  if (action.type === 'bet' && !action.amount) {
    setError('Bet amount required');
    return;
  }

  if (action.type === 'raise' && action.amount! <= gameState!.currentBet) {
    setError('Raise must be higher than current bet');
    return;
  }

  // Send to server (server validates again)
  socketRef.current.emit('player-action', { tableId, action });
}, [tableId, gameState]);
```

---

## Validation Checklist

Before moving to Step 7.2 (UI Components):

- [ ] Hook compiles without TypeScript errors
- [ ] Can connect to Socket.IO server
- [ ] Receives game state on join
- [ ] `startHand()` works
- [ ] `takeAction()` sends actions to server
- [ ] All game events update `gameState`
- [ ] Error messages display correctly
- [ ] Disconnects clean up properly
- [ ] Connection status reflects actual state
- [ ] Console logs show all events
- [ ] Multiple tabs can join same table
- [ ] Environment variable loads correctly

---

## Summary

You've built a **production-ready React hook** that:

✅ Manages WebSocket connection lifecycle
✅ Handles all game events from server
✅ Provides simple API for UI components
✅ Includes error handling and reconnection
✅ Supports multiple tables via dynamic routing
✅ TypeScript-safe with full type checking

**What you can do now:**
- Connect to any table via `/game/{tableId}`
- See live game state updates
- Take actions (fold, check, call, bet, raise)
- Handle disconnections gracefully

**Next step:** Step 7.2 - Build the actual UI components (poker table, cards, chips, buttons)

Your frontend can now talk to your backend! 🎉

---

## Quick Reference

```typescript
// Usage
const { gameState, isConnected, error, startHand, takeAction } = useGameSocket({
  tableId: 'table-1',
  playerId: 'player-123',
  playerName: 'Alice',
  buyIn: 1000
});

// Start a hand
startHand();

// Take actions
takeAction({ type: 'fold', playerId: 'player-123' });
takeAction({ type: 'call', playerId: 'player-123' });
takeAction({ type: 'bet', playerId: 'player-123', amount: 200 });
takeAction({ type: 'raise', playerId: 'player-123', amount: 500 });

// Check state
if (gameState) {
  console.log('Pot:', gameState.pot);
  console.log('Street:', gameState.currentStreet);
  console.log('Players:', gameState.players.length);
}

// Check connection
if (!isConnected) {
  console.log('Offline');
}

// Check errors
if (error) {
  console.error(error);
}
```

The bridge between your game engine and UI is complete! 🌉
