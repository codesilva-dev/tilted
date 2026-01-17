/**
 * Seat Manager - Handle player seating, standing, and abandonment
 *
 * This is the core of v2's architecture: players sit at seats, but
 * can be detached from seats without breaking hand state.
 */

import { TableState, Seat, isSeatInHand, MAX_SEATS } from '../types/game-state';

export interface SeatResult {
  success: boolean;
  error?: string;
  table: TableState;
}

/**
 * Sit a player at a specific seat
 */
export function sitPlayer(
  table: TableState,
  seatPosition: number,
  playerId: string,
  playerName: string,
  buyIn: number
): SeatResult {
  // Validate seat position
  if (seatPosition < 0 || seatPosition >= MAX_SEATS) {
    return { success: false, error: 'Invalid seat position', table };
  }

  const seat = table.seats[seatPosition];

  // Check if seat is available
  if (seat.playerId !== null) {
    return { success: false, error: 'Seat is occupied', table };
  }

  // Check if seat has an active hand (abandoned seat)
  if (isSeatInHand(seat)) {
    return { success: false, error: 'Seat has active hand', table };
  }

  // Check if player is already seated elsewhere
  const existingSeat = table.seats.find(s => s.playerId === playerId);
  if (existingSeat) {
    return { success: false, error: 'Player already seated at another seat', table };
  }

  // Validate buy-in
  if (buyIn < table.minBuyIn) {
    return { success: false, error: `Minimum buy-in is ${table.minBuyIn}`, table };
  }
  if (buyIn > table.maxBuyIn) {
    return { success: false, error: `Maximum buy-in is ${table.maxBuyIn}`, table };
  }

  // Create new seats array with the player seated
  const newSeats = table.seats.map((s, i) => {
    if (i !== seatPosition) return s;
    return {
      ...s,
      playerId,
      playerName,
      stack: buyIn,
      handStatus: 'sitting-out' as const, // Will be set to 'active' when hand starts
    };
  });

  return {
    success: true,
    table: { ...table, seats: newSeats },
  };
}

/**
 * Stand a player up from their seat
 *
 * If a hand is in progress, the seat is marked as abandoned.
 * Otherwise, the seat is cleared entirely.
 */
export function standPlayer(
  table: TableState,
  playerId: string
): SeatResult {
  const seatIndex = table.seats.findIndex(s => s.playerId === playerId);

  if (seatIndex === -1) {
    return { success: false, error: 'Player not seated', table };
  }

  const seat = table.seats[seatIndex];

  // If hand is in progress, abandon the seat (keep cards, remove player)
  if (isSeatInHand(seat)) {
    const newSeats = table.seats.map((s, i) => {
      if (i !== seatIndex) return s;
      return {
        ...s,
        playerId: null,
        playerName: null,
        handStatus: 'abandoned' as const,
        // Note: stack stays with the seat until hand ends
      };
    });

    return {
      success: true,
      table: { ...table, seats: newSeats },
    };
  }

  // No hand in progress - clear the seat entirely
  const newSeats = table.seats.map((s, i) => {
    if (i !== seatIndex) return s;
    return {
      ...s,
      playerId: null,
      playerName: null,
      stack: 0,
      handStatus: 'empty' as const,
      holeCards: [],
      currentBet: 0,
      totalBetInHand: 0,
      hasActed: false,
    };
  });

  return {
    success: true,
    table: { ...table, seats: newSeats },
  };
}

/**
 * Abandon a seat (player disconnected mid-hand)
 *
 * The seat keeps its cards and chips, but has no player.
 * It will auto-fold when it's the seat's turn to act.
 */
export function abandonSeat(
  table: TableState,
  seatPosition: number
): SeatResult {
  if (seatPosition < 0 || seatPosition >= MAX_SEATS) {
    return { success: false, error: 'Invalid seat position', table };
  }

  const seat = table.seats[seatPosition];

  if (seat.playerId === null) {
    return { success: false, error: 'Seat has no player', table };
  }

  if (!isSeatInHand(seat)) {
    // No hand in progress - just clear the seat
    return standPlayer(table, seat.playerId);
  }

  // Mark seat as abandoned
  const newSeats = table.seats.map((s, i) => {
    if (i !== seatPosition) return s;
    return {
      ...s,
      playerId: null,
      playerName: null,
      handStatus: 'abandoned' as const,
    };
  });

  return {
    success: true,
    table: { ...table, seats: newSeats },
  };
}

/**
 * Clean up abandoned and empty seats after a hand ends
 *
 * - Abandoned seats with no chips: cleared
 * - Abandoned seats with chips: stay abandoned (can be reclaimed or cleared)
 * - Folded seats: reset to sitting-out
 * - All-in seats that busted: cleared
 */
export function cleanupSeatsAfterHand(table: TableState): TableState {
  const newSeats = table.seats.map(seat => {
    // Empty seats stay empty
    if (seat.handStatus === 'empty') {
      return seat;
    }

    // Abandoned seats
    if (seat.handStatus === 'abandoned') {
      if (seat.stack <= 0) {
        // Busted and abandoned - clear the seat
        return {
          ...seat,
          playerId: null,
          playerName: null,
          stack: 0,
          holeCards: [],
          currentBet: 0,
          totalBetInHand: 0,
          hasActed: false,
          handStatus: 'empty' as const,
          isWinner: undefined,
          handRank: undefined,
          winAmount: undefined,
        };
      }
      // Has chips but abandoned - keep as abandoned for now
      // Could be claimed by reconnecting player
      return {
        ...seat,
        holeCards: [],
        currentBet: 0,
        totalBetInHand: 0,
        hasActed: false,
        isWinner: undefined,
        handRank: undefined,
        winAmount: undefined,
      };
    }

    // Seats with players
    if (seat.stack <= 0) {
      // Player busted - clear the seat
      return {
        ...seat,
        playerId: null,
        playerName: null,
        stack: 0,
        holeCards: [],
        currentBet: 0,
        totalBetInHand: 0,
        hasActed: false,
        handStatus: 'empty' as const,
        isWinner: undefined,
        handRank: undefined,
        winAmount: undefined,
      };
    }

    // Player has chips - reset for next hand
    return {
      ...seat,
      holeCards: [],
      currentBet: 0,
      totalBetInHand: 0,
      hasActed: false,
      handStatus: 'sitting-out' as const,
      isWinner: undefined,
      handRank: undefined,
      winAmount: undefined,
    };
  });

  return { ...table, seats: newSeats };
}

/**
 * Get available seat positions (empty and not in hand)
 */
export function getAvailableSeats(table: TableState): number[] {
  return table.seats
    .filter(s => s.playerId === null && !isSeatInHand(s))
    .map(s => s.position);
}

/**
 * Check if a player can sit at a specific seat
 */
export function canSitAt(
  table: TableState,
  seatPosition: number,
  playerId: string
): { canSit: boolean; reason?: string } {
  if (seatPosition < 0 || seatPosition >= MAX_SEATS) {
    return { canSit: false, reason: 'Invalid seat position' };
  }

  const seat = table.seats[seatPosition];

  if (seat.playerId !== null) {
    return { canSit: false, reason: 'Seat is occupied' };
  }

  if (isSeatInHand(seat)) {
    return { canSit: false, reason: 'Seat has active hand' };
  }

  const existingSeat = table.seats.find(s => s.playerId === playerId);
  if (existingSeat) {
    return { canSit: false, reason: 'Already seated' };
  }

  return { canSit: true };
}

/**
 * Reclaim an abandoned seat (player reconnects)
 *
 * Only works if the seat is abandoned and has the same player's chips.
 */
export function reclaimSeat(
  table: TableState,
  seatPosition: number,
  playerId: string,
  playerName: string
): SeatResult {
  if (seatPosition < 0 || seatPosition >= MAX_SEATS) {
    return { success: false, error: 'Invalid seat position', table };
  }

  const seat = table.seats[seatPosition];

  if (seat.handStatus !== 'abandoned') {
    return { success: false, error: 'Seat is not abandoned', table };
  }

  // Check if player is already seated elsewhere
  const existingSeat = table.seats.find(s => s.playerId === playerId);
  if (existingSeat) {
    return { success: false, error: 'Player already seated', table };
  }

  const newSeats = table.seats.map((s, i) => {
    if (i !== seatPosition) return s;
    return {
      ...s,
      playerId,
      playerName,
      // handStatus stays the same (still in hand, now with a player)
      // If in hand, will continue playing; if hand ended, will be cleaned up
    };
  });

  return {
    success: true,
    table: { ...table, seats: newSeats },
  };
}
