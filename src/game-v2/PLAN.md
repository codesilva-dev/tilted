# Tilted v2 - Seat-Based Architecture

## Problem with v1

In v1, **players own their cards**:
```typescript
interface Player {
  id: string;
  holeCards: Card[];  // Cards live on the player
  // ...
}
```

This creates problems:
1. **Player leaves = cards leave** - breaks hand state
2. **Complex "isLeaving" logic** - tracking who's leaving, when to remove them
3. **Race conditions** - disconnect timeouts, reconnection windows, auto-fold chains
4. **Tightly coupled** - can't separate "seat in hand" from "player at table"

## v2 Solution: Seats Own Cards

The **table has seats**, and **seats hold cards**. Players sit in seats but can be detached.

```
┌─────────────────────────────────────────────────────┐
│                      TABLE                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐     │
│  │Seat 0│ │Seat 1│ │Seat 2│ │Seat 3│ │Seat 4│     │
│  │[A♠K♥]│ │[7♦2♣]│ │ empty│ │[Q♠Q♦]│ │[J♣T♣]│     │
│  │$500  │ │ $0   │ │      │ │$1200 │ │ $800 │     │
│  │active│ │folded│ │      │ │all-in│ │ LEFT │     │
│  │"Alice"│ │"Bob" │ │      │ │"Carol"│ │ null │     │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘     │
└─────────────────────────────────────────────────────┘
```

Seat 4 shows the key benefit: player left, but seat still has cards and can be folded on its turn.

## Core Types

```typescript
// The status of a seat in the current hand
type SeatHandStatus =
  | 'empty'      // No one sitting, not in hand
  | 'sitting-out'// Player sitting but not in this hand
  | 'active'     // In hand, can act
  | 'folded'     // In hand, folded
  | 'all-in'     // In hand, all-in
  | 'abandoned'; // Player left mid-hand, will auto-fold on turn

interface Seat {
  position: number;           // 0-9

  // Hand state (belongs to the seat, not player)
  holeCards: Card[];
  currentBet: number;
  totalBetInHand: number;
  handStatus: SeatHandStatus;
  hasActed: boolean;

  // Player state (can be null if abandoned or empty)
  playerId: string | null;
  playerName: string | null;
  stack: number;              // Chips stay with seat even if player leaves

  // Display state
  isWinner?: boolean;
  handRank?: HandRank;
}

interface TableState {
  id: string;
  name: string;

  // Fixed 10 seats - this is the source of truth
  seats: Seat[];

  // Table config
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;

  // Hand state
  handNumber: number;
  currentStreet: Street;
  communityCards: Card[];
  pot: number;
  currentBet: number;
  lastRaiseAmount: number;
  deck: Card[];

  // Positions (seat indices, not player IDs)
  dealerPosition: number;
  smallBlindPosition: number;
  bigBlindPosition: number;
  activePosition: number | null;  // Which seat is acting

  handStartedAt: Date | null;
}
```

## Key Differences from v1

| Aspect | v1 | v2 |
|--------|----|----|
| Cards location | `player.holeCards` | `seat.holeCards` |
| Active tracking | `activePlayerPosition` (seat number but via player) | `activePosition` (direct seat index) |
| Player leaves | Complex isLeaving + timeout chains | Set `seat.playerId = null`, seat stays |
| Finding players | `players.find(p => p.seatPosition === pos)` | `seats[pos]` (direct access) |
| Empty seats | Not in players array | `seats[i].handStatus === 'empty'` |
| Pot contributions | Tracked on player | Tracked on seat |

## Implementation Phases

### Phase 1: Core Types & Utilities
- [ ] `types/game-state.ts` - Seat, TableState, Street, etc.
- [ ] `types/actions.ts` - GameAction types
- [ ] `core/cards.ts` - Copy from v1 (deck, shuffle, deal)
- [ ] `core/hand-evaluator.ts` - Copy from v1 (hand ranking)

### Phase 2: State Management
- [ ] `state/table-factory.ts` - Create initial table state
- [ ] `state/seat-manager.ts` - Sit down, stand up, abandon seat
- [ ] `state/betting.ts` - Post blinds, process bets
- [ ] `state/dealing.ts` - Deal to seats, community cards

### Phase 3: Game Logic
- [ ] `engine/action-validator.ts` - Validate actions against seat state
- [ ] `engine/round-manager.ts` - Betting round logic, street advancement
- [ ] `engine/pot-manager.ts` - Side pots, distribution
- [ ] `engine/hand-controller.ts` - Orchestrate full hand

### Phase 4: Server
- [ ] `server/socket-server-v2.ts` - New socket server on port 3002
- [ ] Simplified player tracking (just socket → seat mapping)
- [ ] Clean disconnect handling (just abandon the seat)

### Phase 5: Frontend
- [ ] `app/game-v2/[tableId]/page.tsx` - New game page
- [ ] Update PokerTable component to read from seats
- [ ] Simplified state management (no complex player lookups)

## Disconnect Handling in v2

**v1 (complex):**
1. Player disconnects
2. Start 30s grace period
3. Track in disconnectedPlayers map
4. On timeout, check if their turn, maybe fold, mark isLeaving
5. Chain-fold other disconnected players
6. Clean up at hand end
7. Hope nothing races

**v2 (simple):**
1. Player disconnects
2. `seat.playerId = null`, `seat.handStatus = 'abandoned'`
3. On abandoned seat's turn: auto-fold immediately
4. Done. Seat cleans up naturally at hand end.

## Files to Create

```
src/game-v2/
├── PLAN.md (this file)
├── types/
│   ├── game-state.ts      # Core types: Seat, TableState
│   └── actions.ts         # GameAction types
├── core/
│   ├── cards.ts           # Card, Deck, shuffle
│   └── hand-evaluator.ts  # Hand ranking
├── state/
│   ├── table-factory.ts   # Create tables
│   ├── seat-manager.ts    # Sit/stand/abandon
│   ├── betting.ts         # Blinds, bets, raises
│   └── dealing.ts         # Deal cards
└── engine/
    ├── action-validator.ts
    ├── round-manager.ts
    ├── pot-manager.ts
    └── hand-controller.ts
```

## What We Keep from v1

- Card types and deck operations (`core/cards.ts`)
- Hand evaluation logic (`core/hand-evaluator.ts`)
- Basic action types (fold, check, call, bet, raise, all-in)
- Street progression (pre-flop → flop → turn → river → showdown)
- Blind structure and position rotation
- Side pot calculation logic (adapted for seats)

## What Changes

- Players array → Seats array
- Player-centric state → Seat-centric state
- Complex disconnect handling → Simple seat abandonment
- Active player tracking → Active seat tracking
- All state lookups go through seats, not players

## Testing Strategy

1. Unit tests for each module
2. Integration tests for full hand scenarios
3. Specific tests for disconnect/abandon scenarios
4. Run v1 and v2 side-by-side, compare behavior

---

Let's build this right.
