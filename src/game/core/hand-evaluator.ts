import {Card, Rank, RANK_VALUES } from './cards';
export type HandType =  'high-card' | 'pair' | 'two-pair' | 'three-of-a-kind' | 'straight' | 'flush' | 'full-house' | 'four-of-a-kind' | 'straight-flush' | 'royal-flush';
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

export interface HandRank {
    type: HandType

    cards: [Card, Card, Card, Card, Card]

    value: number

    description: string

}

function countCardsByRank(cards: Card[]): Record<Rank, number> {
    const counts: Partial<Record<Rank, number>> = {}

    for (const card of cards) {
        counts[card.rank] = (counts[card.rank] || 0) + 1
    }

    return counts as Record<Rank, number>
}

function isFlush(cards: Card[]): boolean {
    if (cards.length === 0) return false

    const firstSuit = cards[0].suit
    return cards.every(card => card.suit === firstSuit)
}

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

function sortByRank(cards: Card[]): Card[] {
    return [...cards].sort((a, b) =>
    RANK_VALUES[b.rank] - RANK_VALUES[a.rank]
    )
}

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
        let orderedCards = sorted;
        if (straight === 5 && sorted[0].rank === 'A') {
            orderedCards = [...sorted.slice(1), sorted[0]]
        }
        return {
        type: 'straight',
        cards: orderedCards as [Card, Card, Card, Card, Card],
        value: calculateValue('straight', orderedCards),
        description: `Straight, ${orderedCards[0].rank} high`
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

export function compareHands(hand1: HandRank, hand2: HandRank): number {
    // Use a small epsilon for floating point comparison safety
    const diff = hand1.value - hand2.value;
    // If the difference is very small (less than 0.5), consider them equal
    if (Math.abs(diff) < 0.5) {
        return 0;
    }
    return diff;
}

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