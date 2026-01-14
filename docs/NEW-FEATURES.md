# New Features: Seat Selection & Room System

## Summary

We've completely refactored the poker game to support a proper room/table system with seat selection.

## Key Changes

### 1. Two-Step Room Joining
**Before:** Players auto-joined a seat when entering a table
**After:** Players join as spectators first, then click on a seat to play

### 2. Visual Poker Table
- 10 seats displayed in an oval layout around a green felt table
- Click empty seats to sit down
- See all players' positions clearly
- Community cards and pot displayed in the center

### 3. Permanent Quickplay Table
- Always available in the lobby
- Never gets deleted
- Perfect for quick games

### 4. Create Custom Tables
- Modal form to create tables with custom settings:
  - Table name
  - Blinds ($SB/$BB)
  - Buy-in range (min/max)
  - Max seats (2/6/9/10)
- Quick presets for common configurations

### 5. Real-time Lobby Updates
- Live table list with Socket.IO
- See player counts update in real-time
- Filter by: All, Quickplay, Active, Waiting
- Auto-refreshes every 5 seconds

## Files Created/Modified

### New Files:
- `src/server/socket-server.ts` (replaced old version)
- `src/app/game/[tableId]/PokerTable.tsx` - Visual table component
- `src/app/game/[tableId]/use-game-socket-v2.ts` - Updated socket hook
- `src/app/game/[tableId]/page-v2.tsx` - Updated game page
- `src/app/lobby/CreateTableModal.tsx` - Create table form
- `src/app/lobby/page-v2.tsx` - Updated lobby with real-time updates

### Backup Files (old versions):
- `src/server/socket-server-old.ts` (backup of old server)
- `src/app/game/[tableId]/use-game-socket.ts` (still exists, not used)
- `src/app/game/[tableId]/page.tsx` (still exists, not used)
- `src/app/lobby/page.tsx` (still exists, not used)

## How to Test

### Step 1: Start the Socket Server

```bash
cd tilted
npm run dev:socket
```

You should see:
```
╔═══════════════════════════════════════════════════════╗
║     Poker Socket.IO Server v2                        ║
║     Port: 3001                                       ║
║     Status: ✅ Running                                ║
╚═══════════════════════════════════════════════════════╝

[Quickplay] Permanent quickplay table created
```

### Step 2: Start Next.js

```bash
npm run dev
```

### Step 3: Replace Old Pages (Activate New System)

To activate the new system, we need to swap the v2 files:

```bash
# Backup old files
mv src/app/game/[tableId]/page.tsx src/app/game/[tableId]/page-old.tsx
mv src/app/lobby/page.tsx src/app/lobby/page-old.tsx

# Activate new files
mv src/app/game/[tableId]/page-v2.tsx src/app/game/[tableId]/page.tsx
mv src/app/lobby/page-v2.tsx src/app/lobby/page.tsx
```

**OR** just rename them manually in your file explorer.

### Step 4: Test the Lobby

1. Visit `http://localhost:3000/lobby`
2. You should see:
   - **Quickplay** table with yellow highlight
   - Real-time connection indicator (green "🟢 Live")
   - "Create Table" button

### Step 5: Create a Custom Table

1. Click **"+ Create Table"**
2. Fill in the form:
   - Name: "My Test Table"
   - Use a preset (e.g., "Low $10/$20")
   - Click **"Create Table"**
3. You should be redirected to the new table

### Step 6: Join as Spectator

1. You'll see "👀 Spectating" notice
2. The poker table is displayed with empty seats
3. No action buttons yet (you're just watching)

### Step 7: Take a Seat

1. Click on any empty seat (e.g., Seat 0)
2. Enter buy-in amount: `1000`
3. You should now see:
   - Your player card at that seat
   - "• Seated" indicator in header
   - "Stand Up" button appears
   - Action panel becomes active

### Step 8: Multi-Player Test

**Tab 1:**
- You're already seated

**Tab 2 (new incognito window):**
1. Visit same table URL
2. You'll be spectating
3. Click a different seat (e.g., Seat 3)
4. Enter buy-in: `1000`

**Tab 3 (another incognito window):**
1. Visit same table URL
2. Click another seat (e.g., Seat 6)
3. Enter buy-in: `1000`

### Step 9: Play a Hand

1. In any tab, click **"Start Hand"**
2. Watch the game flow:
   - Blinds posted
   - Cards dealt (you see your hole cards)
   - Take actions in turn
3. Complete the hand to showdown

### Step 10: Stand Up / Leave

**Stand Up:**
- Click "Stand Up" button
- You return to spectator mode
- Your seat becomes available

**Leave Table:**
- Click "Leave Table" button
- Returns to lobby

## New Socket.IO Events

### Client → Server:
- `get-tables` - Request list of all tables
- `create-table` - Create a new table
- `join-room` - Join table as spectator
- `take-seat` - Sit at a specific seat
- `leave-seat` - Stand up but stay in room
- `leave-room` - Leave table entirely

### Server → Client:
- `tables-list` - List of all tables
- `table-created` - New table was created
- `table-deleted` - Table was removed
- `seats-available` - Which seats are open
- `spectator-joined` - Someone joined as spectator
- `player-seated` - Someone sat down
- `player-left-seat` - Someone stood up
- `player-left-room` - Someone left table
- `take-seat-error` - Cannot sit (seat taken, etc.)

## Features to Implement Later

- [ ] Show spectator list in UI
- [ ] Add "Reserve Seat" feature
- [ ] Waitlist for full tables
- [ ] Table settings (time bank, etc.)
- [ ] Private tables with passwords
- [ ] Tournament support
- [ ] Hand history per table
- [ ] Chat system
- [ ] Player avatars
- [ ] Dealer animations
- [ ] Sound effects

## Rollback Instructions

If you need to revert to the old system:

```bash
# Restore old pages
mv src/app/game/[tableId]/page.tsx src/app/game/[tableId]/page-v2.tsx
mv src/app/lobby/page.tsx src/app/lobby/page-v2.tsx

mv src/app/game/[tableId]/page-old.tsx src/app/game/[tableId]/page.tsx
mv src/app/lobby/page-old.tsx src/app/lobby/page.tsx

# Restore old socket server
mv src/server/socket-server.ts src/server/socket-server-v2.ts
mv src/server/socket-server-old.ts src/server/socket-server.ts

# Restart socket server
npm run dev:socket
```

## Known Issues / Limitations

1. **Spectator count not updating** - Need to broadcast spectator changes
2. **No seat reservation** - Seats are first-come-first-served
3. **No validation on duplicate names** - Multiple players can have same name
4. **Session persistence** - Refreshing loses your seat (no database persistence yet)
5. **Mobile layout** - Poker table needs responsive design for mobile

## Next Steps

1. Test thoroughly with multiple users
2. Fix any bugs found
3. Add session persistence (save seat to database)
4. Implement spectator list UI
5. Add more visual polish (animations, sounds)
6. Deploy to production (Render + Vercel)
