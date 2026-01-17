/**
 * Table Factory - Create and initialize table state
 */

import { TableState, Seat, createEmptySeat, MAX_SEATS } from '../types/game-state';

export interface TableConfig {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
}

/**
 * Create a new table with empty seats
 */
export function createTable(config: TableConfig): TableState {
  const seats: Seat[] = [];
  for (let i = 0; i < MAX_SEATS; i++) {
    seats.push(createEmptySeat(i));
  }

  return {
    id: config.id,
    name: config.name,
    seats,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    minBuyIn: config.minBuyIn,
    maxBuyIn: config.maxBuyIn,
    handNumber: 0,
    currentStreet: 'waiting',
    communityCards: [],
    pot: 0,
    currentBet: 0,
    lastRaiseAmount: config.bigBlind,
    deck: [],
    dealerPosition: 0,
    smallBlindPosition: 0,
    bigBlindPosition: 0,
    activePosition: null,
    handStartedAt: null,
  };
}

/**
 * Create a table with default config for testing
 */
export function createTestTable(
  id: string = 'test-table',
  smallBlind: number = 10,
  bigBlind: number = 20
): TableState {
  return createTable({
    id,
    name: `Test Table ${id}`,
    smallBlind,
    bigBlind,
    minBuyIn: bigBlind * 20,  // 20 BB min
    maxBuyIn: bigBlind * 100, // 100 BB max
  });
}
