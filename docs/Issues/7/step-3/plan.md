# Phase 2, Step 2.1: Game State Type Definitions

## Overview

We're defining the **in-memory representation** of a poker game. These types model what the game looks like at any given moment - who's sitting where, what cards are visible, how much money is in the pot, whose turn it is, etc.

**Time estimate:** 1-2 hours
**Difficulty:** Beginner (just TypeScript types)
**Prerequisites:** Step 1.1 and 1.2 completed (cards.ts with Card type)

---

## Philosophy: Why Types First?

Think of these types as the **contract** between all parts of your application:
- The game engine uses them to track state
- The frontend uses them to display the UI
- The backend uses them to sync with Socket.IO
- The database uses them (slightly modified) to persist state

**Getting these right now saves hours of debugging later.**

---

## File Structure

```
src/game/types/
├── game-state.ts     # All game state type definitions
```

We're putting everything in ONE file for now because:
1. Types are lightweight (no runtime code)
2. Easier to see the full picture
3. Can split later if it gets too big

---

## Part 1: Player Types

### 1.1 Player Status

**Why this matters:** A player can be in different states at different times. Understanding these states is crucial for game logic.

```typescript
/**
 * Represents a player's current status in the hand.
 */
export type PlayerStatus =
  | 'waiting'      // Waiting for hand to start
  | 'active'       // Currently in the hand
  | 'folded'       // Folded this hand
  | 'all-in'       // All chips in the pot
  | 'sitting-out'  // Temporarily away

/**
 * Helper to check if player can act.
 */
export function canPlayerAct(status: PlayerStatus): boolean {
  return status === 'active'
}
```

**Status transitions:**
- `waiting` � `active` (when hand starts)
- `active` � `folded` (player folds)
- `active` � `all-in` (player bets entire stack)
- `active` � `sitting-out` (player goes AFK)

### 1.2 Player Interface

```typescript
/**
 * Represents a player at the poker table.
 * This is the in-memory representation (not the database model).
 */
export interface Player {
  /**
   * Unique identifier for the player.
   * Should match the user ID from your auth system.
   */
  id: string

  /**
   * Display name shown to other players.
   */
  name: string

  /**
   * Position at the table (0-9 for a 10-seat table).
   * Position matters for betting order.
   */
  seatPosition: number

  /**
   * Current chip stack (in cents or smallest currency unit).
   * This is what they have left, not including current bets.
   */
  stack: number

  /**
   * The player's hole cards (2 cards in Texas Hold'em).
   * Empty array if cards haven't been dealt yet.
   */
  holeCards: Card[]

  /**
   * Current status in the hand.
   */
  status: PlayerStatus

  /**
   * Amount the player has bet in the CURRENT betting round.
   * Resets to 0 when moving to next street (flop � turn, etc.)
   */
  currentBet: number

  /**
   * Total amount bet in this entire hand (across all streets).
   * Used for pot calculations and side pots.
   */
  totalBetInHand: number

  /**
   * Has this player acted in the current betting round?
   * Used to determine when betting round is complete.
   */
  hasActed: boolean
}
```

**Design decisions:**

**Q: Why store both `currentBet` and `totalBetInHand`?**
A: `currentBet` tracks the current street (needed to calculate call amount), `totalBetInHand` tracks the entire hand (needed for side pots when someone goes all-in).

**Q: Why use cents instead of dollars?**
A: Avoids floating-point math errors. $1.50 becomes 150 cents (integer).

**Q: Why `holeCards: Card[]` instead of `holeCards: [Card, Card]`?**
A: Flexibility. In Texas Hold'em it's always 2, but this structure works for Omaha (4 cards) or other variants.

---

## Part 2: Table State

### 2.1 Street (Betting Round)

```typescript
/**
 * The current stage of the hand.
 */
export type Street =
  | 'preflop'   // After hole cards dealt, before flop
  | 'flop'      // After 3 community cards
  | 'turn'      // After 4th community card
  | 'river'     // After 5th community card
  | 'showdown'  // Revealing hands and determining winner
```

**Street progression:** `preflop` � `flop` � `turn` � `river` � `showdown`

### 2.2 Table State Interface

```typescript
/**
 * Represents the complete state of a poker table at any moment.
 * This is the "single source of truth" for the game.
 */
export interface TableState {
  /**
   * Unique identifier for this table.
   */
  id: string

  /**
   * All players at the table (seated).
   * Array index does NOT necessarily match seat position!
   */
  players: Player[]

  /**
   * Position of the dealer button (0-9).
   * Rotates clockwise after each hand.
   */
  dealerPosition: number

  /**
   * Position of small blind (usually dealer + 1).
   * Calculated, not stored in DB usually.
   */
  smallBlindPosition: number

  /**
   * Position of big blind (usually dealer + 2).
   * Calculated, not stored in DB usually.
   */
  bigBlindPosition: number

  /**
   * Small blind amount (in cents).
   * Example: $1/$2 game � smallBlind = 100
   */
  smallBlind: number

  /**
   * Big blind amount (in cents).
   * Example: $1/$2 game � bigBlind = 200
   */
  bigBlind: number

  /**
   * Current stage of the hand.
   */
  currentStreet: Street

  /**
   * Community cards visible to all players.
   * Length varies by street:
   * - preflop: []
   * - flop: [Card, Card, Card]
   * - turn: [Card, Card, Card, Card]
   * - river: [Card, Card, Card, Card, Card]
   */
  communityCards: Card[]

  /**
   * Total chips in the pot (all bets combined).
   * Updated as players bet.
   */
  pot: number

  /**
   * The current bet amount that players must match to stay in.
   * Example: If player A bet $10, currentBet = 10
   * To call, other players must bet up to this amount.
   */
  currentBet: number

  /**
   * Seat position of the player who must act next.
   * null if no one needs to act (betting round complete).
   */
  activePlayerPosition: number | null

  /**
   * The deck of remaining cards.
   * Used for dealing flop, turn, river.
   */
  deck: Card[]

  /**
   * When this hand started (for tracking/analytics).
   */
  handStartedAt: Date

  /**
   * Hand number (increments after each hand).
   * Useful for debugging and analytics.
   */
  handNumber: number
}
```

**Key relationships:**

```
dealerPosition = 0
smallBlindPosition = 1 (dealer + 1, wraps around)
bigBlindPosition = 2 (dealer + 2, wraps around)

First to act preflop = bigBlindPosition + 1
First to act postflop = smallBlindPosition
```

---

## Part 3: Action Types

### 3.1 Action Type Enum

```typescript
/**
 * All possible player actions in poker.
 */
export type ActionType =
  | 'fold'       // Give up the hand
  | 'check'      // Pass action (when no bet to call)
  | 'call'       // Match the current bet
  | 'bet'        // First to put money in on this street
  | 'raise'      // Increase existing bet
  | 'all-in'     // Bet entire stack
```

**Action validity rules:**
- `check`: Only when `currentBet === 0` or you've already matched it
- `call`: Only when `currentBet > 0` and you haven't matched it
- `bet`: Only when `currentBet === 0`
- `raise`: Only when `currentBet > 0`
- `all-in`: Always valid (if you have chips)

### 3.2 Game Action Interface

```typescript
/**
 * Represents a single action taken by a player.
 */
export interface GameAction {
  /**
   * The type of action.
   */
  type: ActionType

  /**
   * ID of the player taking this action.
   */
  playerId: string

  /**
   * Amount involved (in cents).
   * - For bet/raise: the NEW total bet amount
   * - For call: implied (match currentBet)
   * - For check/fold: undefined
   * - For all-in: player's entire remaining stack
   */
  amount?: number

  /**
   * When this action was taken.
   * Useful for timeouts and analytics.
   */
  timestamp: Date
}
```

**Example actions:**

```typescript
// Player folds
const foldAction: GameAction = {
  type: 'fold',
  playerId: 'player-123',
  timestamp: new Date()
}

// Player raises to $20 (was $10)
const raiseAction: GameAction = {
  type: 'raise',
  playerId: 'player-456',
  amount: 2000,  // 2000 cents = $20
  timestamp: new Date()
}

// Player goes all-in with $57.32
const allinAction: GameAction = {
  type: 'all-in',
  playerId: 'player-789',
  amount: 5732,  // Their entire stack
  timestamp: new Date()
}
```

---

## Part 4: Pot & Winnings Types

### 4.1 Pot Interface

```typescript
/**
 * Represents a pot (main or side).
 * Side pots occur when players go all-in with different stack sizes.
 */
export interface Pot {
  /**
   * Total chips in this pot.
   */
  amount: number

  /**
   * Player IDs who are eligible to win this pot.
   * When someone goes all-in, later bets go to a side pot
   * that they're not eligible for.
   */
  eligiblePlayers: string[]

  /**
   * Type of pot.
   */
  type: 'main' | 'side'
}
```

**Example scenario:**
```
Player A: $100 stack, goes all-in
Player B: $200 stack, calls
Player C: $200 stack, calls

Main pot: $300 (A, B, C eligible)
Side pot: $200 (only B, C eligible)
```

### 4.2 Hand Result Interface

```typescript
/**
 * Result of a completed hand.
 */
export interface PotResult {
    pot: Pot

    // Multiple winners possible (for split pots)
    winners: {
      playerId: string
      handRank: HandRank
      amountWon: number
    }[]

    wasSplit: boolean
  }

export interface HandResult {
    potResults: PotResult[]
    totalDistributed: number
    completedAt: Date
  }
```
---

## Part 5: Helper Types

### 5.1 Seat Info

```typescript
/**
 * Information about a specific seat at the table.
 * Useful for displaying empty seats in UI.
 */
export interface SeatInfo {
  position: number
  isOccupied: boolean
  player?: Player  // Only if occupied
}

/**
 * Get all seat information for display.
 */
export function getSeatsInfo(table: TableState, maxSeats: number = 10): SeatInfo[] {
  const seats: SeatInfo[] = []

  for (let i = 0; i < maxSeats; i++) {
    const player = table.players.find(p => p.seatPosition === i)
    seats.push({
      position: i,
      isOccupied: !!player,
      player
    })
  }

  return seats
}
```

### 5.2 Betting Limits

```typescript
/**
 * Constraints on a player's bet/raise amount.
 */
export interface BettingLimits {
  /**
   * Minimum bet/raise amount.
   * Usually: currentBet + bigBlind
   */
  min: number

  /**
   * Maximum bet/raise amount.
   * Usually: player's stack
   */
  max: number

  /**
   * Can the player check?
   */
  canCheck: boolean

  /**
   * Can the player bet?
   */
  canBet: boolean

  /**
   * Can the player raise?
   */
  canRaise: boolean

  /**
   * Amount to call (0 if no bet to match).
   */
  callAmount: number
}
```

---

## Part 6: Initial State Factory

### 6.1 Creating a New Table

```typescript
/**
 * Creates initial state for a new table.
 */
export function createInitialTableState(
  tableId: string,
  smallBlind: number,
  bigBlind: number
): TableState {
  return {
    id: tableId,
    players: [],
    dealerPosition: 0,
    smallBlindPosition: 1,
    bigBlindPosition: 2,
    smallBlind,
    bigBlind,
    currentStreet: 'preflop',
    communityCards: [],
    pot: 0,
    currentBet: 0,
    activePlayerPosition: null,
    deck: createDeck(),  // From cards.ts
    handStartedAt: new Date(),
    handNumber: 0
  }
}
```

### 6.2 Creating a New Player

```typescript
/**
 * Creates a new player with default state.
 */
export function createPlayer(
  id: string,
  name: string,
  seatPosition: number,
  initialStack: number
): Player {
  return {
    id,
    name,
    seatPosition,
    stack: initialStack,
    holeCards: [],
    status: 'waiting',
    currentBet: 0,
    totalBetInHand: 0,
    hasActed: false
  }
}
```

---

## Part 7: Type Guards & Utilities

### 7.1 Type Guards

```typescript
/**
 * Type guards for safer type checking.
 */

export function isPlayerActive(player: Player): boolean {
  return player.status === 'active'
}

export function isPlayerInHand(player: Player): boolean {
  return ['active', 'all-in'].includes(player.status)
}

export function hasPlayerFolded(player: Player): boolean {
  return player.status === 'folded'
}

export function canPlayerBet(player: Player, table: TableState): boolean {
  return (
    player.status === 'active' &&
    player.stack > 0 &&
    table.currentBet === 0
  )
}
```

### 7.2 Position Helpers

```typescript
/**
 * Get next seat position (wraps around).
 */
export function getNextPosition(
  currentPosition: number,
  maxSeats: number = 10
): number {
  return (currentPosition + 1) % maxSeats
}

/**
 * Get previous seat position (wraps around).
 */
export function getPreviousPosition(
  currentPosition: number,
  maxSeats: number = 10
): number {
  return (currentPosition - 1 + maxSeats) % maxSeats
}

/**
 * Calculate distance between two positions.
 */
export function getPositionDistance(
  from: number,
  to: number,
  maxSeats: number = 10
): number {
  return (to - from + maxSeats) % maxSeats
}
```

---

## Part 8: Validation Checklist

Before moving to Step 2.2, ensure:

- [ ] All types compile without errors
- [ ] Types match your Prisma schema (conceptually)
- [ ] Helper functions are pure (no side effects)
- [ ] JSDoc comments explain each field
- [ ] Factory functions create valid initial states
- [ ] Type guards work correctly

---

## Testing These Types

Even though these are just types, you can test the helper functions:

**File:** `src/game/types/game-state.test.ts`

```typescript
import { describe, test, expect } from '@jest/globals'
import {
  createInitialTableState,
  createPlayer,
  getNextPosition,
  isPlayerActive
} from './game-state'

describe('createInitialTableState', () => {
  test('creates valid initial state', () => {
    const state = createInitialTableState('table-1', 100, 200)

    expect(state.id).toBe('table-1')
    expect(state.players).toHaveLength(0)
    expect(state.smallBlind).toBe(100)
    expect(state.bigBlind).toBe(200)
    expect(state.pot).toBe(0)
  })
})

describe('getNextPosition', () => {
  test('increments position', () => {
    expect(getNextPosition(0, 10)).toBe(1)
    expect(getNextPosition(5, 10)).toBe(6)
  })

  test('wraps around at max', () => {
    expect(getNextPosition(9, 10)).toBe(0)
  })
})

describe('isPlayerActive', () => {
  test('returns true for active player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'active'

    expect(isPlayerActive(player)).toBe(true)
  })

  test('returns false for folded player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'folded'

    expect(isPlayerActive(player)).toBe(false)
  })
})
```

---

## Summary

You've defined:
- **Player** - Who's at the table and their state
- **TableState** - Complete game snapshot
- **GameAction** - What players can do
- **Pot** - Where the money goes
- **HandResult** - Who won what
- **Helper functions** - Utilities for working with these types

**Next step:** Step 2.2 - State Manager (functions to READ and MODIFY these states)

This is the foundation! Every other part of the game engine will use these types. Take your time to understand them - they're the contract for your entire poker game.
