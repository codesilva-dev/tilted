/**
 * Betting - Post blinds and process bets
 *
 * All betting operations work on seats, not players.
 */

import {
  TableState,
  Seat,
  getNextOccupiedPosition,
  canSeatAct,
  getActiveSeats,
  getSeatsInHand,
  MAX_SEATS,
} from '../types/game-state';
import { GameAction, ActionValidation } from '../types/actions';

// ============================================================================
// Blind Posting
// ============================================================================

/**
 * Post blinds at the start of a hand
 *
 * Assumes dealer position has already been set.
 * Sets SB and BB positions and deducts blinds from stacks.
 */
export function postBlinds(table: TableState): TableState {
  const activePlayers = table.seats.filter(s => s.playerId !== null && s.stack > 0);

  if (activePlayers.length < 2) {
    throw new Error('Not enough players to post blinds');
  }

  let newTable = { ...table, seats: table.seats.map(s => ({ ...s })) };

  // Find SB and BB positions
  let sbPosition: number;
  let bbPosition: number;

  if (activePlayers.length === 2) {
    // Heads-up: dealer is SB
    sbPosition = table.dealerPosition;
    bbPosition = getNextOccupiedPosition(
      sbPosition,
      newTable,
      s => s.playerId !== null && s.stack > 0
    )!;
  } else {
    // 3+ players: SB is left of dealer
    sbPosition = getNextOccupiedPosition(
      table.dealerPosition,
      newTable,
      s => s.playerId !== null && s.stack > 0
    )!;
    bbPosition = getNextOccupiedPosition(
      sbPosition,
      newTable,
      s => s.playerId !== null && s.stack > 0
    )!;
  }

  newTable.smallBlindPosition = sbPosition;
  newTable.bigBlindPosition = bbPosition;

  // Post small blind
  const sbSeat = newTable.seats[sbPosition];
  const sbAmount = Math.min(sbSeat.stack, table.smallBlind);
  newTable.seats[sbPosition] = {
    ...sbSeat,
    stack: sbSeat.stack - sbAmount,
    currentBet: sbAmount,
    totalBetInHand: sbAmount,
    handStatus: sbSeat.stack - sbAmount === 0 ? 'all-in' : 'active',
  };

  // Post big blind
  const bbSeat = newTable.seats[bbPosition];
  const bbAmount = Math.min(bbSeat.stack, table.bigBlind);
  newTable.seats[bbPosition] = {
    ...bbSeat,
    stack: bbSeat.stack - bbAmount,
    currentBet: bbAmount,
    totalBetInHand: bbAmount,
    handStatus: bbSeat.stack - bbAmount === 0 ? 'all-in' : 'active',
  };

  // Update pot and current bet
  newTable.pot = sbAmount + bbAmount;
  newTable.currentBet = bbAmount;

  return newTable;
}

// ============================================================================
// Action Validation
// ============================================================================

/**
 * Validate a game action
 */
export function validateAction(
  table: TableState,
  action: GameAction
): ActionValidation {
  const { seatPosition, type, amount } = action;

  // Check if it's this seat's turn
  if (table.activePosition !== seatPosition) {
    return { valid: false, error: 'Not your turn' };
  }

  const seat = table.seats[seatPosition];

  // Check if seat can act
  if (!canSeatAct(seat)) {
    return { valid: false, error: `Seat cannot act (status: ${seat.handStatus})` };
  }

  // Check if player matches seat (unless abandoned)
  if (seat.playerId !== null && seat.playerId !== action.playerId) {
    return { valid: false, error: 'Player does not match seat' };
  }

  // Validate specific action types
  switch (type) {
    case 'fold':
      return { valid: true };

    case 'check':
      if (table.currentBet > seat.currentBet) {
        return { valid: false, error: 'Cannot check - must call or raise' };
      }
      return { valid: true };

    case 'call': {
      const callAmount = table.currentBet - seat.currentBet;
      if (callAmount <= 0) {
        return { valid: false, error: 'Nothing to call' };
      }
      const actualAmount = Math.min(callAmount, seat.stack);
      return { valid: true, actualAmount };
    }

    case 'bet': {
      if (table.currentBet > 0) {
        return { valid: false, error: 'Cannot bet - use raise' };
      }
      if (!amount || amount <= 0) {
        return { valid: false, error: 'Bet amount required' };
      }
      if (amount < table.bigBlind && amount < seat.stack) {
        return { valid: false, error: `Minimum bet is ${table.bigBlind}` };
      }
      const actualAmount = Math.min(amount, seat.stack);
      return { valid: true, actualAmount };
    }

    case 'raise': {
      if (table.currentBet === 0) {
        return { valid: false, error: 'Cannot raise - use bet' };
      }
      if (!amount || amount <= table.currentBet) {
        return { valid: false, error: 'Raise must be greater than current bet' };
      }
      const minRaise = table.currentBet + table.lastRaiseAmount;
      if (amount < minRaise && amount < seat.stack + seat.currentBet) {
        return { valid: false, error: `Minimum raise is ${minRaise}` };
      }
      const additionalNeeded = amount - seat.currentBet;
      const actualAmount = Math.min(additionalNeeded, seat.stack);
      return { valid: true, actualAmount };
    }

    case 'all-in': {
      if (seat.stack <= 0) {
        return { valid: false, error: 'No chips to go all-in' };
      }
      return { valid: true, actualAmount: seat.stack };
    }

    default:
      return { valid: false, error: `Unknown action: ${type}` };
  }
}

// ============================================================================
// Action Processing
// ============================================================================

/**
 * Process a validated game action
 *
 * Assumes action has been validated. Updates seat and table state.
 */
export function processAction(table: TableState, action: GameAction): TableState {
  const { seatPosition, type, amount } = action;
  const newTable = { ...table, seats: table.seats.map(s => ({ ...s })) };
  const seat = newTable.seats[seatPosition];

  switch (type) {
    case 'fold':
      seat.handStatus = 'folded';
      seat.hasActed = true;
      break;

    case 'check':
      seat.hasActed = true;
      break;

    case 'call': {
      const callAmount = Math.min(table.currentBet - seat.currentBet, seat.stack);
      seat.stack -= callAmount;
      seat.currentBet += callAmount;
      seat.totalBetInHand += callAmount;
      newTable.pot += callAmount;
      seat.hasActed = true;
      if (seat.stack === 0) {
        seat.handStatus = 'all-in';
      }
      break;
    }

    case 'bet': {
      const betAmount = Math.min(amount!, seat.stack);
      seat.stack -= betAmount;
      seat.currentBet = betAmount;
      seat.totalBetInHand += betAmount;
      newTable.pot += betAmount;
      newTable.currentBet = betAmount;
      newTable.lastRaiseAmount = betAmount;
      seat.hasActed = true;
      // Reset hasActed for other active seats
      resetOtherSeatsActed(newTable, seatPosition);
      if (seat.stack === 0) {
        seat.handStatus = 'all-in';
      }
      break;
    }

    case 'raise': {
      const totalBet = Math.min(amount!, seat.stack + seat.currentBet);
      const additionalAmount = totalBet - seat.currentBet;
      const raiseSize = totalBet - table.currentBet;
      seat.stack -= additionalAmount;
      seat.currentBet = totalBet;
      seat.totalBetInHand += additionalAmount;
      newTable.pot += additionalAmount;
      newTable.currentBet = totalBet;
      newTable.lastRaiseAmount = raiseSize;
      seat.hasActed = true;
      resetOtherSeatsActed(newTable, seatPosition);
      if (seat.stack === 0) {
        seat.handStatus = 'all-in';
      }
      break;
    }

    case 'all-in': {
      const allInAmount = seat.stack;
      const newTotal = seat.currentBet + allInAmount;
      seat.stack = 0;
      seat.currentBet = newTotal;
      seat.totalBetInHand += allInAmount;
      newTable.pot += allInAmount;
      seat.handStatus = 'all-in';
      seat.hasActed = true;
      // If this raises the bet, reset others' acted status
      if (newTotal > table.currentBet) {
        const raiseSize = newTotal - table.currentBet;
        newTable.currentBet = newTotal;
        newTable.lastRaiseAmount = raiseSize;
        resetOtherSeatsActed(newTable, seatPosition);
      }
      break;
    }
  }

  // Advance to next active seat
  newTable.activePosition = findNextActivePosition(newTable, seatPosition);

  return newTable;
}

/**
 * Reset hasActed for all other active seats (after a bet/raise)
 */
function resetOtherSeatsActed(table: TableState, exceptPosition: number): void {
  for (const seat of table.seats) {
    if (seat.position !== exceptPosition && seat.handStatus === 'active') {
      seat.hasActed = false;
    }
  }
}

/**
 * Find the next seat that should act
 */
function findNextActivePosition(table: TableState, fromPosition: number): number | null {
  for (let i = 1; i <= MAX_SEATS; i++) {
    const pos = (fromPosition + i) % MAX_SEATS;
    const seat = table.seats[pos];
    if (seat.handStatus === 'active' || seat.handStatus === 'abandoned') {
      return pos;
    }
  }
  return null;
}

// ============================================================================
// Betting Round Management
// ============================================================================

/**
 * Check if the current betting round is complete
 */
export function isBettingRoundComplete(table: TableState): boolean {
  const activeSeats = getActiveSeats(table);
  const seatsInHand = getSeatsInHand(table);

  // If 1 or fewer players in hand, betting is complete
  if (seatsInHand.length <= 1) {
    return true;
  }

  // If no active seats (all folded or all-in), betting is complete
  if (activeSeats.length === 0) {
    return true;
  }

  // If only one active seat and others are all-in
  if (activeSeats.length === 1) {
    const activeSeat = activeSeats[0];
    // If they've matched the bet, they don't need to act
    if (activeSeat.currentBet >= table.currentBet && activeSeat.hasActed) {
      return true;
    }
  }

  // All active seats must have acted
  if (activeSeats.some(s => !s.hasActed)) {
    return false;
  }

  // All active seats must have matched the current bet
  if (activeSeats.some(s => s.currentBet < table.currentBet)) {
    return false;
  }

  return true;
}

/**
 * Reset betting for a new street
 */
export function resetForNewStreet(table: TableState): TableState {
  const newSeats = table.seats.map(seat => ({
    ...seat,
    currentBet: 0,
    hasActed: false,
  }));

  // Find first active position after dealer
  let activePosition: number | null = null;
  for (let i = 1; i <= MAX_SEATS; i++) {
    const pos = (table.dealerPosition + i) % MAX_SEATS;
    const seat = newSeats[pos];
    if (seat.handStatus === 'active' || seat.handStatus === 'abandoned') {
      activePosition = pos;
      break;
    }
  }

  return {
    ...table,
    seats: newSeats,
    currentBet: 0,
    lastRaiseAmount: table.bigBlind,
    activePosition,
  };
}

/**
 * Auto-fold an abandoned seat
 */
export function autoFoldAbandonedSeat(table: TableState, seatPosition: number): TableState {
  const seat = table.seats[seatPosition];

  if (seat.handStatus !== 'abandoned') {
    return table;
  }

  const newSeats = table.seats.map((s, i) => {
    if (i !== seatPosition) return s;
    return {
      ...s,
      handStatus: 'folded' as const,
      hasActed: true,
    };
  });

  let newTable = { ...table, seats: newSeats };

  // Advance to next position
  newTable.activePosition = findNextActivePosition(newTable, seatPosition);

  return newTable;
}
