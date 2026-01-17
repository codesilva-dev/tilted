import { TableState, GameAction, Street, HandResult, isPlayerInHand, getNextOccupiedPosition, Player } from "../types/game-state";
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

// Helper to create consistent log prefix
function logPrefix(state: TableState): string {
  return `[HandController][Hand #${state.handNumber}][${state.id}]`;
}

// Helper to format player state for logging
function formatPlayerState(p: Player): string {
  return `${p.name}(${p.status}, bet:${p.currentBet}/${p.totalBetInHand}, stack:${p.stack})`;
}

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
    /**
     * Unmark a player as leaving (cancel their leave request)
     */
    unmarkPlayerAsLeaving(playerId: string): void {
      const player = this.state.players.find(p => p.id === playerId);
      if (player) {
        player.isLeaving = false;
      }
    }
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
   * Remove all busted players (stack = 0)
   * Returns the removed player info (id and name) for cleanup
   */
  removeBustedPlayers(): Array<{ id: string; name: string }> {
    const bustedPlayers = this.state.players.filter(p => p.stack === 0);
    const bustedPlayerInfo = bustedPlayers.map(p => ({ id: p.id, name: p.name }));
    this.state.players = this.state.players.filter(p => p.stack > 0);
    return bustedPlayerInfo;
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
        handRank: undefined,
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
    const nextHandNum = this.state.handNumber + 1;
    console.log(`[HandController][Hand #${nextHandNum}][${this.state.id}] ╔════════════════════════════════════════════════════════════╗`);
    console.log(`[HandController][Hand #${nextHandNum}][${this.state.id}] ║                    STARTING NEW HAND                       ║`);
    console.log(`[HandController][Hand #${nextHandNum}][${this.state.id}] ╚════════════════════════════════════════════════════════════╝`);

    try {
      // 1. Remove players who were waiting to leave
      const leavingPlayers = this.removeLeavingPlayers();
      if (leavingPlayers.length > 0) {
        console.log(`[HandController][Hand #${nextHandNum}][${this.state.id}] Removed ${leavingPlayers.length} leaving players: [${leavingPlayers.map(p => p.name).join(', ')}]`);
        this.emit({ type: 'players-removed', table: this.state, removedPlayers: leavingPlayers });
      }

      // 2. Check if we have enough players
      console.log(`[HandController][Hand #${nextHandNum}][${this.state.id}] Players at table: ${this.state.players.length}`);
      this.state.players.forEach((p, i) => {
        console.log(`[HandController][Hand #${nextHandNum}][${this.state.id}]   [${i}] ${formatPlayerState(p)}`);
      });

      if (this.state.players.length < 2) {
        console.log(`[HandController][Hand #${nextHandNum}][${this.state.id}] ERROR: Not enough players (${this.state.players.length})`);
        throw new Error('Need at least 2 players to start a hand');
      }

      // 3. Reset player states for new hand
      this.state = this.resetForNewHand(this.state);
      const prefix = logPrefix(this.state);

      console.log(`${prefix} Player states reset for new hand`);

      this.emit({ type: 'hand-started', table: this.state });

      // 4. Advance dealer button (find next occupied seat)
      this.state = this.advanceDealerButton(this.state);
      console.log(`${prefix} Positions: Dealer=${this.state.dealerPosition}, SB=${this.state.smallBlindPosition}, BB=${this.state.bigBlindPosition}`);

      // 5. Shuffle and reset deck
      this.state = {
        ...this.state,
        deck: shuffleDeck(createDeck()),
        communityCards: [],
        currentStreet: 'pre-flop'
      };
      console.log(`${prefix} Deck shuffled (${this.state.deck.length} cards)`);

      // 6. Post blinds
      this.state = postBlinds(this.state);
      console.log(`${prefix} Blinds posted: SB=${this.state.smallBlind}, BB=${this.state.bigBlind}, pot=${this.state.pot}`);
      this.emit({ type: 'blinds-posted', table: this.state });

      // 7. Deal hole cards
      this.state = dealHoleCards(this.state);
      console.log(`${prefix} Hole cards dealt:`);
      this.state.players.forEach(p => {
        const cards = p.holeCards.map(c => `${c.rank}${c.suit[0]}`).join(' ');
        console.log(`${prefix}   ${p.name}: [${cards}]`);
      });

      // 8. Set first active player (after big blind)
      this.state = this.setFirstActivePlayer(this.state);
      const activePlayer = this.state.players.find(p => p.seatPosition === this.state.activePlayerPosition);
      console.log(`${prefix} First to act: ${activePlayer?.name || 'none'} (position ${this.state.activePlayerPosition})`);

      this.emit({ type: 'cards-dealt', table: this.state });

      console.log(`${prefix} ════════════════════════════════════════════════════════════`);
      console.log(`${prefix} Hand #${this.state.handNumber} started successfully`);
      console.log(`${prefix} ════════════════════════════════════════════════════════════`);

      return this.getState();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[HandController][Hand #${nextHandNum}][${this.state.id}] ERROR starting hand: ${err.message}`);
      // Don't emit error event for "not enough players" - it's expected when players leave or bust
      // The server will handle this gracefully by resetting to waiting state
      const isPlayerCountError = err.message.includes('at least 2') && err.message.includes('players');
      if (!isPlayerCountError) {
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
    const prefix = logPrefix(this.state);
    const player = this.state.players.find(p => p.id === action.playerId);
    const playerName = player?.name || action.playerId;

    console.log(`${prefix} ──── ACTION: ${playerName} ${action.type}${action.amount ? ` ${action.amount}` : ''} ────`);
    console.log(`${prefix} Street: ${this.state.currentStreet}, Pot: ${this.state.pot}, CurrentBet: ${this.state.currentBet}`);

    if (player) {
      console.log(`${prefix} Player state before: ${formatPlayerState(player)}`);
    } else {
      console.error(`${prefix} ERROR: Player ${action.playerId} not found!`);
    }

    try {
      // 1. Validate action
      const validation = validateAction(this.state, action.playerId, action);
      if (!validation.valid) {
        console.log(`${prefix} Action REJECTED: ${validation.error}`);
        console.log(`${prefix}   Expected active position: ${this.state.activePlayerPosition}`);
        console.log(`${prefix}   Player position: ${player?.seatPosition}`);
        console.log(`${prefix}   Player status: ${player?.status}`);
        throw new Error(validation.error || 'Invalid action');
      }
      console.log(`${prefix} Action VALIDATED`);

      // 2. Process action and update state
      this.state = processAction(this.state, action);

      const playerAfter = this.state.players.find(p => p.id === action.playerId);
      if (playerAfter) {
        console.log(`${prefix} Player state after: ${formatPlayerState(playerAfter)}`);
      }
      console.log(`${prefix} State after: Pot=${this.state.pot}, CurrentBet=${this.state.currentBet}, ActivePos=${this.state.activePlayerPosition}`);

      this.emit({ type: 'action-processed', table: this.state, action });

      // 3. Check if hand ended by fold
      if (shouldEndHandByFold(this.state)) {
        console.log(`${prefix} Hand ending by fold (only 1 player remaining)`);
        const { table, result } = endHandByFold(this.state);
        this.state = table;
        this.emit({ type: 'hand-completed', table: this.state, result });
        return this.getState();
      }

      // 4. Check if betting round is complete
      const bettingComplete = isBettingRoundComplete(this.state);
      console.log(`${prefix} Betting round complete: ${bettingComplete}`);

      if (bettingComplete) {
        await this.advanceStreet();
      } else {
        const nextPlayer = this.state.players.find(p => p.seatPosition === this.state.activePlayerPosition);
        console.log(`${prefix} Next to act: ${nextPlayer?.name || 'none'} (position ${this.state.activePlayerPosition})`);
      }

      return this.getState();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`${prefix} ERROR processing action: ${err.message}`);
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
    const prefix = logPrefix(this.state);
    const currentStreet = this.state.currentStreet;

    console.log(`${prefix} ═══════════════════════════════════════════════════════════`);
    console.log(`${prefix} ADVANCING STREET from ${currentStreet}`);

    // Check if we should go to showdown
    if (shouldGoToShowdown(this.state)) {
      console.log(`${prefix} -> Going to showdown (river complete, multiple players)`);
      await this.showdown();
      return;
    }

    // Deal cards for next street
    switch (currentStreet) {
      case 'pre-flop':
        this.state = dealFlop(this.state);
        console.log(`${prefix} -> FLOP dealt: [${this.state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' ')}]`);
        break;
      case 'flop':
        this.state = dealTurn(this.state);
        console.log(`${prefix} -> TURN dealt: [${this.state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' ')}]`);
        break;
      case 'turn':
        this.state = dealRiver(this.state);
        console.log(`${prefix} -> RIVER dealt: [${this.state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' ')}]`);
        break;
      case 'river':
        // After river, go to showdown
        console.log(`${prefix} -> River complete, going to showdown`);
        await this.showdown();
        return;
      default:
        console.error(`${prefix} ERROR: Cannot advance from street: ${currentStreet}`);
        throw new Error(`Cannot advance from street: ${currentStreet}`);
    }

    // Log player states at start of new street
    console.log(`${prefix} Player states at ${this.state.currentStreet}:`);
    this.state.players.forEach(p => {
      console.log(`${prefix}   ${formatPlayerState(p)}`);
    });

    // Check if betting round is already complete (e.g., only one active player, rest all-in)
    // This must be checked BEFORE setting active player
    if (isBettingRoundComplete(this.state)) {
      console.log(`${prefix} Betting round already complete (all-in scenario) - auto-advancing`);
      this.emit({ type: 'street-changed', table: this.state, street: this.state.currentStreet });
      await this.advanceStreet();
      return;
    }

    // Set first active player for new street
    this.state = this.setFirstActivePlayer(this.state);
    const activePlayer = this.state.players.find(p => p.seatPosition === this.state.activePlayerPosition);
    console.log(`${prefix} First to act: ${activePlayer?.name || 'none'} (position ${this.state.activePlayerPosition})`);

    this.emit({ type: 'street-changed', table: this.state, street: this.state.currentStreet });

    // If no active players can act but hand should continue (all-in scenario),
    // automatically advance to the next street until we reach showdown
    if (this.state.activePlayerPosition === null) {
      const playersInHand = this.state.players.filter(p => isPlayerInHand(p));
      console.log(`${prefix} No active player - ${playersInHand.length} players still in hand`);
      if (playersInHand.length > 1) {
        // No one can act but multiple players remain - continue advancing
        console.log(`${prefix} All-in scenario - auto-advancing to next street`);
        await this.advanceStreet();
      }
    }
  }

  /**
   * Handle showdown
   * 1. Evaluate all hands
   * 2. Calculate pots and winners
   * 3. Distribute winnings
   * 4. Remove any players marked as leaving
   */
  private async showdown(): Promise<void> {
    const prefix = logPrefix(this.state);

    console.log(`${prefix} ╔════════════════════════════════════════════════════════════╗`);
    console.log(`${prefix} ║                       SHOWDOWN                             ║`);
    console.log(`${prefix} ╚════════════════════════════════════════════════════════════╝`);
    console.log(`${prefix} Community: [${this.state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' ')}]`);
    console.log(`${prefix} Pot: ${this.state.pot}`);
    console.log(`${prefix} Players going to showdown:`);
    this.state.players.forEach(p => {
      const inHand = isPlayerInHand(p);
      const cards = p.holeCards.map(c => `${c.rank}${c.suit[0]}`).join(' ');
      const marker = inHand ? '→' : ' ';
      console.log(`${prefix} ${marker} ${p.name}: [${cards}] (${p.status}, bet:${p.totalBetInHand}, stack:${p.stack})`);
    });

    // Update street to showdown
    this.state = {
      ...this.state,
      currentStreet: 'showdown'
    };

    // Distribute pots and get result
    const { table, result } = distributePots(this.state);
    this.state = table;

    console.log(`${prefix} ╔════════════════════════════════════════════════════════════╗`);
    console.log(`${prefix} ║                  HAND #${this.state.handNumber} COMPLETE                        ║`);
    console.log(`${prefix} ╚════════════════════════════════════════════════════════════╝`);

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
        // Reset winner/hand info from previous hand
        isWinner: undefined,
        handRank: undefined,
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
