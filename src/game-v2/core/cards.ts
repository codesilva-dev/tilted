/**
 * Card types, deck operations, and hand evaluation
 */

// ============================================================================
// Ranks
// ============================================================================

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export const RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;

export const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// ============================================================================
// Suits
// ============================================================================

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'] as const;

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

export const SUIT_COLORS: Record<Suit, 'red' | 'black'> = {
  hearts: 'red',
  diamonds: 'red',
  clubs: 'black',
  spades: 'black',
};

// ============================================================================
// Card
// ============================================================================

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

// ============================================================================
// Deck Operations
// ============================================================================

export function createDeck(): Card[] {
  return SUITS.flatMap(suit => RANKS.map(rank => ({ rank, suit })));
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(
  deck: Card[],
  count: number
): { dealt: Card[]; remaining: Card[] } {
  if (count < 0) throw new Error('Cannot deal negative cards');
  if (count > deck.length) throw new Error(`Cannot deal ${count} cards from deck of ${deck.length}`);

  return {
    dealt: deck.slice(0, count),
    remaining: deck.slice(count),
  };
}

// ============================================================================
// Card Utilities
// ============================================================================

export function compareCardsByRank(a: Card, b: Card): number {
  return RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
}

export function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

export function formatCards(cards: Card[]): string {
  return cards.map(formatCard).join(' ');
}

export function parseCard(str: string): Card {
  if (str.length !== 2) throw new Error(`Invalid card: "${str}"`);

  const rank = str[0].toUpperCase() as Rank;
  const suitChar = str[1].toUpperCase();

  const suitMap: Record<string, Suit> = {
    H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades',
  };

  if (!RANKS.includes(rank)) throw new Error(`Invalid rank: "${rank}"`);
  const suit = suitMap[suitChar];
  if (!suit) throw new Error(`Invalid suit: "${suitChar}"`);

  return { rank, suit };
}

export function parseCards(str: string): Card[] {
  return str.trim().split(/\s+/).map(parseCard);
}

// ============================================================================
// Hand Types
// ============================================================================

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
  | 'royal-flush';

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
};

export interface HandRank {
  type: HandType;
  cards: [Card, Card, Card, Card, Card];
  value: number;
  description: string;
}

// ============================================================================
// Hand Evaluation Helpers
// ============================================================================

function countCardsByRank(cards: Card[]): Record<Rank, number> {
  const counts: Partial<Record<Rank, number>> = {};
  for (const card of cards) {
    counts[card.rank] = (counts[card.rank] || 0) + 1;
  }
  return counts as Record<Rank, number>;
}

function isFlush(cards: Card[]): boolean {
  if (cards.length === 0) return false;
  const firstSuit = cards[0].suit;
  return cards.every(card => card.suit === firstSuit);
}

function checkStraight(cards: Card[]): number | null {
  if (cards.length !== 5) return null;

  const sorted = [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);

  // Check consecutive
  let isConsecutive = true;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (RANK_VALUES[sorted[i].rank] - RANK_VALUES[sorted[i + 1].rank] !== 1) {
      isConsecutive = false;
      break;
    }
  }

  if (isConsecutive) {
    return RANK_VALUES[sorted[0].rank];
  }

  // Check wheel (A-2-3-4-5)
  const ranks = sorted.map(c => c.rank).join('');
  if (ranks === 'A5432') {
    return 5; // 5-high straight
  }

  return null;
}

function sortByRank(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
}

function calculateValue(type: HandType, cards: Card[]): number {
  let value = HAND_TYPE_VALUES[type] * 1e10;
  for (let i = 0; i < cards.length; i++) {
    value += RANK_VALUES[cards[i].rank] * Math.pow(100, 4 - i);
  }
  return value;
}

// ============================================================================
// Hand Evaluation
// ============================================================================

export function evaluateHand(cards: Card[]): HandRank {
  if (cards.length !== 5) {
    throw new Error(`evaluateHand requires exactly 5 cards, got ${cards.length}`);
  }

  const sorted = sortByRank(cards);
  const counts = countCardsByRank(cards);
  const rankCounts = Object.values(counts).sort((a, b) => b - a);
  const flush = isFlush(cards);
  const straight = checkStraight(cards);

  // Royal Flush
  if (flush && straight === 14) {
    return {
      type: 'royal-flush',
      cards: sorted as [Card, Card, Card, Card, Card],
      value: calculateValue('royal-flush', sorted),
      description: 'Royal Flush',
    };
  }

  // Straight Flush
  if (flush && straight !== null) {
    return {
      type: 'straight-flush',
      cards: sorted as [Card, Card, Card, Card, Card],
      value: calculateValue('straight-flush', sorted),
      description: `Straight Flush, ${sorted[0].rank} high`,
    };
  }

  // Four of a Kind
  if (rankCounts[0] === 4) {
    const quads = sorted.filter(c => counts[c.rank] === 4);
    const kicker = sorted.find(c => counts[c.rank] === 1)!;
    const ordered = [...quads, kicker];
    return {
      type: 'four-of-a-kind',
      cards: ordered as [Card, Card, Card, Card, Card],
      value: calculateValue('four-of-a-kind', ordered),
      description: `Four of a Kind, ${quads[0].rank}s`,
    };
  }

  // Full House
  if (rankCounts[0] === 3 && rankCounts[1] === 2) {
    const trips = sorted.filter(c => counts[c.rank] === 3);
    const pair = sorted.filter(c => counts[c.rank] === 2);
    const ordered = [...trips, ...pair];
    return {
      type: 'full-house',
      cards: ordered as [Card, Card, Card, Card, Card],
      value: calculateValue('full-house', ordered),
      description: `Full House, ${trips[0].rank}s over ${pair[0].rank}s`,
    };
  }

  // Flush
  if (flush) {
    return {
      type: 'flush',
      cards: sorted as [Card, Card, Card, Card, Card],
      value: calculateValue('flush', sorted),
      description: `Flush, ${sorted[0].rank} high`,
    };
  }

  // Straight
  if (straight !== null) {
    let orderedCards = sorted;
    if (straight === 5 && sorted[0].rank === 'A') {
      orderedCards = [...sorted.slice(1), sorted[0]];
    }
    return {
      type: 'straight',
      cards: orderedCards as [Card, Card, Card, Card, Card],
      value: calculateValue('straight', orderedCards),
      description: `Straight, ${orderedCards[0].rank} high`,
    };
  }

  // Three of a Kind
  if (rankCounts[0] === 3) {
    const trips = sorted.filter(c => counts[c.rank] === 3);
    const kickers = sorted.filter(c => counts[c.rank] === 1);
    const ordered = [...trips, ...kickers];
    return {
      type: 'three-of-a-kind',
      cards: ordered as [Card, Card, Card, Card, Card],
      value: calculateValue('three-of-a-kind', ordered),
      description: `Three of a Kind, ${trips[0].rank}s`,
    };
  }

  // Two Pair
  if (rankCounts[0] === 2 && rankCounts[1] === 2) {
    const pairs = sorted.filter(c => counts[c.rank] === 2);
    const kicker = sorted.find(c => counts[c.rank] === 1)!;
    const ordered = [...pairs, kicker];
    return {
      type: 'two-pair',
      cards: ordered as [Card, Card, Card, Card, Card],
      value: calculateValue('two-pair', ordered),
      description: `Two Pair, ${pairs[0].rank}s and ${pairs[2].rank}s`,
    };
  }

  // One Pair
  if (rankCounts[0] === 2) {
    const pair = sorted.filter(c => counts[c.rank] === 2);
    const kickers = sorted.filter(c => counts[c.rank] === 1);
    const ordered = [...pair, ...kickers];
    return {
      type: 'pair',
      cards: ordered as [Card, Card, Card, Card, Card],
      value: calculateValue('pair', ordered),
      description: `Pair of ${pair[0].rank}s`,
    };
  }

  // High Card
  return {
    type: 'high-card',
    cards: sorted as [Card, Card, Card, Card, Card],
    value: calculateValue('high-card', sorted),
    description: `High Card, ${sorted[0].rank}`,
  };
}

export function compareHands(hand1: HandRank, hand2: HandRank): number {
  const diff = hand1.value - hand2.value;
  return Math.abs(diff) < 0.5 ? 0 : diff;
}

export function findBestHand(cards: Card[]): HandRank {
  if (cards.length !== 7) {
    throw new Error(`findBestHand requires exactly 7 cards, got ${cards.length}`);
  }

  const combinations = getCombinations(cards, 5);
  const evaluated = combinations.map(evaluateHand);
  return evaluated.reduce((best, current) =>
    compareHands(current, best) > 0 ? current : best
  );
}

function getCombinations<T>(array: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > array.length) return [];

  const result: T[][] = [];

  function backtrack(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < array.length; i++) {
      current.push(array[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}
