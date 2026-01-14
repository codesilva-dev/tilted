import { TableState, GameAction, Street, HandResult, isPlayerInHand, getNextOccupiedPosition } from "../types/game-state";
import { createDeck, shuffleDeck } from "../core/cards";
import {
  postBlinds,
  dealHoleCards,
  dealFlop,
  dealTurn,
  dealRiver,
  processAction,
  isBettingRoundComplete
} from "../state/game-manager";
import { validateAction } from "../rules/action-validator";
import { distributePots, shouldEndHandByFold, endHandByFold, shouldGoToShowdown } from "./pot-manager";

/**
 * Event types emitted by HandController
 */
export type HandEvent =
  | { type: 'hand-started'; table: TableState }
  | { type: 'blinds-posted'; table: TableState }
  | { type: 'cards-dealt'; table: TableState }
  | { type: 'action-processed'; table: TableState; action: GameAction }
  | { type: 'street-changed'; table: TableState; street: Street }
  | { type: 'hand-completed'; table: TableState; result: HandResult }
  | { type: 'players-removed'; table: TableState; removedPlayers: Array<{ id: string; name: string }> }
  | { type: 'error'; error: Error };

export type EventCallback = (event: HandEvent) => void;

/**
 * HandController orchestrates a complete poker hand from start to finish.
 * It coordinates all the game logic layers: dealing, betting, pot management, and showdown.
 */
export class HandController {
  private state: TableState;
  private eventCallbacks: EventCallback[] = [];

  constructor(initialState: TableState) {
    this.state = { ...initialState };
  }

  /**
   * Get the current state
   */
  getState(): TableState {
    return { ...this.state };
  }

  /**
   * Mark a player as leaving (they'll be removed at the end of the hand)
   */
  markPlayerAsLeaving(playerId: string): void {
    const player = this.state.players.find(p => p.id === playerId);
    if (player) {
      player.isLeaving = true;
    }
  }

  /**
   * Remove a player from the table
   */
  removePlayer(playerId: string): void {
    this.state.players = this.state.players.filter(p => p.id !== playerId);
  }

  /**
   * Remove all players marked as leaving
   * Returns the removed player info (id and name) for cleanup
   */
  removeLeavingPlayers(): Array<{ id: string; name: string }> {
    const leavingPlayers = this.state.players.filter(p => p.isLeaving);
    const leavingPlayerInfo = leavingPlayers.map(p => ({ id: p.id, name: p.name }));
    this.state.players = this.state.players.filter(p => !p.isLeaving);
    return leavingPlayerInfo;
  }

  /**
   * Reset the table to a waiting state (between hands)
   * Called when there aren't enough players to start a new hand
   */
  resetToWaiting(): void {
    this.state = {
      ...this.state,
      currentStreet: 'pre-flop',
      pot: 0,
      currentBet: 0,
      communityCards: [],
      activePlayerPosition: null,
      players: this.state.players.map(p => ({
        ...p,
        holeCards: [],
        currentBet: 0,
        totalBetInHand: 0,
        hasActed: false,
        status: 'waiting' as const,
        isWinner: false,
        isLeaving: false
      }))
    };
  }

  /**
   * Register an event listener
   */
  on(callback: EventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: HandEvent): void {
    for (const callback of this.eventCallbacks) {
      callback(event);
    }
  }

  /**
   * Start a new hand
   * 1. Remove leaving players
   * 2. Check minimum players
   * 3. Reset player bets and states
   * 4. Advance dealer button
   * 5. Shuffle and create new deck
   * 6. Post blinds
   * 7. Deal hole cards
   */
  async startHand(): Promise<TableState> {
    try {
      // 1. Remove players who were waiting to leave
      const leavingPlayers = this.removeLeavingPlayers();
      if (leavingPlayers.length > 0) {
        console.log(`[HandController] Removed ${leavingPlayers.length} leaving players before starting new hand`);
        this.emit({ type: 'players-removed', table: this.state, removedPlayers: leavingPlayers });
      }

      // 2. Check if we have enough players
      if (this.state.players.length < 2) {
        throw new Error('Need at least 2 players to start a hand');
      }

      // 3. Reset player states for new hand
      this.state = this.resetForNewHand(this.state);

      this.emit({ type: 'hand-started', table: this.state });

      // 4. Advance dealer button (find next occupied seat)
      this.state = this.advanceDealerButton(this.state);

      // 5. Shuffle and reset deck
      this.state = {
        ...this.state,
        deck: shuffleDeck(createDeck()),
        communityCards: [],
        currentStreet: 'pre-flop'
      };

      // 6. Post blinds
      this.state = postBlinds(this.state);
      this.emit({ type: 'blinds-posted', table: this.state });

      // 7. Deal hole cards
      this.state = dealHoleCards(this.state);

      // 8. Set first active player (after big blind)
      this.state = this.setFirstActivePlayer(this.state);

      this.emit({ type: 'cards-dealt', table: this.state });

      return this.getState();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // Don't emit error event for "not enough players" - it's expected when players leave
      // The server will handle this gracefully by resetting to waiting state
      if (!err.message.includes('at least 2 players')) {
        this.emit({ type: 'error', error: err });
      }
      throw err;
    }
  }

  /**
   * Process a player action
   * 1. Validate action
   * 2. Update state
   * 3. Check if betting round is complete
   * 4. If complete, advance to next street or showdown
   */
  async handleAction(action: GameAction): Promise<TableState> {
    try {
      // 1. Validate action
      const validation = validateAction(this.state, action.playerId, action);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid action');
      }

      // 2. Process action and update state
      this.state = processAction(this.state, action);
      this.emit({ type: 'action-processed', table: this.state, action });

      // 3. Check if hand ended by fold
      if (shouldEndHandByFold(this.state)) {
        const { table, result } = endHandByFold(this.state);
        this.state = table;
        this.emit({ type: 'hand-completed', table: this.state, result });
        return this.getState();
      }

      // 4. Check if betting round is complete
      if (isBettingRoundComplete(this.state)) {
        await this.advanceStreet();
      }

      return this.getState();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit({ type: 'error', error: err });
      throw err;
    }
  }

  /**
   * Advance to next street (flop/turn/river) or showdown
   * 1. Deal community cards for next street
   * 2. Reset betting round
   * 3. If river completed, go to showdown
   */
  private async advanceStreet(): Promise<void> {
    const currentStreet = this.state.currentStreet;

    // Check if we should go to showdown
    if (shouldGoToShowdown(this.state)) {
      await this.showdown();
      return;
    }

    // Deal cards for next street
    switch (currentStreet) {
      case 'pre-flop':
        this.state = dealFlop(this.state);
        break;
      case 'flop':
        this.state = dealTurn(this.state);
        break;
      case 'turn':
        this.state = dealRiver(this.state);
        break;
      case 'river':
        // After river, go to showdown
        await this.showdown();
        return;
      default:
        throw new Error(`Cannot advance from street: ${currentStreet}`);
    }

    // Set first active player for new street
    this.state = this.setFirstActivePlayer(this.state);

    this.emit({ type: 'street-changed', table: this.state, street: this.state.currentStreet });
  }

  /**
   * Handle showdown
   * 1. Evaluate all hands
   * 2. Calculate pots and winners
   * 3. Distribute winnings
   * 4. Remove any players marked as leaving
   */
  private async showdown(): Promise<void> {
    // Update street to showdown
    this.state = {
      ...this.state,
      currentStreet: 'showdown'
    };

    // Distribute pots and get result
    const { table, result } = distributePots(this.state);
    this.state = table;

    this.emit({ type: 'hand-completed', table: this.state, result });
  }

  /**
   * Reset all players for a new hand
   */
  private resetForNewHand(table: TableState): TableState {
    return {
      ...table,
      handNumber: table.handNumber + 1,
      handStartedAt: new Date(),
      pot: 0,
      currentBet: 0,
      lastRaiseAmount: table.bigBlind,
      communityCards: [],
      activePlayerPosition: null,
      players: table.players.map(p => ({
        ...p,
        holeCards: [],
        currentBet: 0,
        totalBetInHand: 0,
        hasActed: false,
        // Reset status: folded/sitting-out stay as is, others become waiting
        status: p.status === 'sitting-out' ? 'sitting-out' :
                p.status === 'folded' ? 'waiting' :
                'waiting'
      }))
    };
  }

  /**
   * Advance the dealer button to the next occupied seat
   */
  private advanceDealerButton(table: TableState): TableState {
    const activePlayers = table.players.filter(p =>
      p.status !== 'sitting-out' && p.stack > 0
    );

    if (activePlayers.length < 2) {
      throw new Error('Need at least 2 active players to start a hand');
    }

    // Find next occupied position after current dealer
    const nextDealer = getNextOccupiedPosition(table.dealerPosition, activePlayers);
    if (nextDealer === null) {
      throw new Error('Could not find next dealer position');
    }

    // Calculate blind positions
    let smallBlindPos: number;
    let bigBlindPos: number | null;

    // For heads-up, dealer is small blind
    if (activePlayers.length === 2) {
      smallBlindPos = nextDealer;
      bigBlindPos = getNextOccupiedPosition(nextDealer, activePlayers);
    } else {
      const sbPos = getNextOccupiedPosition(nextDealer, activePlayers);
      if (sbPos === null) {
        throw new Error('Could not find small blind position');
      }
      smallBlindPos = sbPos;
      bigBlindPos = getNextOccupiedPosition(smallBlindPos, activePlayers);
    }

    if (bigBlindPos === null) {
      throw new Error('Could not find big blind position');
    }

    return {
      ...table,
      dealerPosition: nextDealer,
      smallBlindPosition: smallBlindPos,
      bigBlindPosition: bigBlindPos,
      // Set all eligible players to active
      players: table.players.map(p => ({
        ...p,
        status: (p.status !== 'sitting-out' && p.stack > 0) ? 'active' : p.status
      }))
    };
  }

  /**
   * Set the first active player for a betting round
   */
  private setFirstActivePlayer(table: TableState): TableState {
    const activePlayers = table.players.filter(p => p.status === 'active');

    if (activePlayers.length === 0) {
      return { ...table, activePlayerPosition: null };
    }

    // Pre-flop: first to act is after big blind
    // Post-flop: first to act is after dealer (small blind position)
    const startPosition = table.currentStreet === 'pre-flop'
      ? (table.bigBlindPosition + 1) % 10
      : (table.dealerPosition + 1) % 10;

    // Find next active player from start position
    let position = startPosition;
    let attempts = 0;
    while (attempts < 10) {
      const player = table.players.find(p =>
        p.seatPosition === position && p.status === 'active'
      );
      if (player) {
        return { ...table, activePlayerPosition: position };
      }
      position = (position + 1) % 10;
      attempts++;
    }

    return { ...table, activePlayerPosition: null };
  }
}
