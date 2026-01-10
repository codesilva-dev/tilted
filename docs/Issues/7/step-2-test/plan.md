# Testing Guide: Hand Evaluator

## Overview

Testing the hand evaluator is **critical** - this is the code that determines who wins money. A bug here means players lose chips unfairly or the game breaks completely.

The good news? Hand evaluation is **deterministic** (no randomness), so tests are straightforward: given these cards, you should get this result. Every time.

**Prerequisites:** Step 1 completed (cards.ts and parseCards() working)

---

## File Structure

```
src/game/core/
├── cards.ts                    # Already done
├── cards.test.ts              # Already done
├── hand-evaluator.ts          # Implement this
└── hand-evaluator.test.ts     # Create these tests
```

---

## Test File Setup

**File:** `src/game/core/hand-evaluator.test.ts`

```typescript
import { describe, test, expect } from '@jest/globals'
import { evaluateHand, compareHands, findBestHand } from './hand-evaluator'
import { parseCards } from './cards'

describe('Hand Evaluator', () => {
  // All tests go here
})
```

**Pro tip:** Use `parseCards()` from cards.ts to write cleaner tests:
```typescript
// Instead of this:
const hand = [
  { rank: 'A', suit: 'hearts' },
  { rank: 'K', suit: 'hearts' },
  // ... etc
]

// Do this:
const hand = parseCards('AH KH QH JH TH')  // Much cleaner!
```

---

## Test Suite Structure

We'll test in this order:
1. **Each hand type** (10 tests) - Royal flush to high card
2. **Hand comparisons** (6 tests) - Which hand beats which
3. **Kicker scenarios** (5 tests) - Same hand, different kickers
4. **Edge cases** (4 tests) - Wheel straight, etc.
5. **Best hand from 7 cards** (3 tests) - Texas Hold'em scenarios

**Total: ~30 tests** covering all scenarios

---

## Part 1: Testing Hand Types

### Test 1: Royal Flush

```typescript
describe('Royal Flush', () => {
  test('identifies royal flush in hearts', () => {
    const hand = evaluateHand(parseCards('AH KH QH JH TH'))

    expect(hand.type).toBe('royal-flush')
    expect(hand.description).toBe('Royal Flush')
  })

  test('identifies royal flush in any suit', () => {
    const hands = [
      parseCards('AS KS QS JS TS'),  // Spades
      parseCards('AD KD QD JD TD'),  // Diamonds
      parseCards('AC KC QC JC TC'),  // Clubs
    ]

    for (const cards of hands) {
      const result = evaluateHand(cards)
      expect(result.type).toBe('royal-flush')
    }
  })
})
```

**Why test all suits?** To ensure suit doesn't affect detection.

### Test 2: Straight Flush

```typescript
describe('Straight Flush', () => {
  test('identifies straight flush', () => {
    const hand = evaluateHand(parseCards('9S 8S 7S 6S 5S'))

    expect(hand.type).toBe('straight-flush')
    expect(hand.description).toContain('Straight Flush')
    expect(hand.description).toContain('9')  // High card
  })

  test('identifies low straight flush (steel wheel)', () => {
    const hand = evaluateHand(parseCards('5D 4D 3D 2D AD'))

    expect(hand.type).toBe('straight-flush')
    // In a wheel, 5 is high (not Ace)
  })

  test('does not confuse with royal flush', () => {
    const hand = evaluateHand(parseCards('KH QH JH TH 9H'))

    expect(hand.type).toBe('straight-flush')
    expect(hand.type).not.toBe('royal-flush')
  })
})
```

**Critical test:** Steel wheel (A-2-3-4-5 suited) is straight flush, not royal!

### Test 3: Four of a Kind

```typescript
describe('Four of a Kind', () => {
  test('identifies four of a kind', () => {
    const hand = evaluateHand(parseCards('7H 7D 7C 7S AH'))

    expect(hand.type).toBe('four-of-a-kind')
    expect(hand.description).toContain('7s')
  })

  test('orders cards correctly (quads first, then kicker)', () => {
    const hand = evaluateHand(parseCards('AH 7D 7C 7S 7H'))

    // First 4 cards should be the quads
    expect(hand.cards[0].rank).toBe('7')
    expect(hand.cards[1].rank).toBe('7')
    expect(hand.cards[2].rank).toBe('7')
    expect(hand.cards[3].rank).toBe('7')
    expect(hand.cards[4].rank).toBe('A')  // Kicker last
  })
})
```

**Why test ordering?** Card order matters for tiebreaking!

### Test 4: Full House

```typescript
describe('Full House', () => {
  test('identifies full house', () => {
    const hand = evaluateHand(parseCards('KH KD KC 3S 3H'))

    expect(hand.type).toBe('full-house')
    expect(hand.description).toContain('Kings')
    expect(hand.description).toContain('3s')
  })

  test('orders cards correctly (trips first, then pair)', () => {
    const hand = evaluateHand(parseCards('3H 3D KH KC KS'))

    // First 3 cards should be the trips
    expect(hand.cards[0].rank).toBe('K')
    expect(hand.cards[1].rank).toBe('K')
    expect(hand.cards[2].rank).toBe('K')
    // Last 2 cards are the pair
    expect(hand.cards[3].rank).toBe('3')
    expect(hand.cards[4].rank).toBe('3')
  })
})
```

### Test 5: Flush

```typescript
describe('Flush', () => {
  test('identifies flush', () => {
    const hand = evaluateHand(parseCards('AH KH 9H 5H 2H'))

    expect(hand.type).toBe('flush')
    expect(hand.description).toContain('Flush')
    expect(hand.description).toContain('A')  // High card
  })

  test('does not require consecutive cards', () => {
    const hand = evaluateHand(parseCards('AS TS 7S 4S 2S'))

    expect(hand.type).toBe('flush')
  })

  test('all cards must be same suit', () => {
    // 4 hearts + 1 spade is NOT a flush
    const hand = evaluateHand(parseCards('AH KH QH JH TS'))

    expect(hand.type).not.toBe('flush')
  })
})
```

### Test 6: Straight

```typescript
describe('Straight', () => {
  test('identifies straight', () => {
    const hand = evaluateHand(parseCards('9H 8S 7D 6C 5H'))

    expect(hand.type).toBe('straight')
  })

  test('identifies wheel (A-2-3-4-5)', () => {
    const hand = evaluateHand(parseCards('5H 4S 3D 2C AH'))

    expect(hand.type).toBe('straight')
    // Ace is LOW in wheel
  })

  test('identifies broadway (T-J-Q-K-A)', () => {
    const hand = evaluateHand(parseCards('AH KS QD JC TH'))

    expect(hand.type).toBe('straight')
  })

  test('suits can be mixed', () => {
    const hand = evaluateHand(parseCards('9H 8S 7D 6C 5H'))

    expect(hand.type).toBe('straight')
  })

  test('does not wrap around (K-A-2-3-4 is NOT a straight)', () => {
    const hand = evaluateHand(parseCards('KH AS 2D 3C 4H'))

    expect(hand.type).not.toBe('straight')
  })
})
```

**Critical edge case:** K-A-2-3-4 is NOT a straight! Only A-2-3-4-5 works.

### Test 7: Three of a Kind

```typescript
describe('Three of a Kind', () => {
  test('identifies three of a kind', () => {
    const hand = evaluateHand(parseCards('8H 8D 8C AH KS'))

    expect(hand.type).toBe('three-of-a-kind')
  })

  test('orders cards correctly (trips first, kickers descending)', () => {
    const hand = evaluateHand(parseCards('KH AH 8D 8C 8S'))

    expect(hand.cards[0].rank).toBe('8')
    expect(hand.cards[1].rank).toBe('8')
    expect(hand.cards[2].rank).toBe('8')
    expect(hand.cards[3].rank).toBe('A')  // Higher kicker first
    expect(hand.cards[4].rank).toBe('K')
  })
})
```

### Test 8: Two Pair

```typescript
describe('Two Pair', () => {
  test('identifies two pair', () => {
    const hand = evaluateHand(parseCards('JH JD 4C 4S AH'))

    expect(hand.type).toBe('two-pair')
  })

  test('orders cards correctly (high pair, low pair, kicker)', () => {
    const hand = evaluateHand(parseCards('4H AH JD 4C JS'))

    expect(hand.cards[0].rank).toBe('J')  // Higher pair first
    expect(hand.cards[1].rank).toBe('J')
    expect(hand.cards[2].rank).toBe('4')  // Lower pair second
    expect(hand.cards[3].rank).toBe('4')
    expect(hand.cards[4].rank).toBe('A')  // Kicker last
  })
})
```

### Test 9: One Pair

```typescript
describe('One Pair', () => {
  test('identifies one pair', () => {
    const hand = evaluateHand(parseCards('QH QD KS 9C 3H'))

    expect(hand.type).toBe('pair')
  })

  test('orders cards correctly (pair first, kickers descending)', () => {
    const hand = evaluateHand(parseCards('3H QD 9C KS QH'))

    expect(hand.cards[0].rank).toBe('Q')
    expect(hand.cards[1].rank).toBe('Q')
    expect(hand.cards[2].rank).toBe('K')  // Highest kicker
    expect(hand.cards[3].rank).toBe('9')
    expect(hand.cards[4].rank).toBe('3')  // Lowest kicker
  })
})
```

### Test 10: High Card

```typescript
describe('High Card', () => {
  test('identifies high card', () => {
    const hand = evaluateHand(parseCards('AH KD 9S 5C 2H'))

    expect(hand.type).toBe('high-card')
    expect(hand.description).toContain('A high')
  })

  test('orders cards descending by rank', () => {
    const hand = evaluateHand(parseCards('2H 9S 5C KD AH'))

    expect(hand.cards[0].rank).toBe('A')
    expect(hand.cards[1].rank).toBe('K')
    expect(hand.cards[2].rank).toBe('9')
    expect(hand.cards[3].rank).toBe('5')
    expect(hand.cards[4].rank).toBe('2')
  })
})
```

---

## Part 2: Testing Hand Comparisons

### Test Hand Type Hierarchy

```typescript
describe('Hand Comparisons', () => {
  test('royal flush beats everything', () => {
    const royalFlush = evaluateHand(parseCards('AH KH QH JH TH'))
    const straightFlush = evaluateHand(parseCards('9S 8S 7S 6S 5S'))

    expect(compareHands(royalFlush, straightFlush)).toBeGreaterThan(0)
  })

  test('straight flush beats four of a kind', () => {
    const straightFlush = evaluateHand(parseCards('9S 8S 7S 6S 5S'))
    const quads = evaluateHand(parseCards('KH KD KC KS AH'))

    expect(compareHands(straightFlush, quads)).toBeGreaterThan(0)
  })

  test('four of a kind beats full house', () => {
    const quads = evaluateHand(parseCards('7H 7D 7C 7S AH'))
    const fullHouse = evaluateHand(parseCards('KH KD KC 3S 3H'))

    expect(compareHands(quads, fullHouse)).toBeGreaterThan(0)
  })

  test('full house beats flush', () => {
    const fullHouse = evaluateHand(parseCards('KH KD KC 3S 3H'))
    const flush = evaluateHand(parseCards('AH KH 9H 5H 2H'))

    expect(compareHands(fullHouse, flush)).toBeGreaterThan(0)
  })

  test('flush beats straight', () => {
    const flush = evaluateHand(parseCards('AH KH 9H 5H 2H'))
    const straight = evaluateHand(parseCards('9S 8D 7C 6H 5S'))

    expect(compareHands(flush, straight)).toBeGreaterThan(0)
  })

  test('straight beats three of a kind', () => {
    const straight = evaluateHand(parseCards('9H 8S 7D 6C 5H'))
    const trips = evaluateHand(parseCards('KH KD KC 5S 2H'))

    expect(compareHands(straight, trips)).toBeGreaterThan(0)
  })
})
```

---

## Part 3: Testing Kickers

### Critical: Same Hand Type, Different Kickers

```typescript
describe('Kicker Comparisons', () => {
  test('pair: same pair, higher first kicker wins', () => {
    const hand1 = evaluateHand(parseCards('AH AS KD QC JH'))  // A-A-K-Q-J
    const hand2 = evaluateHand(parseCards('AH AS QD JC TH'))  // A-A-Q-J-T

    expect(compareHands(hand1, hand2)).toBeGreaterThan(0)
  })

  test('pair: same pair and first kicker, second kicker wins', () => {
    const hand1 = evaluateHand(parseCards('AH AS KD QC JH'))  // A-A-K-Q-J
    const hand2 = evaluateHand(parseCards('AH AS KD JC TH'))  // A-A-K-J-T

    expect(compareHands(hand1, hand2)).toBeGreaterThan(0)
  })

  test('pair: same pair and two kickers, third kicker wins', () => {
    const hand1 = evaluateHand(parseCards('AH AS KD QC 9H'))  // A-A-K-Q-9
    const hand2 = evaluateHand(parseCards('AH AS KD QC 8H'))  // A-A-K-Q-8

    expect(compareHands(hand1, hand2)).toBeGreaterThan(0)
  })

  test('two pair: same pairs, kicker decides', () => {
    const hand1 = evaluateHand(parseCards('KH KD 7S 7C AH'))  // K-K-7-7-A
    const hand2 = evaluateHand(parseCards('KH KD 7S 7C QH'))  // K-K-7-7-Q

    expect(compareHands(hand1, hand2)).toBeGreaterThan(0)
  })

  test('three of a kind: same trips, higher kicker wins', () => {
    const hand1 = evaluateHand(parseCards('8H 8D 8C AH KS'))  // 8-8-8-A-K
    const hand2 = evaluateHand(parseCards('8H 8D 8C AH QS'))  // 8-8-8-A-Q

    expect(compareHands(hand1, hand2)).toBeGreaterThan(0)
  })

  test('flush: higher high card wins', () => {
    const queenHigh = evaluateHand(parseCards('QH TH 8H 5H 2H'))  // Q-high flush
    const jackHigh = evaluateHand(parseCards('JS TS 8S 5S 2S'))   // J-high flush

    expect(compareHands(queenHigh, jackHigh)).toBeGreaterThan(0)
  })

  test('flush: same high card, second card decides', () => {
    const flush1 = evaluateHand(parseCards('QH JH 8H 5H 2H'))  // Q-J-8-5-2
    const flush2 = evaluateHand(parseCards('QS TS 8S 5S 2S'))  // Q-T-8-5-2

    expect(compareHands(flush1, flush2)).toBeGreaterThan(0)
  })

  test('straight: higher straight wins', () => {
    const nineStraight = evaluateHand(parseCards('9H 8S 7D 6C 5H'))  // 9-high
    const eightStraight = evaluateHand(parseCards('8H 7S 6D 5C 4H')) // 8-high

    expect(compareHands(nineStraight, eightStraight)).toBeGreaterThan(0)
  })

  test('full house: higher trips wins', () => {
    const kingsOverFives = evaluateHand(parseCards('KH KD KC 5S 5H'))  // K-K-K-5-5
    const queensOverAces = evaluateHand(parseCards('QH QD QC AS AH'))  // Q-Q-Q-A-A

    expect(compareHands(kingsOverFives, queensOverAces)).toBeGreaterThan(0)
  })

  test('full house: same trips, higher pair wins', () => {
    const kingsOverFives = evaluateHand(parseCards('KH KD KC 5S 5H'))  // K-K-K-5-5
    const kingsOverThrees = evaluateHand(parseCards('KH KD KC 3S 3H')) // K-K-K-3-3

    expect(compareHands(kingsOverFives, kingsOverThrees)).toBeGreaterThan(0)
  })

  test('four of a kind: higher quads wins', () => {
    const aceQuads = evaluateHand(parseCards('AH AD AC AS KH'))  // A-A-A-A-K
    const kingQuads = evaluateHand(parseCards('KH KD KC KS AH')) // K-K-K-K-A

    expect(compareHands(aceQuads, kingQuads)).toBeGreaterThan(0)
  })

  test('four of a kind: same quads, kicker decides', () => {
    const quadsWithAce = evaluateHand(parseCards('7H 7D 7C 7S AH'))  // 7-7-7-7-A
    const quadsWithKing = evaluateHand(parseCards('7H 7D 7C 7S KH')) // 7-7-7-7-K

    expect(compareHands(quadsWithAce, quadsWithKing)).toBeGreaterThan(0)
  })
})
```

**Why so many kicker tests?** Kicker disputes are THE most common source of confusion in poker!

---

## Part 4: Edge Cases

### Test Tricky Scenarios

```typescript
describe('Edge Cases', () => {
  test('wheel (A-2-3-4-5) loses to 6-high straight', () => {
    const wheel = evaluateHand(parseCards('5H 4D 3C 2S AH'))
    const sixHigh = evaluateHand(parseCards('6H 5D 4C 3S 2H'))

    expect(compareHands(sixHigh, wheel)).toBeGreaterThan(0)
  })

  test('steel wheel (A-2-3-4-5 suited) is straight flush, not royal', () => {
    const steelWheel = evaluateHand(parseCards('5D 4D 3D 2D AD'))

    expect(steelWheel.type).toBe('straight-flush')
    expect(steelWheel.type).not.toBe('royal-flush')
  })

  test('identical hands result in tie', () => {
    const hand1 = evaluateHand(parseCards('AH KD QC JS TH'))
    const hand2 = evaluateHand(parseCards('AS KC QD JH TS'))

    expect(compareHands(hand1, hand2)).toBe(0)
  })

  test('throws error when not exactly 5 cards', () => {
    expect(() => {
      evaluateHand(parseCards('AH KD QC'))
    }).toThrow(/exactly 5 cards/)

    expect(() => {
      evaluateHand(parseCards('AH KD QC JS TH 9H'))
    }).toThrow(/exactly 5 cards/)
  })
})
```

---

## Part 5: Testing findBestHand (7 Cards)

### The Texas Hold'em Scenario

```typescript
describe('findBestHand (7 cards)', () => {
  test('finds royal flush from 7 cards', () => {
    // 2 hole cards + 5 community = royal flush possible
    const cards = parseCards('AH KH QH JH TH 2D 3C')
    const best = findBestHand(cards)

    expect(best.type).toBe('royal-flush')
  })

  test('finds full house over two pair', () => {
    // Can make both full house and two pair
    const cards = parseCards('KH KD KC 5S 5H 2D 3C')
    const best = findBestHand(cards)

    expect(best.type).toBe('full-house')
  })

  test('uses best 5 cards, ignoring worst 2', () => {
    // Should make broadway straight, ignoring 3 and 2
    const cards = parseCards('AH KD QC JS TH 3D 2C')
    const best = findBestHand(cards)

    expect(best.type).toBe('straight')
    expect(best.description).toContain('A')  // Ace-high straight
  })

  test('finds flush when 5+ cards of same suit available', () => {
    // 6 hearts available
    const cards = parseCards('AH KH QH JH 9H 2H 3C')
    const best = findBestHand(cards)

    expect(best.type).toBe('flush')
  })

  test('throws error when not exactly 7 cards', () => {
    expect(() => {
      findBestHand(parseCards('AH KD QC JS TH'))
    }).toThrow(/exactly 7 cards/)
  })
})
```

---

## Part 6: Comprehensive Hand Ranking Test

### Test Every Hand Beats Lower Hands

```typescript
describe('Complete Hand Hierarchy', () => {
  test('each hand type beats all lower types', () => {
    const hands = {
      'royal-flush': parseCards('AH KH QH JH TH'),
      'straight-flush': parseCards('9S 8S 7S 6S 5S'),
      'four-of-a-kind': parseCards('KH KD KC KS AH'),
      'full-house': parseCards('QH QD QC 5S 5H'),
      'flush': parseCards('AH KH 9H 5H 2H'),
      'straight': parseCards('9H 8S 7D 6C 5H'),
      'three-of-a-kind': parseCards('8H 8D 8C AH KS'),
      'two-pair': parseCards('JH JD 4C 4S AH'),
      'pair': parseCards('QH QD KS 9C 3H'),
      'high-card': parseCards('AH KD 9S 5C 2H'),
    }

    const types = Object.keys(hands)
    const evaluated = Object.fromEntries(
      types.map(type => [type, evaluateHand(hands[type])])
    )

    // Test that each hand beats all lower hands
    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        const higher = evaluated[types[i]]
        const lower = evaluated[types[j]]

        expect(compareHands(higher, lower)).toBeGreaterThan(0)
      }
    }
  })
})
```

**This single test verifies the entire hierarchy!**

---

## Validation Checklist

Before moving to Phase 2, verify:

- [ ] All 10 hand types correctly identified
- [ ] Hand type hierarchy correct (royal beats straight flush, etc.)
- [ ] Kicker comparisons work for pairs, two pair, trips
- [ ] Wheel (A-2-3-4-5) handled correctly
- [ ] Steel wheel (A-2-3-4-5 suited) is straight flush, not royal
- [ ] findBestHand chooses best from 21 combinations
- [ ] Identical hands result in tie (return 0)
- [ ] All tests pass
- [ ] 100% code coverage on hand-evaluator.ts

---

## Running the Tests

```bash
# Run all tests
npm test

# Run only hand evaluator tests
npm test hand-evaluator

# Watch mode (re-runs on save)
npm run test:watch hand-evaluator

# Coverage report
npm run test:coverage
```

**Expected output:**
```
PASS  src/game/core/hand-evaluator.test.ts
  Royal Flush
    ✓ identifies royal flush in hearts (2 ms)
    ✓ identifies royal flush in any suit (3 ms)
  Straight Flush
    ✓ identifies straight flush (1 ms)
    ✓ identifies low straight flush (steel wheel) (1 ms)
    ✓ does not confuse with royal flush (1 ms)
  Four of a Kind
    ✓ identifies four of a kind (1 ms)
    ✓ orders cards correctly (1 ms)
  ...

Test Suites: 1 passed, 1 total
Tests:       30 passed, 30 total
Time:        1.234 s
```

---

## Common Testing Pitfalls

### Pitfall 1: Not Testing Card Ordering

```typescript
// BAD: Only checks type
test('identifies full house', () => {
  const hand = evaluateHand(parseCards('KH KD KC 3S 3H'))
  expect(hand.type).toBe('full-house')
  // But are cards ordered correctly for tiebreaking?
})

// GOOD: Verifies ordering
test('orders full house correctly', () => {
  const hand = evaluateHand(parseCards('3H 3D KH KC KS'))
  expect(hand.cards[0].rank).toBe('K')  // Trips first!
  expect(hand.cards[3].rank).toBe('3')  // Pair last
})
```

### Pitfall 2: Not Testing Edge Cases

```typescript
// BAD: Only tests broadway
test('identifies straight', () => {
  const hand = evaluateHand(parseCards('AH KS QD JC TH'))
  expect(hand.type).toBe('straight')
})

// GOOD: Tests wheel too
test('identifies wheel (A-2-3-4-5)', () => {
  const hand = evaluateHand(parseCards('5H 4S 3D 2C AH'))
  expect(hand.type).toBe('straight')
})
```

### Pitfall 3: Not Testing Kickers

```typescript
// BAD: Only tests different pairs
test('higher pair wins', () => {
  const aces = evaluateHand(parseCards('AH AS KD QC JH'))
  const kings = evaluateHand(parseCards('KH KS AD QC JH'))
  expect(compareHands(aces, kings)).toBeGreaterThan(0)
})

// GOOD: Also tests same pair, different kickers
test('same pair, higher kicker wins', () => {
  const hand1 = evaluateHand(parseCards('AH AS KD QC JH'))
  const hand2 = evaluateHand(parseCards('AH AS QD JC TH'))
  expect(compareHands(hand1, hand2)).toBeGreaterThan(0)
})
```

---

## Debugging Tips

### Visualize Hand Values

```typescript
test('debug hand comparison', () => {
  const hand1 = evaluateHand(parseCards('AH AS KD QC JH'))
  const hand2 = evaluateHand(parseCards('AH AS QD JC TH'))

  console.log('Hand 1:', hand1.description, 'value:', hand1.value)
  console.log('Hand 2:', hand2.description, 'value:', hand2.value)
  console.log('Difference:', hand1.value - hand2.value)

  expect(compareHands(hand1, hand2)).toBeGreaterThan(0)
})
```

Run with `npm test -- --verbose` to see console output.

### Use test.only for Focused Debugging

```typescript
test.only('debug this specific case', () => {
  const hand = evaluateHand(parseCards('5H 4S 3D 2C AH'))
  console.log('Hand:', hand)
  expect(hand.type).toBe('straight')
})
```

---

## Summary

You've learned how to:
- Test all 10 poker hand types
- Verify hand type hierarchy (which beats which)
- Test kicker scenarios thoroughly
- Handle edge cases (wheel, steel wheel, ties)
- Test the 7-card best hand finder
- Write deterministic tests (no randomness)

**With these tests passing, you have proof your hand evaluator is correct.** Every showdown will be fair, every pot will go to the right player. That's the foundation of a trustworthy poker game!
