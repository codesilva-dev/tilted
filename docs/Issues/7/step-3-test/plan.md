# Testing Guide: Game State Types

## Overview

Testing type definitions might seem odd (they're just types!), but we have **helper functions, factory functions, and type guards** that all need testing. These are the building blocks that every other part of your poker game will use.

**Prerequisites:** Step 2.1 completed (game-state.ts implemented)

---

## File Structure

```
src/game/types/
├── game-state.ts           # Implementation (already done)
├── game-state.test.ts      # Tests (create this)
```

---

## Test File Setup

**File:** `src/game/types/game-state.test.ts`

```typescript
import { describe, test, expect } from '@jest/globals'
import {
  createInitialTableState,
  createPlayer,
  getNextPosition,
  getPreviousPosition,
  getPositionDistance,
  isPlayerActive,
  isPlayerInHand,
  hasPlayerFolded,
  canPlayerBet,
  getSeatsInfo,
  type Player,
  type TableState,
  type PlayerStatus
} from './game-state'
import { createDeck } from '../core/cards'
```

---

## Part 1: Factory Function Tests

### Test 1.1: createInitialTableState()

```typescript
describe('createInitialTableState', () => {
  test('creates table with correct ID', () => {
    const state = createInitialTableState('table-123', 100, 200)

    expect(state.id).toBe('table-123')
  })

  test('creates table with correct blind amounts', () => {
    const state = createInitialTableState('table-123', 100, 200)

    expect(state.smallBlind).toBe(100)
    expect(state.bigBlind).toBe(200)
  })

  test('initializes with empty players array', () => {
    const state = createInitialTableState('table-123', 100, 200)

    expect(state.players).toEqual([])
    expect(state.players).toHaveLength(0)
  })

  test('initializes dealer, small blind, and big blind positions', () => {
    const state = createInitialTableState('table-123', 100, 200)

    expect(state.dealerPosition).toBe(0)
    expect(state.smallBlindPosition).toBe(1)
    expect(state.bigBlindPosition).toBe(2)
  })

  test('starts at preflop street', () => {
    const state = createInitialTableState('table-123', 100, 200)

    expect(state.currentStreet).toBe('preflop')
  })

  test('initializes with empty community cards', () => {
    const state = createInitialTableState('table-123', 100, 200)

    expect(state.communityCards).toEqual([])
    expect(state.communityCards).toHaveLength(0)
  })

  test('initializes pot and currentBet to zero', () => {
    const state = createInitialTableState('table-123', 100, 200)

    expect(state.pot).toBe(0)
    expect(state.currentBet).toBe(0)
  })

  test('initializes with null active player', () => {
    const state = createInitialTableState('table-123', 100, 200)

    expect(state.activePlayerPosition).toBeNull()
  })

  test('creates a full deck', () => {
    const state = createInitialTableState('table-123', 100, 200)

    expect(state.deck).toHaveLength(52)
  })

  test('sets hand number to 0', () => {
    const state = createInitialTableState('table-123', 100, 200)

    expect(state.handNumber).toBe(0)
  })

  test('sets handStartedAt to current date', () => {
    const before = new Date()
    const state = createInitialTableState('table-123', 100, 200)
    const after = new Date()

    expect(state.handStartedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(state.handStartedAt.getTime()).toBeLessThanOrEqual(after.getTime())
  })
})
```

**Why these tests matter:**
- Ensures factory creates valid initial state
- Verifies all fields have correct default values
- Catches typos or missing fields early

### Test 1.2: createPlayer()

```typescript
describe('createPlayer', () => {
  test('creates player with correct ID and name', () => {
    const player = createPlayer('player-1', 'Alice', 0, 1000)

    expect(player.id).toBe('player-1')
    expect(player.name).toBe('Alice')
  })

  test('creates player with correct seat position', () => {
    const player = createPlayer('player-1', 'Alice', 5, 1000)

    expect(player.seatPosition).toBe(5)
  })

  test('creates player with correct initial stack', () => {
    const player = createPlayer('player-1', 'Alice', 0, 50000)

    expect(player.stack).toBe(50000)
  })

  test('initializes with empty hole cards', () => {
    const player = createPlayer('player-1', 'Alice', 0, 1000)

    expect(player.holeCards).toEqual([])
    expect(player.holeCards).toHaveLength(0)
  })

  test('initializes with waiting status', () => {
    const player = createPlayer('player-1', 'Alice', 0, 1000)

    expect(player.status).toBe('waiting')
  })

  test('initializes betting amounts to zero', () => {
    const player = createPlayer('player-1', 'Alice', 0, 1000)

    expect(player.currentBet).toBe(0)
    expect(player.totalBetInHand).toBe(0)
  })

  test('initializes hasActed to false', () => {
    const player = createPlayer('player-1', 'Alice', 0, 1000)

    expect(player.hasActed).toBe(false)
  })
})
```

---

## Part 2: Position Helper Tests

### Test 2.1: getNextPosition()

```typescript
describe('getNextPosition', () => {
  test('increments position by 1', () => {
    expect(getNextPosition(0, 10)).toBe(1)
    expect(getNextPosition(3, 10)).toBe(4)
    expect(getNextPosition(7, 10)).toBe(8)
  })

  test('wraps around from last seat to first', () => {
    expect(getNextPosition(9, 10)).toBe(0)
  })

  test('works with 6-seat table', () => {
    expect(getNextPosition(0, 6)).toBe(1)
    expect(getNextPosition(5, 6)).toBe(0)  // Wrap around
  })

  test('works with heads-up (2-seat)', () => {
    expect(getNextPosition(0, 2)).toBe(1)
    expect(getNextPosition(1, 2)).toBe(0)  // Wrap around
  })
})
```

### Test 2.2: getPreviousPosition()

```typescript
describe('getPreviousPosition', () => {
  test('decrements position by 1', () => {
    expect(getPreviousPosition(5, 10)).toBe(4)
    expect(getPreviousPosition(3, 10)).toBe(2)
    expect(getPreviousPosition(1, 10)).toBe(0)
  })

  test('wraps around from first seat to last', () => {
    expect(getPreviousPosition(0, 10)).toBe(9)
  })

  test('works with 6-seat table', () => {
    expect(getPreviousPosition(3, 6)).toBe(2)
    expect(getPreviousPosition(0, 6)).toBe(5)  // Wrap around
  })
})
```

### Test 2.3: getPositionDistance()

```typescript
describe('getPositionDistance', () => {
  test('calculates distance moving clockwise', () => {
    // From position 0 to position 3 = 3 seats
    expect(getPositionDistance(0, 3, 10)).toBe(3)

    // From position 2 to position 7 = 5 seats
    expect(getPositionDistance(2, 7, 10)).toBe(5)
  })

  test('wraps around the table', () => {
    // From position 8 to position 1 = 3 seats (8�9�0�1)
    expect(getPositionDistance(8, 1, 10)).toBe(3)
  })

  test('distance to same position is 0', () => {
    expect(getPositionDistance(5, 5, 10)).toBe(0)
  })

  test('distance to next seat is 1', () => {
    expect(getPositionDistance(0, 1, 10)).toBe(1)
    expect(getPositionDistance(9, 0, 10)).toBe(1)  // Wrap around
  })

  test('works with 6-seat table', () => {
    expect(getPositionDistance(5, 2, 6)).toBe(3)  // 5�0�1�2
  })
})
```

**Why position tests matter:**
- Dealer button rotates every hand
- Action moves clockwise around table
- Must handle wrap-around correctly (seat 9 � seat 0)
- Bugs here break betting order!

---

## Part 3: Type Guard Tests

### Test 3.1: isPlayerActive()

```typescript
describe('isPlayerActive', () => {
  test('returns true for active player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'active'

    expect(isPlayerActive(player)).toBe(true)
  })

  test('returns false for waiting player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'waiting'

    expect(isPlayerActive(player)).toBe(false)
  })

  test('returns false for folded player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'folded'

    expect(isPlayerActive(player)).toBe(false)
  })

  test('returns false for all-in player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'all-in'

    expect(isPlayerActive(player)).toBe(false)
  })

  test('returns false for sitting-out player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'sitting-out'

    expect(isPlayerActive(player)).toBe(false)
  })
})
```

### Test 3.2: isPlayerInHand()

```typescript
describe('isPlayerInHand', () => {
  test('returns true for active player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'active'

    expect(isPlayerInHand(player)).toBe(true)
  })

  test('returns true for all-in player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'all-in'

    expect(isPlayerInHand(player)).toBe(true)
  })

  test('returns false for folded player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'folded'

    expect(isPlayerInHand(player)).toBe(false)
  })

  test('returns false for waiting player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'waiting'

    expect(isPlayerInHand(player)).toBe(false)
  })
})
```

**Key distinction:**
- `isPlayerActive()` - Can this player act right now? (only 'active')
- `isPlayerInHand()` - Is this player still eligible to win? ('active' OR 'all-in')

### Test 3.3: hasPlayerFolded()

```typescript
describe('hasPlayerFolded', () => {
  test('returns true for folded player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'folded'

    expect(hasPlayerFolded(player)).toBe(true)
  })

  test('returns false for active player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'active'

    expect(hasPlayerFolded(player)).toBe(false)
  })

  test('returns false for all-in player', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'all-in'

    expect(hasPlayerFolded(player)).toBe(false)
  })
})
```

### Test 3.4: canPlayerBet()

```typescript
describe('canPlayerBet', () => {
  test('returns true when player is active, has stack, and no current bet', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'active'

    const table = createInitialTableState('t1', 100, 200)
    table.currentBet = 0  // No one has bet yet

    expect(canPlayerBet(player, table)).toBe(true)
  })

  test('returns false when current bet is already placed', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'active'

    const table = createInitialTableState('t1', 100, 200)
    table.currentBet = 200  // Someone already bet

    expect(canPlayerBet(player, table)).toBe(false)
  })

  test('returns false when player has no chips', () => {
    const player = createPlayer('p1', 'Alice', 0, 0)  // No stack
    player.status = 'active'

    const table = createInitialTableState('t1', 100, 200)
    table.currentBet = 0

    expect(canPlayerBet(player, table)).toBe(false)
  })

  test('returns false when player is folded', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'folded'

    const table = createInitialTableState('t1', 100, 200)
    table.currentBet = 0

    expect(canPlayerBet(player, table)).toBe(false)
  })

  test('returns false when player is all-in', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'all-in'

    const table = createInitialTableState('t1', 100, 200)
    table.currentBet = 0

    expect(canPlayerBet(player, table)).toBe(false)
  })
})
```

**Critical concept tested:**
- "Bet" means first to put money in (when `currentBet === 0`)
- If someone already bet (`currentBet > 0`), you must "raise" instead

---

## Part 4: Seat Info Tests

### Test 4.1: getSeatsInfo()

```typescript
describe('getSeatsInfo', () => {
  test('returns correct number of seats', () => {
    const table = createInitialTableState('t1', 100, 200)
    const seats = getSeatsInfo(table, 10)

    expect(seats).toHaveLength(10)
  })

  test('all seats are unoccupied for empty table', () => {
    const table = createInitialTableState('t1', 100, 200)
    const seats = getSeatsInfo(table, 10)

    seats.forEach(seat => {
      expect(seat.isOccupied).toBe(false)
      expect(seat.player).toBeUndefined()
    })
  })

  test('marks occupied seats correctly', () => {
    const table = createInitialTableState('t1', 100, 200)

    const player1 = createPlayer('p1', 'Alice', 2, 1000)
    const player2 = createPlayer('p2', 'Bob', 5, 1000)
    table.players.push(player1, player2)

    const seats = getSeatsInfo(table, 10)

    expect(seats[2].isOccupied).toBe(true)
    expect(seats[2].player).toEqual(player1)

    expect(seats[5].isOccupied).toBe(true)
    expect(seats[5].player).toEqual(player2)

    expect(seats[0].isOccupied).toBe(false)
    expect(seats[1].isOccupied).toBe(false)
  })

  test('works with 6-seat table', () => {
    const table = createInitialTableState('t1', 100, 200)
    const seats = getSeatsInfo(table, 6)

    expect(seats).toHaveLength(6)
  })

  test('seat positions match array indices', () => {
    const table = createInitialTableState('t1', 100, 200)
    const seats = getSeatsInfo(table, 10)

    seats.forEach((seat, index) => {
      expect(seat.position).toBe(index)
    })
  })
})
```

**Why this matters:**
- UI needs to display empty seats
- Players need to see available positions
- Seat selection depends on this

---

## Part 5: Edge Cases & Integration Tests

### Test 5.1: Multiple Players

```typescript
describe('Multiple Players', () => {
  test('can add multiple players to table', () => {
    const table = createInitialTableState('t1', 100, 200)

    const players = [
      createPlayer('p1', 'Alice', 0, 1000),
      createPlayer('p2', 'Bob', 1, 1000),
      createPlayer('p3', 'Charlie', 2, 1000)
    ]

    table.players.push(...players)

    expect(table.players).toHaveLength(3)
  })

  test('players maintain separate state', () => {
    const player1 = createPlayer('p1', 'Alice', 0, 1000)
    const player2 = createPlayer('p2', 'Bob', 1, 2000)

    player1.status = 'active'
    player2.status = 'folded'

    expect(player1.status).toBe('active')
    expect(player2.status).toBe('folded')
    expect(player1.stack).toBe(1000)
    expect(player2.stack).toBe(2000)
  })
})
```

### Test 5.2: Position Wrap-Around Edge Cases

```typescript
describe('Position Wrap-Around Edge Cases', () => {
  test('handles position 9 to 0 correctly', () => {
    expect(getNextPosition(9, 10)).toBe(0)
    expect(getPreviousPosition(0, 10)).toBe(9)
  })

  test('handles full circle distance', () => {
    expect(getPositionDistance(0, 0, 10)).toBe(0)
    expect(getPositionDistance(0, 9, 10)).toBe(9)
  })

  test('handles 2-player heads-up correctly', () => {
    expect(getNextPosition(0, 2)).toBe(1)
    expect(getNextPosition(1, 2)).toBe(0)
    expect(getPreviousPosition(0, 2)).toBe(1)
    expect(getPreviousPosition(1, 2)).toBe(0)
  })
})
```

### Test 5.3: Status Transitions

```typescript
describe('Player Status Transitions', () => {
  test('player can transition from waiting to active', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)

    expect(player.status).toBe('waiting')

    player.status = 'active'
    expect(player.status).toBe('active')
  })

  test('player can transition from active to folded', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'active'

    player.status = 'folded'

    expect(player.status).toBe('folded')
    expect(hasPlayerFolded(player)).toBe(true)
  })

  test('player can transition from active to all-in', () => {
    const player = createPlayer('p1', 'Alice', 0, 1000)
    player.status = 'active'

    player.status = 'all-in'

    expect(player.status).toBe('all-in')
    expect(isPlayerInHand(player)).toBe(true)
    expect(isPlayerActive(player)).toBe(false)
  })
})
```

---

## Part 6: Validation Checklist

Before moving to Step 2.2, verify:

- [ ] All factory function tests pass
- [ ] Position helper tests pass (including wrap-around)
- [ ] Type guard tests pass (all status combinations)
- [ ] Seat info tests pass
- [ ] Edge case tests pass
- [ ] 100% code coverage on helper functions
- [ ] No TypeScript errors

---

## Running the Tests

```bash
# Run all tests
npm test

# Run only game-state tests
npm test game-state

# Watch mode
npm run test:watch game-state

# Coverage report
npm run test:coverage
```

**Expected output:**
```
PASS  src/game/types/game-state.test.ts
  createInitialTableState
    - creates table with correct ID (1 ms)
    - creates table with correct blind amounts (1 ms)
    - initializes with empty players array
    ...
  createPlayer
    - creates player with correct ID and name
    ...
  getNextPosition
    - increments position by 1
    - wraps around from last seat to first
    ...

Test Suites: 1 passed, 1 total
Tests:       45 passed, 45 total
Time:        0.523 s
```

---

## Common Test Mistakes

### L Mistake 1: Not Testing Wrap-Around

```typescript
// BAD: Only tests normal case
test('gets next position', () => {
  expect(getNextPosition(0, 10)).toBe(1)
})

// GOOD: Tests wrap-around too
test('wraps around from last to first', () => {
  expect(getNextPosition(9, 10)).toBe(0)
})
```

### L Mistake 2: Not Testing All Status Values

```typescript
// BAD: Only tests one status
test('checks if player is active', () => {
  const player = createPlayer('p1', 'Alice', 0, 1000)
  player.status = 'active'
  expect(isPlayerActive(player)).toBe(true)
})

// GOOD: Tests all statuses
test('returns false for folded', () => { ... })
test('returns false for all-in', () => { ... })
test('returns false for waiting', () => { ... })
```

### L Mistake 3: Not Testing Edge Cases

```typescript
// BAD: Only tests normal table size
test('gets seat info', () => {
  const seats = getSeatsInfo(table, 10)
  expect(seats).toHaveLength(10)
})

// GOOD: Tests different table sizes
test('works with 6-seat table', () => { ... })
test('works with heads-up (2-seat)', () => { ... })
```

---

## Summary

You've tested:
- Factory functions (createInitialTableState, createPlayer)
- Position helpers (getNextPosition, getPreviousPosition, getPositionDistance)
- Type guards (isPlayerActive, isPlayerInHand, hasPlayerFolded, canPlayerBet)
- Seat info utilities
- Edge cases (wrap-around, status transitions, multiple players)

**With these tests passing, you have confidence that:**
- Initial states are always valid
- Position logic handles wrap-around correctly
- Type guards correctly identify player states
- Multiple players can coexist without interference

**Next step:** Step 2.2 - State Manager (the class that USES these types to manage game state)

These types and helpers are the foundation - everything else builds on them!
