/**
 * Dealing - Deal cards to seats and community
 */

import { TableState, getNextOccupiedPosition, MAX_SEATS } from '../types/game-state';
import { Card, createDeck, shuffleDeck, dealCards } from '../core/cards';

/**
 * Create and shuffle a new deck for the table
 */
export function initializeDeck(table: TableState): TableState {
  return {
    ...table,
    deck: shuffleDeck(createDeck()),
    communityCards: [],
  };
}

/**
 * Deal hole cards to all active seats
 *
 * Deals in order starting from small blind position (left of dealer).
 * Each seat gets 2 cards.
 */
export function dealHoleCards(table: TableState): TableState {
  let newTable = { ...table, seats: table.seats.map(s => ({ ...s })) };
  let deck = [...table.deck];

  // Get list of seat positions to deal to, in order
  const dealOrder: number[] = [];
  let pos = table.smallBlindPosition;

  // Go around the table starting from SB
  for (let i = 0; i < MAX_SEATS; i++) {
    const seat = newTable.seats[pos];
    // Deal to seats that are active (have a player with chips)
    if (seat.handStatus === 'active' || seat.handStatus === 'all-in') {
      dealOrder.push(pos);
    }
    pos = (pos + 1) % MAX_SEATS;
  }

  // Deal 2 cards to each seat
  for (const seatPos of dealOrder) {
    const { dealt, remaining } = dealCards(deck, 2);
    newTable.seats[seatPos] = {
      ...newTable.seats[seatPos],
      holeCards: dealt,
    };
    deck = remaining;
  }

  newTable.deck = deck;
  return newTable;
}

/**
 * Deal the flop (3 community cards)
 */
export function dealFlop(table: TableState): TableState {
  if (table.currentStreet !== 'pre-flop') {
    throw new Error('Can only deal flop from pre-flop');
  }

  // Burn 1, deal 3
  const { dealt, remaining } = dealCards(table.deck, 4);
  const flopCards = dealt.slice(1); // Skip burn card

  return {
    ...table,
    deck: remaining,
    communityCards: flopCards,
    currentStreet: 'flop',
  };
}

/**
 * Deal the turn (1 community card)
 */
export function dealTurn(table: TableState): TableState {
  if (table.currentStreet !== 'flop') {
    throw new Error('Can only deal turn from flop');
  }

  // Burn 1, deal 1
  const { dealt, remaining } = dealCards(table.deck, 2);
  const turnCard = dealt[1]; // Skip burn card

  return {
    ...table,
    deck: remaining,
    communityCards: [...table.communityCards, turnCard],
    currentStreet: 'turn',
  };
}

/**
 * Deal the river (1 community card)
 */
export function dealRiver(table: TableState): TableState {
  if (table.currentStreet !== 'turn') {
    throw new Error('Can only deal river from turn');
  }

  // Burn 1, deal 1
  const { dealt, remaining } = dealCards(table.deck, 2);
  const riverCard = dealt[1]; // Skip burn card

  return {
    ...table,
    deck: remaining,
    communityCards: [...table.communityCards, riverCard],
    currentStreet: 'river',
  };
}

/**
 * Deal next street (auto-detect which)
 */
export function dealNextStreet(table: TableState): TableState {
  switch (table.currentStreet) {
    case 'pre-flop':
      return dealFlop(table);
    case 'flop':
      return dealTurn(table);
    case 'turn':
      return dealRiver(table);
    case 'river':
      throw new Error('Cannot deal after river');
    case 'showdown':
      throw new Error('Cannot deal during showdown');
    default:
      throw new Error(`Unknown street: ${table.currentStreet}`);
  }
}
