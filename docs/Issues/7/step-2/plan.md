# Step 1.2: Hand Evaluation - Complete Implementation Guide

## Overview

Now that you can create, shuffle, and deal cards, it's time to answer the most important question in poker: **"Who wins?"**

Hand evaluation is the heart of poker. It determines whether a flush beats a straight, who has the better two pair, and ultimately who takes the pot.

**Time estimate:** 3-4 hours
**Difficulty:** Intermediate (involves algorithms and sorting)
**Prerequisites:** Completed Step 1.1 (Card utilities)

---

## Understanding Poker Hand Rankings

Before coding, you need to understand what you're building. Here are the 10 hand rankings in Texas Hold'em, from worst to best:

### 1. High Card
No matches. Highest card wins.
- Example: `A` Kf 8c 7e 3``
- Beats: Nothing
- Loses to: Everything else

### 2. One Pair
Two cards of the same rank.
- Example: `9e 9` Af 7c 3``
- Beats: High card
- Tiebreaker: Higher pair wins. If same pair, highest kicker wins.

### 3. Two Pair
Two different pairs.
- Example: `K` Ke 7f 7c A``
- Beats: One pair or less
- Tiebreaker: Higher top pair wins. If same, higher second pair. If same, kicker.

### 4. Three of a Kind (Trips/Set)
Three cards of the same rank.
- Example: `8` 8e 8f Ac K``
- Beats: Two pair or less
- Tiebreaker: Higher trips wins

### 5. Straight
Five consecutive ranks (Ace can be high or low).
- Example: `9` 8e 7f 6c 5``
- Special: `A` 2e 3f 4c 5`` (wheel/bicycle - Ace is low)
- Beats: Three of a kind or less
- Tiebreaker: Higher top card wins

### 6. Flush
Five cards of the same suit (not consecutive).
- Example: `K` J` 9` 6` 2``
- Beats: Straight or less
- Tiebreaker: Compare high cards one by one

### 7. Full House
Three of a kind + one pair.
- Example: `Q` Qe Qf 5c 5``
- Beats: Flush or less
- Tiebreaker: Higher trips wins. If same, higher pair.

### 8. Four of a Kind (Quads)
Four cards of the same rank.
- Example: `J` Je Jf Jc A``
- Beats: Full house or less
- Tiebreaker: Higher quads wins

### 9. Straight Flush
Five consecutive ranks, all same suit.
- Example: `T` 9` 8` 7` 6``
- Beats: Four of a kind or less
- Tiebreaker: Higher top card wins

### 10. Royal Flush
`A K Q J T`, all same suit. The best possible hand.
- Example: `A` K` Q` J` T``
- Beats: Everything
- Tiebreaker: None (tie is possible if community cards)

---

## File Structure

Create these files:

```
src/game/core/
├── cards.ts              # Already done
├── cards.test.ts         # Already done
├── hand-evaluator.ts     # New - hand evaluation logic
├── hand-evaluator.test.ts # New - tests
```

---

## Part 1: Type Definitions

### 1.1 Hand Rank Types

**File:** `src/game/core/hand-evaluator.ts`

```typescript
import { Card, Rank, RANK_VALUES } from './cards'

/**
 * The type of poker hand (from weakest to strongest).
 */
export type HandType =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush'
  | 'royal-flush'

/**
 * Numeric values for hand types (for easy comparison).
 */
export const HAND_TYPE_VALUES: Record<HandType, number> = {
  'high-card': 1,
  'pair': 2,
  'two-pair': 3,
  'three-of-a-kind': 4,
  'straight': 5,
  'flush': 6,
  'full-house': 7,
  'four-of-a-kind': 8,
  'straight-flush': 9,
  'royal-flush': 10,
}
```

**Why numeric values?** Makes comparison easy: `HAND_TYPE_VALUES[hand1.type] > HAND_TYPE_VALUES[hand2.type]`

### 1.2 Hand Rank Interface

```typescript
/**
 * Represents a poker hand ranking.
 * Contains both the hand type and the cards that make up the hand.
 */
export interface HandRank {
  type: HandType

  /**
   * The 5 cards that make up this hand, in descending order of importance.
   * For example:
   * - Full House: [trip, trip, trip, pair, pair]
   * - Two Pair: [high pair, high pair, low pair, low pair, kicker]
   */
  cards: [Card, Card, Card, Card, Card]

  /**
   * Numeric value for tiebreaking (higher is better).
   * Calculated from the card ranks.
   */
  value: number

  /**
   * Human-readable description.
   * Examples: "Pair of Aces", "Flush, King high", "Full House, Queens over Fives"
   */
  description: string
}
```

**Design decision:** We store the 5 cards in order of importance for tiebreaking. For a full house of Q-Q-Q-5-5, the queens come first because they're more important for comparison.

---

## Part 2: Helper Functions

### 2.1 Counting Cards by Rank

```typescript
/**
 * Groups cards by rank and returns counts.
 *
 * @example
 * countCardsByRank([7e, 7`, Af, Kc, A`])
 * // Returns: { 'A': 2, 'K': 1, '7': 2 }
 */
function countCardsByRank(cards: Card[]): Record<Rank, number> {
  const counts: Partial<Record<Rank, number>> = {}

  for (const card of cards) {
    counts[card.rank] = (counts[card.rank] || 0) + 1
  }

  return counts as Record<Rank, number>
}
```

**Why this is useful:** Most hand types involve grouping cards by rank (pairs, trips, quads).

### 2.2 Check if All Same Suit

```typescript
/**
 * Checks if all cards are the same suit (flush).
 */
function isFlush(cards: Card[]): boolean {
  if (cards.length === 0) return false

  const firstSuit = cards[0].suit
  return cards.every(card => card.suit === firstSuit)
}
```

**Simple but crucial:** Flushes are common, so we need a fast check.

### 2.3 Check for Straight

```typescript
/**
 * Checks if cards form a straight (5 consecutive ranks).
 * Handles the special case of A-2-3-4-5 (wheel).
 *
 * @returns The high card value of the straight, or null if not a straight
 */
function checkStraight(cards: Card[]): number | null {
  if (cards.length !== 5) return null

  // Sort by rank value (descending)
  const sorted = [...cards].sort((a, b) =>
    RANK_VALUES[b.rank] - RANK_VALUES[a.rank]
  )

  // Check for regular straight (consecutive values)
  let isConsecutive = true
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = RANK_VALUES[sorted[i].rank]
    const next = RANK_VALUES[sorted[i + 1].rank]

    if (current - next !== 1) {
      isConsecutive = false
      break
    }
  }

  if (isConsecutive) {
    return RANK_VALUES[sorted[0].rank] // High card
  }

  // Check for wheel (A-2-3-4-5)
  const ranks = sorted.map(c => c.rank).join('')
  if (ranks === 'A5432') {
    return 5 // In a wheel, the straight is "5-high" not "Ace-high"
  }

  return null
}
```

**Tricky part:** The wheel (A-2-3-4-5) where Ace is low, not high. This is a special case!

### 2.4 Sort Cards by Rank

```typescript
/**
 * Sorts cards by rank value (descending).
 */
function sortByRank(cards: Card[]): Card[] {
  return [...cards].sort((a, b) =>
    RANK_VALUES[b.rank] - RANK_VALUES[a.rank]
  )
}
```

---

## Part 3: Main Evaluation Function

### 3.1 Evaluate a 5-Card Hand

This is the big one! It checks for each hand type in order from best to worst.

```typescript
/**
 * Evaluates a 5-card poker hand and returns its ranking.
 *
 * @param cards - Exactly 5 cards
 * @returns HandRank with type, value, and description
 * @throws Error if not exactly 5 cards
 */
export function evaluateHand(cards: Card[]): HandRank {
  if (cards.length !== 5) {
    throw new Error(`evaluateHand requires exactly 5 cards, got ${cards.length}`)
  }

  const sorted = sortByRank(cards)
  const counts = countCardsByRank(cards)
  const rankCounts = Object.values(counts).sort((a, b) => b - a)
  const flush = isFlush(cards)
  const straight = checkStraight(cards)

  // Check each hand type from best to worst

  // Royal Flush: A-K-Q-J-T all same suit
  if (flush && straight === 14) {
    return {
      type: 'royal-flush',
      cards: sorted as [Card, Card, Card, Card, Card],
      value: calculateValue('royal-flush', sorted),
      description: 'Royal Flush'
    }
  }

  // Straight Flush: 5 consecutive cards, all same suit
  if (flush && straight !== null) {
    return {
      type: 'straight-flush',
      cards: sorted as [Card, Card, Card, Card, Card],
      value: calculateValue('straight-flush', sorted),
      description: `Straight Flush, ${sorted[0].rank} high`
    }
  }

  // Four of a Kind: 4 cards of same rank
  if (rankCounts[0] === 4) {
    const quadCards = sorted.filter(c => counts[c.rank] === 4)
    const kicker = sorted.find(c => counts[c.rank] === 1)!
    const ordered = [...quadCards, kicker]

    return {
      type: 'four-of-a-kind',
      cards: ordered as [Card, Card, Card, Card, Card],
      value: calculateValue('four-of-a-kind', ordered),
      description: `Four of a Kind, ${quadCards[0].rank}s`
    }
  }

  // Full House: 3 of a kind + 1 pair
  if (rankCounts[0] === 3 && rankCounts[1] === 2) {
    const trips = sorted.filter(c => counts[c.rank] === 3)
    const pair = sorted.filter(c => counts[c.rank] === 2)
    const ordered = [...trips, ...pair]

    return {
      type: 'full-house',
      cards: ordered as [Card, Card, Card, Card, Card],
      value: calculateValue('full-house', ordered),
      description: `Full House, ${trips[0].rank}s over ${pair[0].rank}s`
    }
  }

  // Flush: 5 cards of same suit
  if (flush) {
    return {
      type: 'flush',
      cards: sorted as [Card, Card, Card, Card, Card],
      value: calculateValue('flush', sorted),
      description: `Flush, ${sorted[0].rank} high`
    }
  }

  // Straight: 5 consecutive cards
  if (straight !== null) {
    return {
      type: 'straight',
      cards: sorted as [Card, Card, Card, Card, Card],
      value: calculateValue('straight', sorted),
      description: `Straight, ${sorted[0].rank} high`
    }
  }

  // Three of a Kind: 3 cards of same rank
  if (rankCounts[0] === 3) {
    const trips = sorted.filter(c => counts[c.rank] === 3)
    const kickers = sorted.filter(c => counts[c.rank] === 1)
    const ordered = [...trips, ...kickers]

    return {
      type: 'three-of-a-kind',
      cards: ordered as [Card, Card, Card, Card, Card],
      value: calculateValue('three-of-a-kind', ordered),
      description: `Three of a Kind, ${trips[0].rank}s`
    }
  }

  // Two Pair: 2 different pairs
  if (rankCounts[0] === 2 && rankCounts[1] === 2) {
    const pairs = sorted.filter(c => counts[c.rank] === 2)
    const kicker = sorted.find(c => counts[c.rank] === 1)!
    const ordered = [...pairs, kicker]

    return {
      type: 'two-pair',
      cards: ordered as [Card, Card, Card, Card, Card],
      value: calculateValue('two-pair', ordered),
      description: `Two Pair, ${pairs[0].rank}s and ${pairs[2].rank}s`
    }
  }

  // One Pair: 2 cards of same rank
  if (rankCounts[0] === 2) {
    const pair = sorted.filter(c => counts[c.rank] === 2)
    const kickers = sorted.filter(c => counts[c.rank] === 1)
    const ordered = [...pair, ...kickers]

    return {
      type: 'pair',
      cards: ordered as [Card, Card, Card, Card, Card],
      value: calculateValue('pair', ordered),
      description: `Pair of ${pair[0].rank}s`
    }
  }

  // High Card: No matches
  return {
    type: 'high-card',
    cards: sorted as [Card, Card, Card, Card, Card],
    value: calculateValue('high-card', sorted),
    description: `${sorted[0].rank} high`
  }
}
```

**Algorithm strategy:**
1. Calculate all properties once (flush, straight, counts)
2. Check hand types from best to worst
3. For each type, reorder cards by importance
4. Return as soon as we find a match

### 3.2 Calculate Numeric Value for Tiebreaking

```typescript
/**
 * Calculates a numeric value for comparing hands of the same type.
 * Higher value = better hand.
 *
 * @example
 * Pair of Aces (A-A-K-Q-J) vs Pair of Kings (K-K-A-Q-J)
 * Aces: 14*10^8 + 14*10^6 + 13*10^4 + 12*10^2 + 11 = higher
 * Kings: 13*10^8 + 13*10^6 + 14*10^4 + 12*10^2 + 11 = lower
 */
function calculateValue(type: HandType, cards: Card[]): number {
  // Base value from hand type (ensures flush always beats straight, etc.)
  let value = HAND_TYPE_VALUES[type] * 1e10

  // Add card values with decreasing significance
  // First card is worth more than second, etc.
  for (let i = 0; i < cards.length; i++) {
    const cardValue = RANK_VALUES[cards[i].rank]
    const positionalValue = cardValue * Math.pow(100, 4 - i)
    value += positionalValue
  }

  return value
}
```

**Why this math?**
- Hand type determines the billions place (flush = 6 billion, straight = 5 billion)
- Card ranks determine the lower places
- This lets us compare any two hands with a single number comparison!

---

## Part 4: Comparing Hands

```typescript
/**
 * Compares two poker hands.
 *
 * @returns
 *  - Positive if hand1 wins
 *  - Negative if hand2 wins
 *  - Zero if tie
 */
export function compareHands(hand1: HandRank, hand2: HandRank): number {
  return hand1.value - hand2.value
}
```

**That's it!** Because we calculated values correctly, comparison is trivial.

---

## Part 5: Finding Best Hand from 7 Cards

In Texas Hold'em, you have 2 hole cards + 5 community cards = 7 total. You need to find the best 5-card combination.

```typescript
/**
 * Finds the best 5-card poker hand from 7 cards.
 *
 * @param cards - 7 cards (2 hole cards + 5 community cards)
 * @returns The best possible HandRank
 */
export function findBestHand(cards: Card[]): HandRank {
  if (cards.length !== 7) {
    throw new Error(`findBestHand requires exactly 7 cards, got ${cards.length}`)
  }

  // Generate all possible 5-card combinations
  const combinations = getCombinations(cards, 5)

  // Evaluate each combination
  const evaluatedHands = combinations.map(combo => evaluateHand(combo))

  // Return the best one
  return evaluatedHands.reduce((best, current) =>
    compareHands(current, best) > 0 ? current : best
  )
}

/**
 * Generates all combinations of k items from array.
 *
 * @example
 * getCombinations([1,2,3], 2) // [[1,2], [1,3], [2,3]]
 */
function getCombinations<T>(array: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (k > array.length) return []

  const result: T[][] = []

  function backtrack(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current])
      return
    }

    for (let i = start; i < array.length; i++) {
      current.push(array[i])
      backtrack(i + 1, current)
      current.pop()
    }
  }

  backtrack(0, [])
  return result
}
```

**How many combinations?**
- C(7,5) = 21 combinations
- We evaluate all 21 and pick the best
- Fast enough for real-time gameplay!

**Alternative:** There are optimized algorithms that don't check all combinations, but for learning, this brute-force approach is clearest.

---

## Part 6: Your Implementation Tasks

Now it's your turn! Implement:

1. **Helper functions:**
   - `countCardsByRank()`
   - `isFlush()`
   - `checkStraight()`
   - `sortByRank()`
   - `calculateValue()`
   - `getCombinations()`

2. **Main functions:**
   - `evaluateHand()` - The big one!
   - `compareHands()` - Should be simple
   - `findBestHand()` - Uses the helpers

3. **Tests** (see Part 7)

---

## Part 7: Testing Your Implementation

See the complete test suite in the full guide. Key tests include:

- **All 10 hand types** - Royal flush down to high card
- **Tiebreaking** - Same hand type, different kickers
- **Edge cases** - Wheel straight, royal vs straight flush
- **Comparison** - Flush beats straight, etc.
- **Best hand from 7** - Correctly chooses from 21 combinations

---

## Validation Checklist

Before moving to Step 2, verify:

- [ ] All hand types are correctly identified
- [ ] Tiebreaking works (same type, different kickers)
- [ ] Wheel (A-2-3-4-5) handled correctly
- [ ] Royal flush is separate from straight flush
- [ ] Card ordering is correct for each hand type
- [ ] All tests pass
- [ ] 100% code coverage on `hand-evaluator.ts`
- [ ] No TypeScript errors

---

## Next Steps

Once all tests pass:

1. **Commit your work:**
   ```bash
   git add src/game/core/hand-evaluator.ts src/game/core/hand-evaluator.test.ts
   git commit -m "feat: implement hand evaluation with complete tests"
   ```

2. **Celebrate!** <� You can now determine poker hand winners!

3. **Move to Phase 2:** Game State Management

---

## Summary

You've learned:
-  The 10 poker hand rankings
-  How to identify each hand type algorithmically
-  How to calculate tiebreakers with numeric values
-  How to handle edge cases (wheel, royal flush)
-  How to find the best 5-card hand from 7 cards
-  Combinatorics basics (C(7,5) combinations)

**This is the brain of your poker game.** Every pot awarded, every showdown winner - it all goes through these functions. Get them right, and your poker game will be fair and accurate! <�
