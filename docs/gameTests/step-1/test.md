# Testing Guide: Card & Deck Utilities

## Philosophy

**Testing isn't optional - it's how you know your code works.** In poker, a single bug in card dealing or shuffling can ruin the entire game. Tests are your safety net.

We're using **Jest** - the most popular JavaScript testing framework. It's fast, has great error messages, and works seamlessly with TypeScript.

---

## Setup Jest (First Time Only)

### 1. Install Dependencies

```bash
npm install --save-dev jest @types/jest ts-jest @jest/globals
```

**What each package does:**
- `jest` - The testing framework
- `@types/jest` - TypeScript types for Jest
- `ts-jest` - Allows Jest to understand TypeScript
- `@jest/globals` - Type-safe global test functions

### 2. Create Jest Config

**File:** `jest.config.js` (in project root)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.d.ts',
  ],
}
```

**What this config does:**
- Uses `ts-jest` to run TypeScript tests
- Runs in Node environment (not browser)
- Looks for test files in `src/` directory
- Only counts `.test.ts` files as tests
- Excludes test files from coverage reports

### 3. Add Test Scripts to package.json

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:verbose": "jest --verbose"
  }
}
```

**What each script does:**
- `test` - Run all tests once
- `test:watch` - Re-run tests when files change (great for TDD)
- `test:coverage` - Show code coverage report
- `test:verbose` - Show detailed test output

---

## Test File Structure

### File Naming Convention

```
src/game/core/
├── cards.ts           # Implementation
└── cards.test.ts      # Tests (same name + .test.ts)
```

**Why this matters:** Jest automatically finds files ending in `.test.ts`

### Basic Test File Template

**File:** `src/game/core/cards.test.ts`

```typescript
import { describe, test, expect } from '@jest/globals'
import {
  createDeck,
  shuffleDeck,
  dealCards,
  compareCardsByRank,
  formatCard,
  formatCards,
  parseCard,
  parseCards,
  RANKS,
  SUITS,
  Card,
} from './cards'

describe('createDeck', () => {
  // Tests for createDeck go here
})

describe('shuffleDeck', () => {
  // Tests for shuffleDeck go here
})

describe('dealCards', () => {
  // Tests for dealCards go here
})

// ... more describe blocks for other functions
```

**Structure breakdown:**
- `describe()` - Groups related tests together
- `test()` - Individual test case (can also use `it()`)
- `expect()` - Assertion - what you expect to be true

---

## Writing Your First Test

### Anatomy of a Test

```typescript
test('creates a deck with 52 cards', () => {
  // 1. ARRANGE: Set up test data
  // (Nothing to set up here)

  // 2. ACT: Call the function being tested
  const deck = createDeck()

  // 3. ASSERT: Verify the result
  expect(deck).toHaveLength(52)
})
```

**The AAA Pattern:**
1. **Arrange** - Set up test data and conditions
2. **Act** - Execute the function you're testing
3. **Assert** - Verify the outcome matches expectations

### Common Jest Matchers

```typescript
// Equality
expect(value).toBe(5)                    // Exact equality (===)
expect(object).toEqual({ a: 1 })         // Deep equality (for objects/arrays)

// Truthiness
expect(value).toBeTruthy()               // Truthy value
expect(value).toBeFalsy()                // Falsy value
expect(value).toBeNull()                 // Exactly null
expect(value).toBeUndefined()            // Exactly undefined
expect(value).toBeDefined()              // Not undefined

// Numbers
expect(value).toBeGreaterThan(3)
expect(value).toBeGreaterThanOrEqual(3)
expect(value).toBeLessThan(5)
expect(value).toBeLessThanOrEqual(5)
expect(value).toBeCloseTo(0.3)           // For floating point

// Arrays & Strings
expect(array).toHaveLength(10)
expect(array).toContain('item')
expect(string).toMatch(/regex/)

// Exceptions
expect(() => {
  dangerousFunction()
}).toThrow()                             // Throws any error
expect(() => {
  dangerousFunction()
}).toThrow('specific error message')     // Throws with message
expect(() => {
  dangerousFunction()
}).toThrow(/error/i)                     // Throws with regex match
```

---

## Complete Test Suite for cards.ts

### Test 1: createDeck()

```typescript
describe('createDeck', () => {
  test('creates a deck with 52 cards', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(52)
  })

  test('creates cards with all rank/suit combinations', () => {
    const deck = createDeck()

    // Check we have exactly 13 of each suit
    for (const suit of SUITS) {
      const cardsOfSuit = deck.filter(card => card.suit === suit)
      expect(cardsOfSuit).toHaveLength(13)
    }

    // Check we have exactly 4 of each rank
    for (const rank of RANKS) {
      const cardsOfRank = deck.filter(card => card.rank === rank)
      expect(cardsOfRank).toHaveLength(4)
    }
  })

  test('creates unique cards (no duplicates)', () => {
    const deck = createDeck()

    // Convert to strings for comparison
    const cardStrings = deck.map(c => `${c.rank}${c.suit}`)
    const uniqueStrings = new Set(cardStrings)

    expect(uniqueStrings.size).toBe(52)
  })

  test('creates a new array each time', () => {
    const deck1 = createDeck()
    const deck2 = createDeck()

    // Should not be the same array reference
    expect(deck1).not.toBe(deck2)

    // But should have same contents
    expect(deck1).toEqual(deck2)
  })
})
```

**What we're testing:**
- ✅ Correct size (52 cards)
- ✅ All combinations present (13 per suit, 4 per rank)
- ✅ No duplicates
- ✅ Pure function (returns new array each time)

**Learning points:**
- Use `.filter()` to count cards matching criteria
- Use `Set` to detect duplicates
- `.toBe()` checks reference equality (`===`)
- `.toEqual()` checks deep value equality

### Test 2: shuffleDeck()

```typescript
describe('shuffleDeck', () => {
  test('returns a deck with same number of cards', () => {
    const deck = createDeck()
    const shuffled = shuffleDeck(deck)

    expect(shuffled).toHaveLength(52)
  })

  test('does not mutate the original deck', () => {
    const deck = createDeck()
    const original = [...deck]  // Keep a copy

    shuffleDeck(deck)

    expect(deck).toEqual(original)  // Unchanged
  })

  test('shuffled deck contains same cards as original', () => {
    const deck = createDeck()
    const shuffled = shuffleDeck(deck)

    // Should have same cards, just different order
    // Sort both by rank+suit to compare
    const sortFn = (a: Card, b: Card) =>
      `${a.rank}${a.suit}`.localeCompare(`${b.rank}${b.suit}`)

    expect([...shuffled].sort(sortFn)).toEqual([...deck].sort(sortFn))
  })

  test('shuffling changes the order (probabilistic test)', () => {
    const deck = createDeck()
    const shuffled = shuffleDeck(deck)

    // Check if at least SOME cards are in different positions
    // (Extremely unlikely for none to move with 52 cards)
    let differentCount = 0
    for (let i = 0; i < deck.length; i++) {
      if (deck[i] !== shuffled[i]) {
        differentCount++
      }
    }

    // Expect at least 40 cards in different positions
    // (Gives some room for random variation)
    expect(differentCount).toBeGreaterThan(40)
  })

  test('multiple shuffles produce different results', () => {
    const deck = createDeck()
    const shuffle1 = shuffleDeck(deck)
    const shuffle2 = shuffleDeck(deck)

    // Two shuffles should be different (almost certainly)
    expect(shuffle1).not.toEqual(shuffle2)
  })
})
```

**Testing randomness is tricky!**
- Can't test exact output (it's random)
- Use **probabilistic tests** - check it's "random enough"
- Set thresholds that will almost always pass if code is correct
- Could use seeded RNG for deterministic tests (advanced)

**Key insight:** We test **properties** of the shuffle, not specific outcomes:
- Same number of cards
- Same cards, different order
- Original unchanged
- Randomness (probabilistically)

### Test 3: dealCards()

```typescript
describe('dealCards', () => {
  test('deals the correct number of cards', () => {
    const deck = createDeck()
    const { dealt, remaining } = dealCards(deck, 5)

    expect(dealt).toHaveLength(5)
    expect(remaining).toHaveLength(47)
  })

  test('deals cards from the top of the deck', () => {
    const deck = createDeck()
    const { dealt } = dealCards(deck, 3)

    // Should be the first 3 cards
    expect(dealt[0]).toEqual(deck[0])
    expect(dealt[1]).toEqual(deck[1])
    expect(dealt[2]).toEqual(deck[2])
  })

  test('remaining deck contains cards in correct order', () => {
    const deck = createDeck()
    const { remaining } = dealCards(deck, 10)

    // Should start from card 10 (index 10)
    expect(remaining[0]).toEqual(deck[10])
    expect(remaining[41]).toEqual(deck[51])  // Last card
  })

  test('does not mutate the original deck', () => {
    const deck = createDeck()
    const original = [...deck]

    dealCards(deck, 5)

    expect(deck).toEqual(original)
  })

  test('can deal all cards', () => {
    const deck = createDeck()
    const { dealt, remaining } = dealCards(deck, 52)

    expect(dealt).toHaveLength(52)
    expect(remaining).toHaveLength(0)
  })

  test('can deal zero cards', () => {
    const deck = createDeck()
    const { dealt, remaining } = dealCards(deck, 0)

    expect(dealt).toHaveLength(0)
    expect(remaining).toHaveLength(52)
  })

  test('throws error when dealing more cards than available', () => {
    const deck = createDeck()

    expect(() => {
      dealCards(deck, 53)
    }).toThrow(/cannot deal/i)
  })

  test('throws error when dealing negative number', () => {
    const deck = createDeck()

    expect(() => {
      dealCards(deck, -1)
    }).toThrow(/negative/i)
  })
})
```

**Edge cases are critical!**
- Normal case (deal some cards)
- Boundary cases (deal all, deal zero)
- Error cases (deal too many, deal negative)
- Immutability (original deck unchanged)

**Testing exceptions:**
```typescript
expect(() => {
  riskyFunction()
}).toThrow()  // Any error

expect(() => {
  riskyFunction()
}).toThrow('exact error message')  // Specific message

expect(() => {
  riskyFunction()
}).toThrow(/partial match/i)  // Regex (case-insensitive with /i)
```

### Test 4: Utility Functions

```typescript
describe('compareCardsByRank', () => {
  test('ranks lower card as less than higher card', () => {
    const low = { rank: '2' as const, suit: 'hearts' as const }
    const high = { rank: 'A' as const, suit: 'spades' as const }

    expect(compareCardsByRank(low, high)).toBeLessThan(0)
    expect(compareCardsByRank(high, low)).toBeGreaterThan(0)
  })

  test('ranks same rank as equal', () => {
    const card1 = { rank: 'K' as const, suit: 'hearts' as const }
    const card2 = { rank: 'K' as const, suit: 'clubs' as const }

    expect(compareCardsByRank(card1, card2)).toBe(0)
  })
})

describe('formatCard', () => {
  test('formats card with rank and suit symbol', () => {
    expect(formatCard({ rank: 'A', suit: 'hearts' })).toBe('A♥')
    expect(formatCard({ rank: 'T', suit: 'spades' })).toBe('T♠')
    expect(formatCard({ rank: '7', suit: 'diamonds' })).toBe('7♦')
  })
})

describe('formatCards', () => {
  test('formats multiple cards with spacing', () => {
    const cards = [
      { rank: 'A' as const, suit: 'hearts' as const },
      { rank: 'K' as const, suit: 'hearts' as const },
    ]
    expect(formatCards(cards)).toBe('A♥ K♥')
  })

  test('handles empty array', () => {
    expect(formatCards([])).toBe('')
  })
})

describe('parseCard', () => {
  test('parses valid card strings', () => {
    expect(parseCard('AH')).toEqual({ rank: 'A', suit: 'hearts' })
    expect(parseCard('TS')).toEqual({ rank: 'T', suit: 'spades' })
    expect(parseCard('2D')).toEqual({ rank: '2', suit: 'diamonds' })
    expect(parseCard('KC')).toEqual({ rank: 'K', suit: 'clubs' })
  })

  test('is case-insensitive', () => {
    expect(parseCard('ah')).toEqual({ rank: 'A', suit: 'hearts' })
    expect(parseCard('Ah')).toEqual({ rank: 'A', suit: 'hearts' })
    expect(parseCard('aH')).toEqual({ rank: 'A', suit: 'hearts' })
  })

  test('throws on invalid rank', () => {
    expect(() => parseCard('XH')).toThrow(/invalid rank/i)
    expect(() => parseCard('1H')).toThrow(/invalid rank/i)
  })

  test('throws on invalid suit', () => {
    expect(() => parseCard('AX')).toThrow(/invalid suit/i)
    expect(() => parseCard('AB')).toThrow(/invalid suit/i)
  })

  test('throws on invalid length', () => {
    expect(() => parseCard('A')).toThrow(/2 characters/i)
    expect(() => parseCard('AHS')).toThrow(/2 characters/i)
    expect(() => parseCard('')).toThrow(/2 characters/i)
  })
})

describe('parseCards', () => {
  test('parses multiple cards from space-separated string', () => {
    const result = parseCards('AH KH QH JH TH')
    expect(result).toHaveLength(5)
    expect(result[0]).toEqual({ rank: 'A', suit: 'hearts' })
    expect(result[4]).toEqual({ rank: 'T', suit: 'hearts' })
  })

  test('handles extra whitespace', () => {
    const result = parseCards('  AH   KH  ')
    expect(result).toHaveLength(2)
  })

  test('handles single card', () => {
    const result = parseCards('AH')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ rank: 'A', suit: 'hearts' })
  })
})
```

---

## Running Your Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run only tests matching "cards"
npm test cards

# Run in watch mode (re-runs on file save)
npm run test:watch

# Run with coverage report
npm run test:coverage
```

### Understanding Test Output

**Successful test run:**
```
PASS  src/game/core/cards.test.ts
  createDeck
    ✓ creates a deck with 52 cards (2 ms)
    ✓ creates cards with all rank/suit combinations (3 ms)
    ✓ creates unique cards (no duplicates) (1 ms)
    ✓ creates a new array each time (1 ms)
  shuffleDeck
    ✓ returns a deck with same number of cards (1 ms)
    ✓ does not mutate the original deck (1 ms)
    ...

Test Suites: 1 passed, 1 total
Tests:       20 passed, 20 total
Time:        2.456 s
```

**Failed test:**
```
FAIL  src/game/core/cards.test.ts
  createDeck
    ✕ creates a deck with 52 cards (5 ms)

  ● createDeck › creates a deck with 52 cards

    expect(received).toHaveLength(expected)

    Expected length: 52
    Received length: 48
    Received array:  [{"rank": "2", "suit": "hearts"}, ...]

      at Object.<anonymous> (src/game/core/cards.test.ts:12:18)
```

**What to look for:**
- `✓` = Passed
- `✕` = Failed
- Red text shows what went wrong
- Line numbers tell you where the failure occurred

### Coverage Report

```bash
npm run test:coverage
```

**Output:**
```
--------------------|---------|----------|---------|---------|
File                | % Stmts | % Branch | % Funcs | % Lines |
--------------------|---------|----------|---------|---------|
All files           |     100 |      100 |     100 |     100 |
 cards.ts           |     100 |      100 |     100 |     100 |
--------------------|---------|----------|---------|---------|
```

**What coverage means:**
- **Stmts** - Percentage of statements executed
- **Branch** - Percentage of if/else paths tested
- **Funcs** - Percentage of functions called
- **Lines** - Percentage of lines executed

**Goal:** Aim for 100% coverage on core game logic.

---

## Test-Driven Development (TDD) Workflow

### The Red-Green-Refactor Cycle

1. **RED** - Write a failing test
   ```typescript
   test('creates a deck with 52 cards', () => {
     const deck = createDeck()
     expect(deck).toHaveLength(52)
   })
   ```
   Run test → It fails (red) because `createDeck()` doesn't exist yet

2. **GREEN** - Write minimal code to make it pass
   ```typescript
   export function createDeck(): Card[] {
     return SUITS.flatMap(suit =>
       RANKS.map(rank => ({ rank, suit }))
     )
   }
   ```
   Run test → It passes (green)

3. **REFACTOR** - Improve the code while keeping tests green
   - Clean up variable names
   - Extract common logic
   - Optimize performance
   - Run tests after each change

**Benefits:**
- Tests prove your code works
- Tests document expected behavior
- Safe to refactor (tests catch breaks)
- Prevents over-engineering (only write what you need)

---

## Common Testing Mistakes

### ❌ Mistake 1: Testing Implementation Instead of Behavior

```typescript
// BAD: Testing internal details
test('uses flatMap to create deck', () => {
  const code = createDeck.toString()
  expect(code).toContain('flatMap')
})

// GOOD: Testing behavior
test('creates a deck with 52 cards', () => {
  const deck = createDeck()
  expect(deck).toHaveLength(52)
})
```

**Why?** You should be able to refactor implementation without breaking tests.

### ❌ Mistake 2: Tests That Don't Actually Test Anything

```typescript
// BAD: Always passes
test('createDeck works', () => {
  createDeck()
  expect(true).toBe(true)
})

// GOOD: Actually verifies behavior
test('creates a deck with 52 cards', () => {
  const deck = createDeck()
  expect(deck).toHaveLength(52)
})
```

### ❌ Mistake 3: Overly Complex Tests

```typescript
// BAD: Doing too much
test('deck functions work together', () => {
  const deck = createDeck()
  const shuffled = shuffleDeck(deck)
  const { dealt, remaining } = dealCards(shuffled, 5)
  expect(dealt).toHaveLength(5)
  expect(remaining).toHaveLength(47)
  // If this fails, which function is broken?
})

// GOOD: One function, one concept per test
test('dealCards deals correct number', () => {
  const deck = createDeck()
  const { dealt } = dealCards(deck, 5)
  expect(dealt).toHaveLength(5)
})
```

### ❌ Mistake 4: Not Testing Edge Cases

```typescript
// BAD: Only testing happy path
test('deals cards', () => {
  const deck = createDeck()
  const { dealt } = dealCards(deck, 5)
  expect(dealt).toHaveLength(5)
})

// GOOD: Also test edge cases
test('deals zero cards', () => { ... })
test('deals all cards', () => { ... })
test('throws when dealing too many', () => { ... })
```

---

## Debugging Failed Tests

### Strategy 1: Read the Error Message

Jest gives detailed error messages:
```
Expected: 52
Received: 51
```

This tells you exactly what went wrong!

### Strategy 2: Add Console Logs

```typescript
test('creates unique cards', () => {
  const deck = createDeck()
  console.log('Deck length:', deck.length)
  console.log('First 3 cards:', deck.slice(0, 3))

  const cardStrings = deck.map(c => `${c.rank}${c.suit}`)
  console.log('Card strings:', cardStrings)

  const uniqueStrings = new Set(cardStrings)
  expect(uniqueStrings.size).toBe(52)
})
```

Run with `npm test -- --verbose` to see console output.

### Strategy 3: Isolate the Test

```bash
# Run only one test file
npm test cards.test

# Run only tests matching a pattern
npm test -- -t "creates a deck"
```

### Strategy 4: Use test.only

```typescript
// Only run this one test
test.only('creates a deck with 52 cards', () => {
  const deck = createDeck()
  expect(deck).toHaveLength(52)
})

// All other tests are skipped
test('other test', () => { ... })
```

**Remember to remove `.only` before committing!**

---

## Checklist: Your Tests Are Good When...

- [ ] All tests pass (`npm test`)
- [ ] 100% code coverage (`npm run test:coverage`)
- [ ] Each test has a clear, descriptive name
- [ ] Tests are independent (can run in any order)
- [ ] Edge cases are covered (zero, max, negative, etc.)
- [ ] Error cases are tested (throws expected errors)
- [ ] No console.logs left in tests
- [ ] Tests run fast (< 1 second for all card tests)
- [ ] If you break the code, at least one test fails

---

## Next Steps

1. **Write your tests first** (or alongside implementation)
2. **Run tests frequently** - Use watch mode: `npm run test:watch`
3. **Keep tests simple** - One concept per test
4. **Test behavior, not implementation** - Focus on what it does, not how

Once all tests pass, you have **proof** your card utilities work correctly. That's powerful! 🎯

Now you can confidently build on top of this foundation, knowing that if you accidentally break something, your tests will catch it immediately.

---

## Quick Reference

```bash
# Install Jest
npm install --save-dev jest @types/jest ts-jest @jest/globals

# Run tests
npm test                    # All tests
npm test cards              # Match pattern
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report

# In test files
describe('group', () => {})  # Group related tests
test('description', () => {}) # Individual test
expect(value).toBe(5)        # Assertion

# Common matchers
.toBe()                      # ===
.toEqual()                   # Deep equality
.toHaveLength()              # Array/string length
.toThrow()                   # Expects error
.toBeTruthy()                # Truthy value
.toBeGreaterThan()           # >
```
