import { describe, test, expect } from '@jest/globals';
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
} from './cards';

describe('createDeck', () => {

    test('creates a standard 52-card deck', () => {
        const deck = createDeck();
        expect(deck).toHaveLength(52);
    })

    test('creats cards with all rank/suit combinations', () => {
        const deck = createDeck();
        
        for(const suit of SUITS){
            const cardsOfSuit = deck.filter(card => card.suit === suit)
            expect(cardsOfSuit).toHaveLength(13);
        }

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

});

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