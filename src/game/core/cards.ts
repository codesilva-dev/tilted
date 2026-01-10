// =======================================================================================
// RANKS
// =======================================================================================

import { throws } from "assert";
import { count } from "console";

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export const RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
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

// =======================================================================================
// SUITS
// =======================================================================================

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export const SUIT_SYMBOLS: Record<Suit, string> = {
    'hearts': '♥',
    'diamonds': '♦',
    'clubs': '♣',
    'spades': '♠',
}
export const SUIT_COLORS: Record<Suit, 'red' | 'black'> = {
    hearts: 'red',
    diamonds: 'red',
    clubs: 'black',
    spades: 'black',
}

// =======================================================================================
// CARD
// =======================================================================================

export interface Card {
    readonly rank: Rank
    readonly suit: Suit
}

//========================================================================================
// DECK CREATION
//========================================================================================

export function createDeck(): Card[] {
    
    return SUITS.flatMap(suit =>
        RANKS.map(rank => ({rank, suit}))
    )
}

export function shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length -1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));

        const temp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = temp;
    }
    return shuffled;
}

export function dealCards(
    deck: Card[],
    count: number
): { dealt: Card[]; remaining: Card[] } {

    if(count < 0) throw new Error('Cannot deal negative number of cards');

    if (count > deck.length) throw new Error(`Cannot deal ${count} cards from deck of ${deck.length}`);
    
    const dealt = deck.slice(0, count);
    const remaining = deck.slice(count);

    return { dealt, remaining };
}

export function compareCardsByRank(card1: Card, card2: Card) : number {
    return RANK_VALUES[card1.rank] - RANK_VALUES[card2.rank];
}

export function formatCard(card: Card): string {
    return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

export function formatCards(cards: Card[]): string {
    return cards.map(formatCard).join(' ')
}

export function parseCard(str: string): Card {
    if (str.length !== 2) throw new Error(`Invalid card string: "${str}" (must be 2 characters)`);
    
    const rank = str[0].toUpperCase() as Rank;
    const suitChar = str[1].toUpperCase();

    const suitMap: Record<string, Suit> = {
        'H': 'hearts',
        'D': 'diamonds',
        'C': 'clubs',
        'S': 'spades',
    }
    
    const suit = suitMap[suitChar];

    if (!RANKS.includes(rank)) throw new Error(`Invalid rank: "${rank}"`);

    if (!suit) throw new Error(`Invalid suit: "${suitChar}"`);

    return { rank, suit };
}

export function parseCards(str: string): Card[] {
    return str.trim().split(/\s+/).map(parseCard);
}