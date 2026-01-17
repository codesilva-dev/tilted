/**
 * Tilted v2 - Seat-Based Game State
 *
 * Key difference from v1: Seats own cards, not players.
 * Players can leave mid-hand without breaking state.
 */

import { Card, HandRank } from '../core/cards';

// ============================================================================
// Constants
// ============================================================================

export const MAX_SEATS = 10;

// ============================================================================
// Street / Game Phase
// ============================================================================

export type Street = 'waiting' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';

// ============================================================================
// Seat Types
// ============================================================================

/**
 * Status of a seat in the current hand
 */
export type SeatHandStatus =
  | 'empty'       // No one sitting here
  | 'sitting-out' // Player sitting but opted out of this hand
  | 'active'      // In hand, waiting to act or has acted
  | 'folded'      // In hand, folded
  | 'all-in'      // In hand, all chips committed
  | 'abandoned';  // Player left mid-hand, will auto-fold on turn

/**
 * A seat at the poker table.
 *
 * The seat holds all hand-related state (cards, bets).
 * The player info can be null if the seat is empty or abandoned.
 */
export interface Seat {
  position: number; // 0-9, fixed

  // === Hand State (belongs to seat) ===
  holeCards: Card[];
  currentBet: number;        // Bet in current betting round
  totalBetInHand: number;    // Total contributed to pot this hand
  handStatus: SeatHandStatus;
  hasActed: boolean;         // Has acted in current betting round

  // === Player State (can be null) ===
  playerId: string | null;
  playerName: string | null;
  stack: number;             // Chips (stays with seat if player leaves mid-hand)

  // === Display State (set at showdown) ===
  isWinner?: boolean;
  handRank?: HandRank;
  winAmount?: number;
}

// ============================================================================
// Table State
// ============================================================================

/**
 * Complete state of a poker table.
 *
 * The seats array is the source of truth for hand state.
 * Positions reference seat indices (0-9), not player IDs.
 */
export interface TableState {
  // === Identity ===
  id: string;
  name: string;

  // === Seats (source of truth) ===
  seats: Seat[]; // Fixed array of 10 seats

  // === Table Config ===
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;

  // === Hand State ===
  handNumber: number;
  currentStreet: Street;
  communityCards: Card[];
  pot: number;
  currentBet: number;        // Current bet to match
  lastRaiseAmount: number;   // For min-raise calculation
  deck: Card[];

  // === Positions (seat indices) ===
  dealerPosition: number;
  smallBlindPosition: number;
  bigBlindPosition: number;
  activePosition: number | null; // Which seat should act (null = no action needed)

  // === Timing ===
  handStartedAt: Date | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty seat at a given position
 */
export function createEmptySeat(position: number): Seat {
  return {
    position,
    holeCards: [],
    currentBet: 0,
    totalBetInHand: 0,
    handStatus: 'empty',
    hasActed: false,
    playerId: null,
    playerName: null,
    stack: 0,
  };
}

/**
 * Check if a seat is occupied (has a player or is abandoned mid-hand)
 */
export function isSeatOccupied(seat: Seat): boolean {
  return seat.handStatus !== 'empty';
}

/**
 * Check if a seat is in the current hand (can win pot)
 */
export function isSeatInHand(seat: Seat): boolean {
  return seat.handStatus === 'active' ||
         seat.handStatus === 'all-in' ||
         seat.handStatus === 'abandoned'; // Abandoned seats are still in until folded
}

/**
 * Check if a seat can act (is active and not all-in)
 */
export function canSeatAct(seat: Seat): boolean {
  return seat.handStatus === 'active';
}

/**
 * Get all occupied seats (has a player sitting)
 */
export function getOccupiedSeats(table: TableState): Seat[] {
  return table.seats.filter(s => s.playerId !== null || s.handStatus === 'abandoned');
}

/**
 * Get all seats currently in the hand
 */
export function getSeatsInHand(table: TableState): Seat[] {
  return table.seats.filter(isSeatInHand);
}

/**
 * Get all seats that can still act
 */
export function getActiveSeats(table: TableState): Seat[] {
  return table.seats.filter(canSeatAct);
}

/**
 * Get the seat at a position
 */
export function getSeat(table: TableState, position: number): Seat {
  return table.seats[position];
}

/**
 * Get seat by player ID (returns null if player not seated)
 */
export function getSeatByPlayerId(table: TableState, playerId: string): Seat | null {
  return table.seats.find(s => s.playerId === playerId) ?? null;
}

/**
 * Find the next occupied seat position after a given position
 * Used for dealer button rotation, blind posting, etc.
 */
export function getNextOccupiedPosition(
  fromPosition: number,
  table: TableState,
  filter?: (seat: Seat) => boolean
): number | null {
  const filterFn = filter ?? ((s: Seat) => s.playerId !== null);

  for (let i = 1; i <= MAX_SEATS; i++) {
    const pos = (fromPosition + i) % MAX_SEATS;
    const seat = table.seats[pos];
    if (filterFn(seat)) {
      return pos;
    }
  }
  return null;
}

/**
 * Find the next active seat position (can act)
 */
export function getNextActivePosition(
  fromPosition: number,
  table: TableState
): number | null {
  return getNextOccupiedPosition(fromPosition, table, canSeatAct);
}

/**
 * Count players at the table (with chips, excluding empty/abandoned)
 */
export function countPlayers(table: TableState): number {
  return table.seats.filter(s => s.playerId !== null && s.stack > 0).length;
}

/**
 * Count seats in the current hand
 */
export function countSeatsInHand(table: TableState): number {
  return getSeatsInHand(table).length;
}
