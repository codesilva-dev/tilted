/**
 * Table - A poker table state machine
 *
 * The Table owns all game state and manages its own transitions.
 * External code just sends inputs (sit, action) and receives outputs (events, state).
 *
 * Key principle: The table protects its own invariants.
 * - Invalid actions are rejected
 * - State transitions happen automatically when conditions are met
 * - Abandoned seats are auto-folded when it's their turn
 */

import {
  TableState,
  Seat,
  Street,
  createEmptySeat,
  isSeatInHand,
  canSeatAct,
  getSeatsInHand,
  getActiveSeats,
  getNextOccupiedPosition,
  MAX_SEATS,
} from './types/game-state';
import { GameAction, ActionType, HandResult } from './types/actions';
import { Card, createDeck, shuffleDeck, dealCards, formatCards, HandRank } from './core/cards';
import { calculateSidePots, distributePots, shouldEndByFold, endHandByFold } from './engine/pot-manager';

// ============================================================================
// Types
// ============================================================================

export interface TableConfig {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
}

export type TableEvent =
  | { type: 'player-sat'; seatPosition: number; playerId: string; playerName: string }
  | { type: 'player-left'; seatPosition: number; playerId: string }
  | { type: 'seat-abandoned'; seatPosition: number }
  | { type: 'hand-started'; handNumber: number }
  | { type: 'blinds-posted'; smallBlind: number; bigBlind: number }
  | { type: 'cards-dealt' }
  | { type: 'action'; seatPosition: number; action: ActionType; amount?: number }
  | { type: 'street-changed'; street: Street }
  | { type: 'showdown' }
  | { type: 'hand-complete'; result: HandResult }
  | { type: 'seat-auto-folded'; seatPosition: number; reason: 'abandoned' | 'timeout' };

export interface ActionResult {
  success: boolean;
  error?: string;
  events: TableEvent[];
}

type EventListener = (event: TableEvent) => void;

// ============================================================================
// Table Class
// ============================================================================

export class Table {
  private state: TableState;
  private listeners: EventListener[] = [];

  constructor(config: TableConfig) {
    // Initialize empty table
    const seats: Seat[] = [];
    for (let i = 0; i < MAX_SEATS; i++) {
      seats.push(createEmptySeat(i));
    }

    this.state = {
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
      dealerPosition: -1,
      smallBlindPosition: -1,
      bigBlindPosition: -1,
      activePosition: null,
      handStartedAt: null,
    };
  }

  // ==========================================================================
  // Public Queries
  // ==========================================================================

  getState(): TableState {
    return { ...this.state, seats: this.state.seats.map(s => ({ ...s })) };
  }

  getStreet(): Street {
    return this.state.currentStreet;
  }

  getActivePosition(): number | null {
    return this.state.activePosition;
  }

  isHandInProgress(): boolean {
    return this.state.currentStreet !== 'waiting' && this.state.currentStreet !== 'showdown';
  }

  canStartHand(): boolean {
    if (this.isHandInProgress()) return false;
    const playersWithChips = this.state.seats.filter(s => s.playerId !== null && s.stack > 0);
    return playersWithChips.length >= 2;
  }

  getAvailableSeats(): number[] {
    return this.state.seats
      .filter(s => s.playerId === null && !isSeatInHand(s))
      .map(s => s.position);
  }

  getSeat(position: number): Seat | null {
    if (position < 0 || position >= MAX_SEATS) return null;
    return { ...this.state.seats[position] };
  }

  getSeatByPlayerId(playerId: string): Seat | null {
    const seat = this.state.seats.find(s => s.playerId === playerId);
    return seat ? { ...seat } : null;
  }

  // ==========================================================================
  // Event System
  // ==========================================================================

  on(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(event: TableEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private log(message: string): void {
    console.log(`[Table][${this.state.id}][Hand #${this.state.handNumber}] ${message}`);
  }

  // ==========================================================================
  // Player Management
  // ==========================================================================

  sitPlayer(position: number, playerId: string, playerName: string, buyIn: number): ActionResult {
    const events: TableEvent[] = [];

    // Validate
    if (position < 0 || position >= MAX_SEATS) {
      return { success: false, error: 'Invalid seat position', events };
    }

    const seat = this.state.seats[position];

    if (seat.playerId !== null) {
      return { success: false, error: 'Seat is occupied', events };
    }

    if (isSeatInHand(seat)) {
      return { success: false, error: 'Seat has active hand', events };
    }

    if (this.state.seats.some(s => s.playerId === playerId)) {
      return { success: false, error: 'Already seated at this table', events };
    }

    if (buyIn < this.state.minBuyIn) {
      return { success: false, error: `Minimum buy-in is ${this.state.minBuyIn}`, events };
    }

    if (buyIn > this.state.maxBuyIn) {
      return { success: false, error: `Maximum buy-in is ${this.state.maxBuyIn}`, events };
    }

    // Sit player
    this.state.seats[position] = {
      ...seat,
      playerId,
      playerName,
      stack: buyIn,
      handStatus: 'sitting-out',
    };

    this.log(`${playerName} sat at seat ${position} with ${buyIn}`);
    events.push({ type: 'player-sat', seatPosition: position, playerId, playerName });
    this.emitAll(events);

    return { success: true, events };
  }

  standPlayer(playerId: string): ActionResult {
    const events: TableEvent[] = [];

    const seat = this.state.seats.find(s => s.playerId === playerId);
    if (!seat) {
      return { success: false, error: 'Player not seated', events };
    }

    const position = seat.position;

    if (isSeatInHand(seat)) {
      // Hand in progress - abandon the seat
      this.state.seats[position] = {
        ...seat,
        playerId: null,
        playerName: null,
        handStatus: 'abandoned',
      };
      this.log(`Seat ${position} abandoned (was ${seat.playerName})`);
      events.push({ type: 'seat-abandoned', seatPosition: position });

      // If it's this seat's turn, process it
      if (this.state.activePosition === position) {
        const foldEvents = this.processAbandonedSeat(position);
        events.push(...foldEvents);

        // Check if hand ends after the fold
        if (shouldEndByFold(this.state)) {
          const endEvents = this.endHandByFold();
          events.push(...endEvents);
        }
      }
    } else {
      // No hand - clear the seat
      this.state.seats[position] = createEmptySeat(position);
      this.log(`${seat.playerName} left seat ${position}`);
      events.push({ type: 'player-left', seatPosition: position, playerId });
    }

    this.emitAll(events);
    return { success: true, events };
  }

  abandonSeat(position: number): ActionResult {
    const events: TableEvent[] = [];

    const seat = this.state.seats[position];
    if (!seat || seat.playerId === null) {
      return { success: false, error: 'No player at seat', events };
    }

    return this.standPlayer(seat.playerId);
  }

  // ==========================================================================
  // Game Flow
  // ==========================================================================

  startHand(): ActionResult {
    const events: TableEvent[] = [];

    if (!this.canStartHand()) {
      const reason = this.isHandInProgress()
        ? 'Hand already in progress'
        : 'Not enough players';
      return { success: false, error: reason, events };
    }

    // Cleanup from previous hand
    this.cleanupAfterHand();

    // Increment hand number
    this.state.handNumber++;
    this.state.handStartedAt = new Date();
    this.state.currentStreet = 'pre-flop';
    this.state.pot = 0;
    this.state.currentBet = 0;
    this.state.communityCards = [];
    this.state.lastRaiseAmount = this.state.bigBlind;

    this.log(`Starting hand #${this.state.handNumber}`);
    events.push({ type: 'hand-started', handNumber: this.state.handNumber });

    // Mark players as active
    for (const seat of this.state.seats) {
      if (seat.playerId !== null && seat.stack > 0) {
        seat.handStatus = 'active';
        seat.holeCards = [];
        seat.currentBet = 0;
        seat.totalBetInHand = 0;
        seat.hasActed = false;
        seat.isWinner = undefined;
        seat.handRank = undefined;
        seat.winAmount = undefined;
      }
    }

    // Advance dealer button
    this.advanceDealer();

    // Shuffle deck
    this.state.deck = shuffleDeck(createDeck());

    // Post blinds
    this.postBlinds();
    events.push({
      type: 'blinds-posted',
      smallBlind: this.state.smallBlind,
      bigBlind: this.state.bigBlind,
    });

    // Deal hole cards
    this.dealHoleCards();
    events.push({ type: 'cards-dealt' });

    // Set first to act (after big blind)
    this.setFirstToAct();

    this.log(`First to act: seat ${this.state.activePosition}`);

    // Check if we need to auto-fold abandoned seats
    const autoFoldEvents = this.processAbandonedSeatsIfNeeded();
    events.push(...autoFoldEvents);

    this.emitAll(events);
    return { success: true, events };
  }

  processAction(action: GameAction): ActionResult {
    const events: TableEvent[] = [];

    // Validate it's the right player's turn
    if (this.state.activePosition !== action.seatPosition) {
      return { success: false, error: 'Not your turn', events };
    }

    const seat = this.state.seats[action.seatPosition];

    if (!canSeatAct(seat)) {
      return { success: false, error: `Cannot act (status: ${seat.handStatus})`, events };
    }

    if (seat.playerId !== null && seat.playerId !== action.playerId) {
      return { success: false, error: 'Player does not match seat', events };
    }

    // Validate the specific action
    const validation = this.validateAction(action);
    if (!validation.valid) {
      return { success: false, error: validation.error, events };
    }

    // Process the action
    this.applyAction(action, validation.actualAmount);
    this.log(`Seat ${action.seatPosition} (${seat.playerName}): ${action.type}${action.amount ? ` ${action.amount}` : ''}`);
    events.push({
      type: 'action',
      seatPosition: action.seatPosition,
      action: action.type,
      amount: validation.actualAmount,
    });

    // Check if hand ends by fold
    if (shouldEndByFold(this.state)) {
      const endEvents = this.endHandByFold();
      events.push(...endEvents);
      this.emitAll(events);
      return { success: true, events };
    }

    // Advance to next player
    this.advanceActivePosition();

    // Process any abandoned seats
    const autoFoldEvents = this.processAbandonedSeatsIfNeeded();
    events.push(...autoFoldEvents);

    // Check if betting round is complete
    if (this.isBettingRoundComplete()) {
      const advanceEvents = this.advanceStreet();
      events.push(...advanceEvents);
    }

    this.emitAll(events);
    return { success: true, events };
  }

  // ==========================================================================
  // Private: Validation
  // ==========================================================================

  private validateAction(action: GameAction): { valid: boolean; error?: string; actualAmount?: number } {
    const seat = this.state.seats[action.seatPosition];
    const { type, amount } = action;

    switch (type) {
      case 'fold':
        return { valid: true };

      case 'check':
        if (this.state.currentBet > seat.currentBet) {
          return { valid: false, error: 'Cannot check - must call or raise' };
        }
        return { valid: true };

      case 'call': {
        const callAmount = this.state.currentBet - seat.currentBet;
        if (callAmount <= 0) {
          return { valid: false, error: 'Nothing to call' };
        }
        return { valid: true, actualAmount: Math.min(callAmount, seat.stack) };
      }

      case 'bet': {
        if (this.state.currentBet > 0) {
          return { valid: false, error: 'Cannot bet - use raise' };
        }
        if (!amount || amount <= 0) {
          return { valid: false, error: 'Bet amount required' };
        }
        if (amount < this.state.bigBlind && amount < seat.stack) {
          return { valid: false, error: `Minimum bet is ${this.state.bigBlind}` };
        }
        return { valid: true, actualAmount: Math.min(amount, seat.stack) };
      }

      case 'raise': {
        if (this.state.currentBet === 0) {
          return { valid: false, error: 'Cannot raise - use bet' };
        }
        if (!amount || amount <= this.state.currentBet) {
          return { valid: false, error: 'Raise must be greater than current bet' };
        }
        const minRaise = this.state.currentBet + this.state.lastRaiseAmount;
        if (amount < minRaise && amount < seat.stack + seat.currentBet) {
          return { valid: false, error: `Minimum raise is ${minRaise}` };
        }
        const additionalNeeded = amount - seat.currentBet;
        return { valid: true, actualAmount: Math.min(additionalNeeded, seat.stack) };
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

  // ==========================================================================
  // Private: Action Processing
  // ==========================================================================

  private applyAction(action: GameAction, actualAmount?: number): void {
    const seat = this.state.seats[action.seatPosition];

    switch (action.type) {
      case 'fold':
        seat.handStatus = 'folded';
        seat.hasActed = true;
        break;

      case 'check':
        seat.hasActed = true;
        break;

      case 'call': {
        const amount = actualAmount!;
        seat.stack -= amount;
        seat.currentBet += amount;
        seat.totalBetInHand += amount;
        this.state.pot += amount;
        seat.hasActed = true;
        if (seat.stack === 0) seat.handStatus = 'all-in';
        break;
      }

      case 'bet': {
        const amount = actualAmount!;
        seat.stack -= amount;
        seat.currentBet = amount;
        seat.totalBetInHand += amount;
        this.state.pot += amount;
        this.state.currentBet = amount;
        this.state.lastRaiseAmount = amount;
        seat.hasActed = true;
        this.resetOthersActed(action.seatPosition);
        if (seat.stack === 0) seat.handStatus = 'all-in';
        break;
      }

      case 'raise': {
        const amount = actualAmount!;
        const newTotal = seat.currentBet + amount;
        const raiseSize = newTotal - this.state.currentBet;
        seat.stack -= amount;
        seat.currentBet = newTotal;
        seat.totalBetInHand += amount;
        this.state.pot += amount;
        this.state.currentBet = newTotal;
        this.state.lastRaiseAmount = raiseSize;
        seat.hasActed = true;
        this.resetOthersActed(action.seatPosition);
        if (seat.stack === 0) seat.handStatus = 'all-in';
        break;
      }

      case 'all-in': {
        const amount = actualAmount!;
        const newTotal = seat.currentBet + amount;
        seat.stack = 0;
        seat.currentBet = newTotal;
        seat.totalBetInHand += amount;
        this.state.pot += amount;
        seat.handStatus = 'all-in';
        seat.hasActed = true;
        if (newTotal > this.state.currentBet) {
          const raiseSize = newTotal - this.state.currentBet;
          this.state.currentBet = newTotal;
          this.state.lastRaiseAmount = raiseSize;
          this.resetOthersActed(action.seatPosition);
        }
        break;
      }
    }
  }

  private resetOthersActed(exceptPosition: number): void {
    for (const seat of this.state.seats) {
      if (seat.position !== exceptPosition && seat.handStatus === 'active') {
        seat.hasActed = false;
      }
    }
  }

  // ==========================================================================
  // Private: Position Management
  // ==========================================================================

  private advanceDealer(): void {
    const activePlayers = this.state.seats.filter(s => s.playerId !== null && s.stack > 0);

    const newDealer = getNextOccupiedPosition(
      this.state.dealerPosition,
      this.state,
      s => s.playerId !== null && s.stack > 0
    );

    if (newDealer === null) {
      throw new Error('Cannot find dealer position');
    }

    this.state.dealerPosition = newDealer;

    // Calculate blinds
    if (activePlayers.length === 2) {
      // Heads-up: dealer is SB
      this.state.smallBlindPosition = newDealer;
      this.state.bigBlindPosition = getNextOccupiedPosition(
        newDealer, this.state, s => s.playerId !== null && s.stack > 0
      )!;
    } else {
      this.state.smallBlindPosition = getNextOccupiedPosition(
        newDealer, this.state, s => s.playerId !== null && s.stack > 0
      )!;
      this.state.bigBlindPosition = getNextOccupiedPosition(
        this.state.smallBlindPosition, this.state, s => s.playerId !== null && s.stack > 0
      )!;
    }
  }

  private setFirstToAct(): void {
    const startPos = this.state.currentStreet === 'pre-flop'
      ? this.state.bigBlindPosition
      : this.state.dealerPosition;

    this.state.activePosition = this.findNextActivePosition(startPos);
  }

  private advanceActivePosition(): void {
    if (this.state.activePosition === null) return;
    this.state.activePosition = this.findNextActivePosition(this.state.activePosition);
  }

  private findNextActivePosition(fromPosition: number): number | null {
    for (let i = 1; i <= MAX_SEATS; i++) {
      const pos = (fromPosition + i) % MAX_SEATS;
      const seat = this.state.seats[pos];
      if (seat.handStatus === 'active' || seat.handStatus === 'abandoned') {
        return pos;
      }
    }
    return null;
  }

  // ==========================================================================
  // Private: Blinds & Dealing
  // ==========================================================================

  private postBlinds(): void {
    const sbSeat = this.state.seats[this.state.smallBlindPosition];
    const sbAmount = Math.min(sbSeat.stack, this.state.smallBlind);
    sbSeat.stack -= sbAmount;
    sbSeat.currentBet = sbAmount;
    sbSeat.totalBetInHand = sbAmount;
    if (sbSeat.stack === 0) sbSeat.handStatus = 'all-in';

    const bbSeat = this.state.seats[this.state.bigBlindPosition];
    const bbAmount = Math.min(bbSeat.stack, this.state.bigBlind);
    bbSeat.stack -= bbAmount;
    bbSeat.currentBet = bbAmount;
    bbSeat.totalBetInHand = bbAmount;
    if (bbSeat.stack === 0) bbSeat.handStatus = 'all-in';

    this.state.pot = sbAmount + bbAmount;
    this.state.currentBet = bbAmount;
  }

  private dealHoleCards(): void {
    let deck = [...this.state.deck];

    // Deal starting from small blind position
    let pos = this.state.smallBlindPosition;
    for (let i = 0; i < MAX_SEATS; i++) {
      const seat = this.state.seats[pos];
      if (seat.handStatus === 'active' || seat.handStatus === 'all-in') {
        const { dealt, remaining } = dealCards(deck, 2);
        seat.holeCards = dealt;
        deck = remaining;
      }
      pos = (pos + 1) % MAX_SEATS;
    }

    this.state.deck = deck;
  }

  private dealCommunityCards(count: number): void {
    // Burn one card, then deal
    const { dealt, remaining } = dealCards(this.state.deck, count + 1);
    const newCards = dealt.slice(1); // Skip burn
    this.state.communityCards = [...this.state.communityCards, ...newCards];
    this.state.deck = remaining;
  }

  // ==========================================================================
  // Private: Betting Round Logic
  // ==========================================================================

  private isBettingRoundComplete(): boolean {
    const activeSeats = getActiveSeats(this.state);
    const seatsInHand = getSeatsInHand(this.state);

    if (seatsInHand.length <= 1) return true;
    if (activeSeats.length === 0) return true;

    if (activeSeats.length === 1) {
      const activeSeat = activeSeats[0];
      if (activeSeat.currentBet >= this.state.currentBet && activeSeat.hasActed) {
        return true;
      }
    }

    if (activeSeats.some(s => !s.hasActed)) return false;
    if (activeSeats.some(s => s.currentBet < this.state.currentBet)) return false;

    return true;
  }

  private resetForNewStreet(): void {
    for (const seat of this.state.seats) {
      seat.currentBet = 0;
      seat.hasActed = false;
    }
    this.state.currentBet = 0;
    this.state.lastRaiseAmount = this.state.bigBlind;
  }

  // ==========================================================================
  // Private: Street Advancement
  // ==========================================================================

  private advanceStreet(): TableEvent[] {
    const events: TableEvent[] = [];

    this.resetForNewStreet();

    // Check if everyone is all-in - run out the board
    const activeSeats = getActiveSeats(this.state);
    const seatsInHand = getSeatsInHand(this.state).filter(s => s.handStatus !== 'folded');

    if (activeSeats.length === 0 && seatsInHand.length > 1) {
      // All remaining players are all-in - run out board
      return this.runOutBoard();
    }

    // Normal street advancement
    switch (this.state.currentStreet) {
      case 'pre-flop':
        this.state.currentStreet = 'flop';
        this.dealCommunityCards(3);
        this.log(`Flop: ${formatCards(this.state.communityCards)}`);
        break;
      case 'flop':
        this.state.currentStreet = 'turn';
        this.dealCommunityCards(1);
        this.log(`Turn: ${formatCards(this.state.communityCards)}`);
        break;
      case 'turn':
        this.state.currentStreet = 'river';
        this.dealCommunityCards(1);
        this.log(`River: ${formatCards(this.state.communityCards)}`);
        break;
      case 'river':
        return this.goToShowdown();
    }

    events.push({ type: 'street-changed', street: this.state.currentStreet });

    // Set first to act for new street
    this.setFirstToAct();

    // Check for abandoned seats
    const autoFoldEvents = this.processAbandonedSeatsIfNeeded();
    events.push(...autoFoldEvents);

    // Check if betting is already complete
    if (this.isBettingRoundComplete()) {
      const moreEvents = this.advanceStreet();
      events.push(...moreEvents);
    }

    return events;
  }

  private runOutBoard(): TableEvent[] {
    const events: TableEvent[] = [];
    this.log('Running out board (all-in)');

    while (this.state.currentStreet !== 'river') {
      switch (this.state.currentStreet) {
        case 'pre-flop':
          this.state.currentStreet = 'flop';
          this.dealCommunityCards(3);
          break;
        case 'flop':
          this.state.currentStreet = 'turn';
          this.dealCommunityCards(1);
          break;
        case 'turn':
          this.state.currentStreet = 'river';
          this.dealCommunityCards(1);
          break;
      }
      events.push({ type: 'street-changed', street: this.state.currentStreet });
    }

    this.log(`Board: ${formatCards(this.state.communityCards)}`);

    const showdownEvents = this.goToShowdown();
    events.push(...showdownEvents);

    return events;
  }

  private goToShowdown(): TableEvent[] {
    const events: TableEvent[] = [];

    this.state.currentStreet = 'showdown';
    this.state.activePosition = null;
    this.log('SHOWDOWN');
    events.push({ type: 'showdown' });

    const { table, result } = distributePots(this.state);
    this.state = table;

    this.logResult(result);
    events.push({ type: 'hand-complete', result });

    return events;
  }

  private endHandByFold(): TableEvent[] {
    const events: TableEvent[] = [];

    const { table, result } = endHandByFold(this.state);
    this.state = table;

    this.log(`Hand ended by fold`);
    this.logResult(result);
    events.push({ type: 'hand-complete', result });

    return events;
  }

  // ==========================================================================
  // Private: Abandoned Seat Handling
  // ==========================================================================

  private processAbandonedSeatsIfNeeded(): TableEvent[] {
    const events: TableEvent[] = [];
    let iterations = 0;

    while (iterations < MAX_SEATS) {
      iterations++;

      if (this.state.activePosition === null) break;
      if (this.state.currentStreet === 'showdown') break;

      const seat = this.state.seats[this.state.activePosition];
      if (seat.handStatus !== 'abandoned') break;

      const foldEvents = this.processAbandonedSeat(this.state.activePosition);
      events.push(...foldEvents);

      if (shouldEndByFold(this.state)) {
        const endEvents = this.endHandByFold();
        events.push(...endEvents);
        break;
      }

      if (this.isBettingRoundComplete()) break;
    }

    return events;
  }

  private processAbandonedSeat(position: number): TableEvent[] {
    const events: TableEvent[] = [];
    const seat = this.state.seats[position];

    this.log(`Auto-folding abandoned seat ${position}`);
    seat.handStatus = 'folded';
    seat.hasActed = true;
    events.push({ type: 'seat-auto-folded', seatPosition: position, reason: 'abandoned' });

    this.advanceActivePosition();

    return events;
  }

  // ==========================================================================
  // Private: Cleanup
  // ==========================================================================

  private cleanupAfterHand(): void {
    for (let i = 0; i < this.state.seats.length; i++) {
      const seat = this.state.seats[i];

      if (seat.handStatus === 'empty') continue;

      // Busted or abandoned with no chips - clear seat
      if (seat.stack <= 0 || (seat.handStatus === 'abandoned' && seat.stack <= 0)) {
        this.state.seats[i] = createEmptySeat(i);
        continue;
      }

      // Abandoned with chips - keep as abandoned (can be reclaimed)
      if (seat.handStatus === 'abandoned') {
        seat.holeCards = [];
        seat.currentBet = 0;
        seat.totalBetInHand = 0;
        seat.hasActed = false;
        seat.isWinner = undefined;
        seat.handRank = undefined;
        seat.winAmount = undefined;
        continue;
      }

      // Normal player - reset for next hand
      seat.handStatus = 'sitting-out';
      seat.holeCards = [];
      seat.currentBet = 0;
      seat.totalBetInHand = 0;
      seat.hasActed = false;
      seat.isWinner = undefined;
      seat.handRank = undefined;
      seat.winAmount = undefined;
    }
  }

  // ==========================================================================
  // Private: Utilities
  // ==========================================================================

  private emitAll(events: TableEvent[]): void {
    for (const event of events) {
      this.emit(event);
    }
  }

  private logResult(result: HandResult): void {
    for (const winner of result.winners) {
      this.log(`Winner: ${winner.playerName ?? `Seat ${winner.seatPosition}`} wins ${winner.amount}${winner.handRank ? ` (${winner.handRank})` : ''}`);
    }
  }
}
