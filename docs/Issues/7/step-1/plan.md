# Step 1.1: Card & Deck Utilities - Complete Implementation Guide

## Overview

You're building the most fundamental piece of the poker game: **cards**. Everything else depends on this working correctly. This module has zero dependencies and is 100% testable in isolation.

**Time estimate:** 1-2 hours
**Difficulty:** Beginner-friendly
**Prerequisites:** Basic TypeScript knowledge

---

## File Structure

Create these two files:

```
src/game/core/
├── cards.ts          # Implementation
└── cards.test.ts     # Tests
```

---

## Part 1: Type Definitions

### 1.1 Define Card Ranks

**File:** `src/game/core/cards.ts`

```typescript
/**
 * Card ranks in poker, ordered from lowest to highest.
 * Using string literals for type safety.
 */
export type Rank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'T'  // Ten
  | 'J'  // Jack
  | 'Q'  // Queen
  | 'K'  // King
  | 'A'  // Ace

/**
 * Numeric values for each rank (used for comparisons).
 * Ace is high (14) in most comparisons, but can be low (1) in straights.
 */
export const RANK_VALUES: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  'T': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'A': 14,
}

/**
 * All possible ranks in order.
 * Useful for iteration and validation.
 */
export const RANKS: readonly Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'
] as const
```

**Design decisions:**
- **Why 'T' instead of '10'?** Standard poker notation. Makes cards like "TH" (Ten of Hearts) easier to parse.
- **Why const for RANK_VALUES?** Prevents accidental mutation.
- **Why readonly array?** TypeScript ensures RANKS can't be modified.

### 1.2 Define Card Suits

```typescript
/**
 * The four suits in a standard deck.
 * Using full names for clarity (not ♠♥♦♣ symbols).
 */
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'

/**
 * All possible suits in standard order.
 */
export const SUITS: readonly Suit[] = [
  'hearts',
  'diamonds',
  'clubs',
  'spades'
] as const

/**
 * Optional: Unicode symbols for display purposes.
 * Not used in game logic, just for pretty printing.
 */
export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

/**
 * Optional: Colors for each suit.
 * Useful for UI rendering later.
 */
export const SUIT_COLORS: Record<Suit, 'red' | 'black'> = {
  hearts: 'red',
  diamonds: 'red',
  clubs: 'black',
  spades: 'black',
}
```

**Design decisions:**
- **Why strings instead of enums?** More flexible, works better with JSON serialization.
- **Why include symbols/colors?** You'll need them later for UI, but they're separate from game logic.

### 1.3 Define the Card Type

```typescript
/**
 * Represents a single playing card.
 * Immutable - once created, a card never changes.
 */
export interface Card {
  readonly rank: Rank
  readonly suit: Suit
}
```

**Design decisions:**
- **Why an interface instead of a class?** Simpler, lighter weight. No methods needed; cards are just data.
- **Why readonly?** Cards shouldn't change after creation. A 7 of hearts is always a 7 of hearts.
- **What about an ID?** Not needed. The combination of rank + suit is already unique.

---

## Part 2: Core Functions

### 2.1 Create a Full Deck

```typescript
/**
 * Creates a standard 52-card deck (13 ranks × 4 suits).
 * Cards are in a predictable order (not shuffled).
 *
 * @returns Array of 52 cards
 *
 * @example
 * const deck = createDeck()
 * console.log(deck.length) // 52
 * console.log(deck[0])     // { rank: '2', suit: 'hearts' }
 */
export function createDeck(): Card[] {
  // TODO: Implement this
  // Hint: Use nested loops or .flatMap()
  // Outer loop: SUITS
  // Inner loop: RANKS
  // Create a card for each combination
}
```

**Implementation hints:**

**Approach 1: Nested loops (traditional)**
```typescript
const deck: Card[] = []
for (const suit of SUITS) {
  for (const rank of RANKS) {
    deck.push({ rank, suit })
  }
}
return deck
```

**Approach 2: Functional (recommended)**
```typescript
return SUITS.flatMap(suit =>
  RANKS.map(rank => ({ rank, suit }))
)
```

**Which to choose?**
- Loops: More explicit, easier for beginners
- FlatMap: More concise, more "functional"
- **Pick the one you understand better!**

### 2.2 Shuffle a Deck

```typescript
/**
 * Shuffles a deck using the Fisher-Yates algorithm.
 * Creates a NEW array (does not mutate the input).
 *
 * @param deck - The deck to shuffle
 * @returns A new shuffled deck
 *
 * @example
 * const deck = createDeck()
 * const shuffled = shuffleDeck(deck)
 * console.log(deck === shuffled) // false (different arrays)
 */
export function shuffleDeck(deck: Card[]): Card[] {
  // TODO: Implement Fisher-Yates shuffle
  // 1. Create a copy of the deck (don't mutate input)
  // 2. For each position from end to start:
  //    - Pick a random position from 0 to current
  //    - Swap current card with random card
  // 3. Return shuffled copy
}
```

**Implementation guide:**

**Step 1: Copy the deck**
```typescript
const shuffled = [...deck]  // Spread operator creates shallow copy
```

**Step 2: Fisher-Yates algorithm**
```typescript
for (let i = shuffled.length - 1; i > 0; i--) {
  // Pick random index from 0 to i (inclusive)
  const j = Math.floor(Math.random() * (i + 1))

  // Swap elements at i and j
  const temp = shuffled[i]
  shuffled[i] = shuffled[j]
  shuffled[j] = temp
}
```

**Alternative: Modern array destructuring swap**
```typescript
[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
```

**Why Fisher-Yates?**
- **Unbiased**: Every permutation equally likely
- **Efficient**: O(n) time complexity
- **Industry standard**: Used everywhere in game development

### 2.3 Deal Cards from Deck

```typescript
/**
 * Deals a specified number of cards from the top of the deck.
 * Returns both the dealt cards AND the remaining deck.
 * Does NOT mutate the input deck.
 *
 * @param deck - The deck to deal from
 * @param count - Number of cards to deal
 * @returns Object with dealt cards and remaining deck
 * @throws Error if trying to deal more cards than available
 *
 * @example
 * const deck = createDeck()
 * const { dealt, remaining } = dealCards(deck, 2)
 * console.log(dealt.length)      // 2
 * console.log(remaining.length)  // 50
 * console.log(deck.length)       // 52 (unchanged!)
 */
export function dealCards(
  deck: Card[],
  count: number
): { dealt: Card[]; remaining: Card[] } {
  // TODO: Implement
  // 1. Validate count (can't deal more than deck size)
  // 2. Extract first 'count' cards
  // 3. Create remaining deck (everything after 'count')
  // 4. Return both
}
```

**Implementation guide:**

**Step 1: Validation**
```typescript
if (count < 0) {
  throw new Error('Cannot deal negative number of cards')
}

if (count > deck.length) {
  throw new Error(
    `Cannot deal ${count} cards from deck of ${deck.length}`
  )
}
```

**Step 2: Deal cards**
```typescript
const dealt = deck.slice(0, count)      // First 'count' cards
const remaining = deck.slice(count)      // Everything after

return { dealt, remaining }
```

---

## Part 3: Utility Functions (Optional but Recommended)

### 3.1 Card Comparison

```typescript
/**
 * Compares two cards by rank.
 *
 * @returns
 *  - Negative if card1 < card2
 *  - Zero if equal ranks
 *  - Positive if card1 > card2
 */
export function compareCardsByRank(card1: Card, card2: Card): number {
  return RANK_VALUES[card1.rank] - RANK_VALUES[card2.rank]
}
```

### 3.2 Card Formatting

```typescript
/**
 * Converts a card to a human-readable string.
 */
export function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`
}

/**
 * Formats multiple cards with spacing.
 */
export function formatCards(cards: Card[]): string {
  return cards.map(formatCard).join(' ')
}
```

### 3.3 Card Parsing (Advanced)

```typescript
/**
 * Parses a string like "AH" into a Card object.
 * Useful for writing compact tests.
 */
export function parseCard(str: string): Card {
  if (str.length !== 2) {
    throw new Error(`Invalid card string: "${str}" (must be 2 characters)`)
  }

  const rank = str[0].toUpperCase() as Rank
  const suitChar = str[1].toUpperCase()

  // Map single character to full suit name
  const suitMap: Record<string, Suit> = {
    'H': 'hearts',
    'D': 'diamonds',
    'C': 'clubs',
    'S': 'spades',
  }

  const suit = suitMap[suitChar]

  if (!RANKS.includes(rank)) {
    throw new Error(`Invalid rank: "${rank}"`)
  }

  if (!suit) {
    throw new Error(`Invalid suit: "${suitChar}"`)
  }

  return { rank, suit }
}

/**
 * Parse multiple cards from a space-separated string.
 */
export function parseCards(str: string): Card[] {
  return str.trim().split(/\s+/).map(parseCard)
}
```

---

## Part 4: Your Task

Now it's your turn! Implement the functions marked with `// TODO` in `src/game/core/cards.ts`, and create comprehensive tests in `src/game/core/cards.test.ts`.

Refer to the full test examples in the original instructions if you need guidance on writing tests.

---

## Validation Checklist

Before moving to Step 1.2, verify:

- [ ] All tests pass with `npm test`
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] Code is properly formatted
- [ ] Functions are documented with JSDoc comments
- [ ] No `any` types used
- [ ] All functions are exported
- [ ] Constants are readonly/const
- [ ] No console.logs left in code

---

## Next Steps

Once all tests pass:

1. **Commit your work:**
   ```bash
   git add src/game/core/cards.ts src/game/core/cards.test.ts
   git commit -m "feat: implement card and deck utilities with tests"
   ```

2. **Move to Step 1.2:** Hand evaluation

3. **Celebrate!** 🎉 You've built your first building block of the poker engine!
