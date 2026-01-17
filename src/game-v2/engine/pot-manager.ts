/**
 * Pot Manager - Side pot calculation and distribution
 *
 * Handles the complexity of all-in scenarios where players
 * can only win up to what they contributed from each opponent.
 */

import { TableState, Seat, isSeatInHand, getSeatsInHand } from '../types/game-state';
import { HandResult } from '../types/actions';
import { findBestHand, compareHands, HandRank } from '../core/cards';

// ============================================================================
// Side Pot Calculation
// ============================================================================

interface SidePot {
  amount: number;
  eligibleSeats: number[]; // Seat positions eligible to win this pot
}

/**
 * Calculate side pots based on seat contributions
 *
 * When players go all-in for different amounts, we need to split
 * the pot so each player can only win what they put in from each opponent.
 *
 * IMPORTANT: Folded players contribute to pot amounts but cannot win.
 */
export function calculateSidePots(table: TableState): SidePot[] {
  // All seats that contributed money (including folded)
  const contributingSeats = table.seats.filter(s => s.totalBetInHand > 0);

  if (contributingSeats.length === 0) {
    return [];
  }

  // Seats that can actually win (not folded)
  const seatsInHand = getSeatsInHand(table).filter(s => s.handStatus !== 'folded');

  // Get unique bet levels from ALL contributors, sorted ascending
  const betLevels = [...new Set(contributingSeats.map(s => s.totalBetInHand))]
    .sort((a, b) => a - b);

  const pots: SidePot[] = [];
  let previousLevel = 0;

  for (const level of betLevels) {
    const increment = level - previousLevel;

    // Count ALL contributors at this level (including folded) for pot amount
    const contributors = contributingSeats.filter(s => s.totalBetInHand >= level);
    const potAmount = increment * contributors.length;

    // Only non-folded seats are eligible to WIN
    const eligibleSeats = seatsInHand
      .filter(s => s.totalBetInHand >= level)
      .map(s => s.position);

    if (potAmount > 0 && eligibleSeats.length > 0) {
      pots.push({
        amount: potAmount,
        eligibleSeats,
      });
    }

    previousLevel = level;
  }

  return pots;
}

// ============================================================================
// Hand Evaluation for Showdown
// ============================================================================

interface EvaluatedSeat {
  seat: Seat;
  handRank: HandRank | null;
}

/**
 * Evaluate hands for all seats in the hand
 */
function evaluateSeatsInHand(table: TableState): EvaluatedSeat[] {
  const seatsInHand = getSeatsInHand(table);

  return seatsInHand.map(seat => {
    // Can't evaluate folded seats
    if (seat.handStatus === 'folded') {
      return { seat, handRank: null };
    }

    // Need hole cards and community cards
    if (seat.holeCards.length !== 2 || table.communityCards.length !== 5) {
      return { seat, handRank: null };
    }

    const allCards = [...seat.holeCards, ...table.communityCards];
    const handRank = findBestHand(allCards);

    return { seat, handRank };
  });
}

// ============================================================================
// Pot Distribution
// ============================================================================

/**
 * Distribute pots to winners
 *
 * Returns the updated table state and hand result.
 */
export function distributePots(table: TableState): { table: TableState; result: HandResult } {
  const seatsInHand = getSeatsInHand(table);
  let newTable = { ...table, seats: table.seats.map(s => ({ ...s })) };

  const result: HandResult = {
    winners: [],
    pots: [],
    totalDistributed: 0,
  };

  // If only one seat in hand, they win everything
  if (seatsInHand.length === 1) {
    const winner = seatsInHand[0];
    const winAmount = table.pot;

    newTable.seats[winner.position] = {
      ...newTable.seats[winner.position],
      stack: newTable.seats[winner.position].stack + winAmount,
      isWinner: true,
      winAmount,
    };

    result.winners.push({
      seatPosition: winner.position,
      playerId: winner.playerId,
      playerName: winner.playerName,
      amount: winAmount,
    });
    result.pots.push({
      amount: winAmount,
      eligibleSeats: [winner.position],
      winners: [winner.position],
    });
    result.totalDistributed = winAmount;

    newTable.pot = 0;
    return { table: newTable, result };
  }

  // Calculate side pots
  const sidePots = calculateSidePots(table);

  // Evaluate hands
  const evaluatedSeats = evaluateSeatsInHand(table);

  // Distribute each pot
  for (const pot of sidePots) {
    // Filter to eligible seats that have valid hands (not folded)
    const eligibleEvaluated = evaluatedSeats.filter(
      e => pot.eligibleSeats.includes(e.seat.position) &&
           e.handRank !== null &&
           e.seat.handStatus !== 'folded'
    );

    if (eligibleEvaluated.length === 0) {
      // No eligible winners (all folded) - shouldn't happen normally
      // Return pot to... first eligible seat? Or carry over?
      // For now, just log and continue
      console.warn('[PotManager] No eligible winners for pot:', pot);
      continue;
    }

    // Find the best hand(s)
    const bestHand = eligibleEvaluated.reduce((best, current) => {
      if (!best.handRank) return current;
      if (!current.handRank) return best;
      return compareHands(current.handRank, best.handRank) > 0 ? current : best;
    });

    // Find all seats with the same best hand (ties)
    const winners = eligibleEvaluated.filter(e =>
      e.handRank && bestHand.handRank &&
      compareHands(e.handRank, bestHand.handRank) === 0
    );

    // Split pot among winners
    const winAmount = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount % winners.length;

    const potWinnerPositions: number[] = [];

    winners.forEach((winner, index) => {
      // First winner gets any odd chips
      const amount = index === 0 ? winAmount + remainder : winAmount;

      newTable.seats[winner.seat.position] = {
        ...newTable.seats[winner.seat.position],
        stack: newTable.seats[winner.seat.position].stack + amount,
        isWinner: true,
        handRank: winner.handRank ?? undefined,
        winAmount: (newTable.seats[winner.seat.position].winAmount ?? 0) + amount,
      };

      potWinnerPositions.push(winner.seat.position);

      // Add to result if not already there
      const existingWinner = result.winners.find(w => w.seatPosition === winner.seat.position);
      if (existingWinner) {
        existingWinner.amount += amount;
      } else {
        result.winners.push({
          seatPosition: winner.seat.position,
          playerId: winner.seat.playerId,
          playerName: winner.seat.playerName,
          amount,
          handRank: winner.handRank?.description,
        });
      }

      result.totalDistributed += amount;
    });

    result.pots.push({
      amount: pot.amount,
      eligibleSeats: pot.eligibleSeats,
      winners: potWinnerPositions,
    });
  }

  newTable.pot = 0;
  return { table: newTable, result };
}

// ============================================================================
// Hand End Conditions
// ============================================================================

/**
 * Check if the hand should end due to folds (only 1 seat remaining)
 */
export function shouldEndByFold(table: TableState): boolean {
  const seatsInHand = getSeatsInHand(table);
  return seatsInHand.filter(s => s.handStatus !== 'folded').length <= 1;
}

/**
 * End the hand by fold (award pot to last remaining seat)
 */
export function endHandByFold(table: TableState): { table: TableState; result: HandResult } {
  const seatsInHand = getSeatsInHand(table);
  const notFolded = seatsInHand.filter(s => s.handStatus !== 'folded');

  let newTable = { ...table, seats: table.seats.map(s => ({ ...s })) };
  const result: HandResult = {
    winners: [],
    pots: [],
    totalDistributed: 0,
  };

  if (notFolded.length === 1) {
    const winner = notFolded[0];
    const winAmount = table.pot;

    newTable.seats[winner.position] = {
      ...newTable.seats[winner.position],
      stack: newTable.seats[winner.position].stack + winAmount,
      isWinner: true,
      winAmount,
    };

    result.winners.push({
      seatPosition: winner.position,
      playerId: winner.playerId,
      playerName: winner.playerName,
      amount: winAmount,
    });
    result.pots.push({
      amount: winAmount,
      eligibleSeats: [winner.position],
      winners: [winner.position],
    });
    result.totalDistributed = winAmount;

    newTable.pot = 0;
  } else if (notFolded.length === 0) {
    // Everyone folded? Return bets proportionally (shouldn't happen)
    console.warn('[PotManager] Everyone folded - returning bets');
    // For simplicity, just leave pot as is (it will be 0 next hand)
  }

  newTable.currentStreet = 'showdown';
  newTable.activePosition = null;

  return { table: newTable, result };
}

/**
 * Check if we should go to showdown (river complete, multiple players)
 */
export function shouldGoToShowdown(table: TableState): boolean {
  if (table.currentStreet !== 'river') {
    return false;
  }

  const seatsInHand = getSeatsInHand(table);
  const notFolded = seatsInHand.filter(s => s.handStatus !== 'folded');

  return notFolded.length >= 2;
}
