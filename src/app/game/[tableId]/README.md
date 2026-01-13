# Game Table Page

This directory contains the frontend UI for playing poker at a specific table.

## Structure

```
game/[tableId]/
├── use-game-socket.ts     # React hook for Socket.IO connection
├── page.tsx               # Main game table page component
└── README.md              # This file
```

## How to Test

### 1. Start the Socket.IO Server

```bash
npm run dev:socket
```

You should see:
```
╔═══════════════════════════════════════════════════════╗
║     Poker Socket.IO Server                           ║
║     Port: 3001                                      ║
║     Client URL: http://localhost:3000                         ║
║     Status: ✅ Running                                ║
╚═══════════════════════════════════════════════════════╝
```

### 2. Start Next.js (in a new terminal)

```bash
npm run dev
```

**Important:** Restart Next.js if it was already running, so it picks up the new `.env.local` variable.

### 3. Open the Game Table

Visit: `http://localhost:3000/game/test-table-1`

You should see:
- "Connected" status indicator
- Empty table (0 players initially)
- Your player card showing "Test Player" with $1000 stack

### 4. Open Multiple Tabs (Multi-player Test)

**Tab 1:**
1. Visit `http://localhost:3000/game/test-table-1`
2. You'll join as "Test Player" (player-1)

**Tab 2:**
1. Edit `page.tsx` temporarily:
   ```typescript
   playerId: 'player-2',  // Change from 'player-1'
   playerName: 'Alice',    // Change from 'Test Player'
   ```
2. Save the file (hot reload)
3. Visit `http://localhost:3000/game/test-table-1`

**Tab 3:**
1. Edit `page.tsx` again:
   ```typescript
   playerId: 'player-3',
   playerName: 'Bob',
   ```
2. Save and visit the same URL

Now you should see all 3 players at the table!

### 5. Play a Hand

1. Click **"Start Hand"** button (in any tab)
2. Watch the game flow:
   - Blinds posted (SB $10, BB $20)
   - Cards dealt (you'll see your 2 hole cards)
   - It becomes your turn (yellow border on your player card)
   - Action buttons appear: Fold, Check/Call, Bet/Raise

3. Take actions in each tab:
   - Tab 1: Click "Call" or "Check"
   - Tab 2: Click "Call" or "Check"
   - Tab 3: Click "Call" or "Check"

4. Watch the streets progress:
   - **Flop**: 3 community cards appear
   - **Turn**: 4th community card
   - **River**: 5th community card
   - **Showdown**: Winners announced, chips distributed

### 6. Check Browser Console

Open DevTools console (F12) to see detailed logs:

```
[Socket] Connecting to http://localhost:3001
[Socket] Connected!
[Socket] Game state received
[Socket] Hand started!
[Socket] Blinds posted
[Socket] Cards dealt
[Socket] Action: call
[Socket] Street changed to: flop
...
```

## Features

### Current Features ✅

- **Connection Management**
  - Auto-connect to Socket.IO server
  - Connection status indicator
  - Auto-reconnect on disconnect
  - Error display

- **Game State Display**
  - Pot amount
  - Current street (pre-flop, flop, turn, river)
  - Current bet
  - Community cards
  - All players with:
    - Name, stack, status
    - Dealer/SB/BB indicators
    - Current bet amount
    - Your hole cards (only visible to you)

- **Actions**
  - Start hand (when 2+ players)
  - Fold
  - Check (when no bet)
  - Call (when bet exists)
  - Bet/Raise (via prompt - temporary)

- **Visual Indicators**
  - Active player (yellow border)
  - Your turn indicator
  - Card suits with colors (♥♦ red, ♣♠ black)
  - Player status badges (active, folded, all-in)
  - Position badges (D, SB, BB)

### Temporary Limitations ⏳

- **Hardcoded player IDs**: Need to manually edit code for multiple players
- **No authentication**: Using placeholder player IDs
- **Bet amount via prompt**: Need proper input UI
- **Basic styling**: Functional but not polished
- **No animations**: Cards just appear instantly
- **No sound effects**: Silent gameplay

### Future Enhancements 🚀

- [ ] Proper authentication (get playerId from NextAuth)
- [ ] Lobby system (create/join tables)
- [ ] Bet slider/input component
- [ ] Card dealing animations
- [ ] Chip animations
- [ ] Sound effects
- [ ] Chat system
- [ ] Player avatars
- [ ] Hand history
- [ ] Spectator mode

## Troubleshooting

### "Connection failed"

**Problem:** Can't connect to Socket.IO server

**Solutions:**
1. Check socket server is running: `npm run dev:socket`
2. Verify port 3001 is not in use
3. Check `.env.local` has: `NEXT_PUBLIC_SOCKET_URL=http://localhost:3001`
4. Restart Next.js after adding env var

### "Waiting for more players"

**Problem:** Can't start hand

**Solution:** Open another tab with a different player ID (see Multi-player Test above)

### Cards not showing

**Problem:** Hole cards or community cards not visible

**Solutions:**
1. Check browser console for errors
2. Start a hand first (cards only dealt after clicking "Start Hand")
3. Check Socket.IO server logs for errors

### "Not your turn" or buttons not working

**Problem:** Actions don't work

**Solutions:**
1. Wait for your turn (active player has yellow border)
2. Check browser console for action errors
3. Verify socket is connected (green "Connected" badge)

### Multiple tabs show same player

**Problem:** All tabs join as "Test Player"

**Solution:** You must edit `page.tsx` to change the `playerId` and `playerName` for each tab (temporary limitation)

## Environment Variables

Required in `.env.local`:

```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

**Note:** `NEXT_PUBLIC_` prefix is required for client-side access in Next.js.

## API Reference

See `src/server/README.md` for complete Socket.IO API documentation.

## Next Steps

To build a production-ready UI:

1. **Add Authentication**
   - Integrate NextAuth session
   - Get playerId from authenticated user
   - Remove hardcoded player IDs

2. **Build Lobby**
   - Table list page
   - Create table form
   - Join table flow

3. **Improve UI Components**
   - Break down into smaller components
   - Add animations
   - Polish styling
   - Add responsive design

4. **Add More Features**
   - Chat
   - Hand history
   - Player stats
   - Tournament support

## Files Created

- ✅ `use-game-socket.ts` - Socket.IO React hook (200 lines)
- ✅ `page.tsx` - Game table page component (300 lines)
- ✅ `.env.local` - Environment configuration (updated)
- ✅ `README.md` - This documentation

Your poker game frontend is now live! 🎰🎉
