/**
 * Hand Controller - Orchestrates a complete poker hand
 *
 * This is the main entry point for running hands. It coordinates:
 * - Starting hands (blinds, dealing)
 * - Processing actions
 * - Advancing streets
 * - Handling showdown
 * - Cleaning up after hands
 */

import {
  TableState,
  Seat,
  Street,
  getSeatsInHand,
  getActiveSeats,
  getNextOccupiedPosition,
  MAX_SEATS,
} from '../types/game-state';
import { GameAction, HandResult } from '../types/actions';
import { formatCards } from '../core/cards';
import {
  postBlinds,
  validateAction,
  processAction,
  isBettingRoundComplete,
  resetForNewStreet,
  autoFoldAbandonedSeat,
} from '../state/betting';
import { initializeDeck, dealHoleCards, dealNextStreet } from '../state/dealing';
import { cleanupSeatsAfterHand } from '../state/seat-manager';
import { distributePots, shouldEndByFold, endHandByFold, shouldGoToShowdown } from './pot-manager';

// ============================================================================
// Event System
// ============================================================================

export type HandEvent =
  | { type: 'hand-started'; table: TableState }
  | { type: 'blinds-posted'; table: TableState }
  | { type: 'cards-dealt'; table: TableState }
  | { type: 'action-processed'; table: TableState; action: GameAction }
  | { type: 'street-changed'; table: TableState; street: Street }
  | { type: 'showdown'; table: TableState }
  | { type: 'hand-completed'; table: TableState; result: HandResult }
  | { type: 'error'; error: Error };

export type EventCallback = (event: HandEvent) => void;

// ============================================================================
// Hand Controller
// ============================================================================

export class HandController {
  private state: TableState;
  private eventCallbacks: EventCallback[] = [];

  constructor(initialState: TableState) {
    this.state = { ...initialState };
  }

  /**
   * Get current state
   */
  getState(): TableState {
    return { ...this.state };
  }

  /**
   * Register event listener
   */
  on(callback: EventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Emit event to listeners
   */
  private emit(event: HandEvent): void {
    for (const cb of this.eventCallbacks) {
      cb(event);
    }
  }

  /**
   * Log with hand context
   */
  private log(message: string): void {
    console.log(`[Hand #${this.state.handNumber}][${this.state.id}] ${message}`);
  }

  // ==========================================================================
  // Hand Lifecycle
  // ==========================================================================

  /**
   * Start a new hand
   */
  async startHand(): Promise<TableState> {
    const nextHandNum = this.state.handNumber + 1;
    this.log(`Starting hand #${nextHandNum}`);

    try {
      // 1. Cleanup from previous hand
      this.state = cleanupSeatsAfterHand(this.state);

      // 2. Check we have enough players
      const playersWithChips = this.state.seats.filter(
        s => s.playerId !== null && s.stack > 0
      );

      if (playersWithChips.length < 2) {
        throw new Error('Need at least 2 players to start a hand');
      }

      // 3. Increment hand number and reset state
      this.state = {
        ...this.state,
        handNumber: nextHandNum,
        handStartedAt: new Date(),
        currentStreet: 'pre-flop',
        pot: 0,
        currentBet: 0,
        lastRaiseAmount: this.state.bigBlind,
        communityCards: [],
      };

      // 4. Mark all players with chips as active
      this.state = {
        ...this.state,
        seats: this.state.seats.map(seat => ({
          ...seat,
          handStatus: seat.playerId !== null && seat.stack > 0
            ? 'active' as const
            : 'empty' as const,
          holeCards: [],
          currentBet: 0,
          totalBetInHand: 0,
          hasActed: false,
          isWinner: undefined,
          handRank: undefined,
          winAmount: undefined,
        })),
      };

      // 5. Advance dealer button
      this.state = this.advanceDealer(this.state);
      this.log(`Dealer: ${this.state.dealerPosition}, SB: ${this.state.smallBlindPosition}, BB: ${this.state.bigBlindPosition}`);

      this.emit({ type: 'hand-started', table: this.state });

      // 6. Initialize deck
      this.state = initializeDeck(this.state);

      // 7. Post blinds
      this.state = postBlinds(this.state);
      this.log(`Blinds posted: pot=${this.state.pot}`);
      this.emit({ type: 'blinds-posted', table: this.state });

      // 8. Deal hole cards
      this.state = dealHoleCards(this.state);
      this.logHoleCards();
      this.emit({ type: 'cards-dealt', table: this.state });

      // 9. Set first player to act (after BB)
      this.state = this.setFirstToAct(this.state);
      this.log(`First to act: seat ${this.state.activePosition}`);

      return this.getState();

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.log(`Error starting hand: ${err.message}`);
      this.emit({ type: 'error', error: err });
      throw err;
    }
  }

  /**
   * Handle a player action
   */
  async handleAction(action: GameAction): Promise<TableState> {
    const seat = this.state.seats[action.seatPosition];
    this.log(`Action: ${seat?.playerName ?? 'Unknown'} ${action.type}${action.amount ? ` ${action.amount}` : ''}`);

    try {
      // 1. Validate action
      const validation = validateAction(this.state, action);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // 2. Process action
      this.state = processAction(this.state, action);
      this.emit({ type: 'action-processed', table: this.state, action });

      // 3. Check if hand ends by fold
      if (shouldEndByFold(this.state)) {
        this.log('Hand ending by fold');
        return this.completeHandByFold();
      }

      // 4. Check for abandoned seats that need to act
      await this.processAbandonedSeats();

      // 5. Check if betting round is complete
      if (isBettingRoundComplete(this.state)) {
        await this.advanceStreet();
      }

      return this.getState();

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.log(`Error handling action: ${err.message}`);
      this.emit({ type: 'error', error: err });
      throw err;
    }
  }

  /**
   * Abandon a seat (player disconnected)
   */
  abandonSeat(seatPosition: number): TableState {
    const seat = this.state.seats[seatPosition];
    if (!seat || seat.playerId === null) {
      return this.state;
    }

    this.log(`Abandoning seat ${seatPosition} (${seat.playerName})`);

    // Mark seat as abandoned
    this.state = {
      ...this.state,
      seats: this.state.seats.map((s, i) => {
        if (i !== seatPosition) return s;
        return {
          ...s,
          playerId: null,
          playerName: null,
          handStatus: s.holeCards.length > 0 ? 'abandoned' as const : 'empty' as const,
        };
      }),
    };

    return this.state;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Advance the dealer button
   */
  private advanceDealer(table: TableState): TableState {
    const activePlayers = table.seats.filter(
      s => s.playerId !== null && s.stack > 0
    );

    // Find next dealer
    const newDealer = getNextOccupiedPosition(
      table.dealerPosition,
      table,
      s => s.playerId !== null && s.stack > 0
    );

    if (newDealer === null) {
      throw new Error('Cannot find dealer position');
    }

    // Calculate blinds
    let sbPos: number;
    let bbPos: number;

    if (activePlayers.length === 2) {
      // Heads-up: dealer is SB
      sbPos = newDealer;
      bbPos = getNextOccupiedPosition(newDealer, table, s => s.playerId !== null && s.stack > 0)!;
    } else {
      sbPos = getNextOccupiedPosition(newDealer, table, s => s.playerId !== null && s.stack > 0)!;
      bbPos = getNextOccupiedPosition(sbPos, table, s => s.playerId !== null && s.stack > 0)!;
    }

    return {
      ...table,
      dealerPosition: newDealer,
      smallBlindPosition: sbPos,
      bigBlindPosition: bbPos,
    };
  }

  /**
   * Set first player to act (pre-flop: after BB; post-flop: after dealer)
   */
  private setFirstToAct(table: TableState): TableState {
    const startPos = table.currentStreet === 'pre-flop'
      ? table.bigBlindPosition
      : table.dealerPosition;

    // Find next active seat
    for (let i = 1; i <= MAX_SEATS; i++) {
      const pos = (startPos + i) % MAX_SEATS;
      const seat = table.seats[pos];
      if (seat.handStatus === 'active' || seat.handStatus === 'abandoned') {
        return { ...table, activePosition: pos };
      }
    }

    return { ...table, activePosition: null };
  }

  /**
   * Process any abandoned seats that need to act
   */
  private async processAbandonedSeats(): Promise<void> {
    let iterations = 0;
    const maxIterations = MAX_SEATS;

    while (iterations < maxIterations) {
      iterations++;

      if (this.state.activePosition === null) break;

      const activeSeat = this.state.seats[this.state.activePosition];
      if (activeSeat.handStatus !== 'abandoned') break;

      this.log(`Auto-folding abandoned seat ${this.state.activePosition}`);
      this.state = autoFoldAbandonedSeat(this.state, this.state.activePosition);

      // Check if hand ends
      if (shouldEndByFold(this.state)) {
        return;
      }

      // Check if betting round complete
      if (isBettingRoundComplete(this.state)) {
        return;
      }
    }
  }

  /**
   * Advance to next street
   */
  private async advanceStreet(): Promise<void> {
    this.log(`Advancing from ${this.state.currentStreet}`);

    // Check for showdown
    if (shouldGoToShowdown(this.state)) {
      await this.runShowdown();
      return;
    }

    // Check if we need to run out the board (all active players all-in)
    const activeSeats = getActiveSeats(this.state);
    const seatsInHand = getSeatsInHand(this.state).filter(s => s.handStatus !== 'folded');

    if (activeSeats.length === 0 && seatsInHand.length > 1) {
      // All remaining players are all-in - run out the board
      await this.runOutBoard();
      return;
    }

    // Deal next street
    if (this.state.currentStreet === 'river') {
      await this.runShowdown();
      return;
    }

    this.state = dealNextStreet(this.state);
    this.state = resetForNewStreet(this.state);
    this.log(`${this.state.currentStreet}: ${formatCards(this.state.communityCards)}`);

    this.emit({ type: 'street-changed', table: this.state, street: this.state.currentStreet });

    // Process any abandoned seats
    await this.processAbandonedSeats();

    // Check if betting is already complete (e.g., only one active player)
    if (isBettingRoundComplete(this.state)) {
      await this.advanceStreet();
    }
  }

  /**
   * Run out remaining community cards (all players all-in)
   */
  private async runOutBoard(): Promise<void> {
    this.log('Running out the board (all-in)');

    while (this.state.currentStreet !== 'river') {
      this.state = dealNextStreet(this.state);
      this.log(`${this.state.currentStreet}: ${formatCards(this.state.communityCards)}`);
      this.emit({ type: 'street-changed', table: this.state, street: this.state.currentStreet });
    }

    await this.runShowdown();
  }

  /**
   * Run showdown and distribute pots
   */
  private async runShowdown(): Promise<void> {
    this.log('SHOWDOWN');
    this.state = { ...this.state, currentStreet: 'showdown', activePosition: null };
    this.emit({ type: 'showdown', table: this.state });

    const { table, result } = distributePots(this.state);
    this.state = table;

    this.logResult(result);
    this.emit({ type: 'hand-completed', table: this.state, result });
  }

  /**
   * Complete hand when all but one player folds
   */
  private completeHandByFold(): TableState {
    const { table, result } = endHandByFold(this.state);
    this.state = table;

    this.logResult(result);
    this.emit({ type: 'hand-completed', table: this.state, result });

    return this.state;
  }

  /**
   * Log hole cards (for debugging)
   */
  private logHoleCards(): void {
    for (const seat of this.state.seats) {
      if (seat.holeCards.length > 0) {
        this.log(`  Seat ${seat.position} (${seat.playerName}): ${formatCards(seat.holeCards)}`);
      }
    }
  }

  /**
   * Log hand result
   */
  private logResult(result: HandResult): void {
    this.log('--- RESULT ---');
    for (const winner of result.winners) {
      this.log(`  ${winner.playerName ?? `Seat ${winner.seatPosition}`} wins ${winner.amount}${winner.handRank ? ` with ${winner.handRank}` : ''}`);
    }
    this.log(`  Total distributed: ${result.totalDistributed}`);
  }
}
