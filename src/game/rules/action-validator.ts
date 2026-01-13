import { TableState, GameAction, ActionType, BettingLimits } from "../types/game-state";

/**
 * Action Validator - Validates player actions before they're processed
 *
 * This is part of the Rules layer (Layer 2/3)
 */

/**
 * Validates if a specific action is allowed for a player.
 * Returns { valid: true } if allowed, or { valid: false, error: "reason" } if not.
 */
export function validateAction(
  state: TableState,
  playerId: string,
  action: GameAction
): { valid: boolean; error?: string } {
  const player = state.players.find(p => p.id === playerId);

  // Player must exist
  if (!player) {
    return { valid: false, error: 'Player not found' };
  }

  // Must be player's turn
  if (state.activePlayerPosition !== player.seatPosition) {
    return { valid: false, error: 'Not your turn' };
  }

  // Player must be active
  if (player.status !== 'active') {
    return { valid: false, error: 'Player is not active' };
  }

  // Validate specific action type
  switch (action.type) {
    case 'fold':
      return validateFold(state, player);

    case 'check':
      return validateCheck(state, player);

    case 'call':
      return validateCall(state, player);

    case 'bet':
      return validateBet(state, player, action.amount);

    case 'raise':
      return validateRaise(state, player, action.amount);

    case 'all-in':
      return validateAllIn(state, player);

    default:
      return { valid: false, error: 'Invalid action type' };
  }
}

/**
 * Gets all available actions for a player at the current moment.
 */
export function getAvailableActions(
  state: TableState,
  playerId: string
): ActionType[] {
  const player = state.players.find(p => p.id === playerId);

  if (!player) {
    return [];
  }

  // Not player's turn
  if (state.activePlayerPosition !== player.seatPosition) {
    return [];
  }

  // Player not active
  if (player.status !== 'active') {
    return [];
  }

  const actions: ActionType[] = [];

  // Fold is always available (except when you can check for free)
  const canCheckForFree = state.currentBet === 0 || player.currentBet === state.currentBet;
  if (!canCheckForFree) {
    actions.push('fold');
  }

  // Check if no bet or already matched
  if (state.currentBet === 0 || player.currentBet === state.currentBet) {
    actions.push('check');
  }

  // Call if there's a bet to match
  if (state.currentBet > player.currentBet) {
    actions.push('call');
  }

  // Bet if no current bet and player has chips
  if (state.currentBet === 0 && player.stack > 0) {
    actions.push('bet');
  }

  // Raise if there's a bet and player has chips to raise
  const minRaise = state.currentBet + state.lastRaiseAmount;
  if (state.currentBet > 0 && player.stack + player.currentBet > minRaise) {
    actions.push('raise');
  }

  // All-in always available if player has chips
  if (player.stack > 0) {
    actions.push('all-in');
  }

  return actions;
}

/**
 * Gets betting limits for a player (min/max bet/raise amounts).
 */
export function getBettingLimits(
  state: TableState,
  playerId: string
): BettingLimits {
  const player = state.players.find(p => p.id === playerId);

  if (!player) {
    return {
      min: 0,
      max: 0,
      canCheck: false,
      canBet: false,
      canRaise: false,
      callAmount: 0
    };
  }

  const callAmount = state.currentBet - player.currentBet;
  const canCheck = state.currentBet === 0 || player.currentBet === state.currentBet;
  const canBet = state.currentBet === 0 && player.stack > 0;
  const canRaise = state.currentBet > 0 && player.stack + player.currentBet > state.currentBet;

  // Minimum bet is always the big blind
  const minBet = state.bigBlind;

  // Minimum raise is current bet + last raise amount
  const minRaise = state.currentBet + state.lastRaiseAmount;

  // Maximum is always player's stack + current bet
  const max = player.stack + player.currentBet;

  // For bet: min is BB, max is stack
  // For raise: min is currentBet + BB, max is stack + currentBet
  const min = state.currentBet === 0 ? minBet : minRaise;

  return {
    min,
    max,
    canCheck,
    canBet,
    canRaise,
    callAmount
  };
}

// === Internal validation functions ===

function validateFold(state: TableState, player: Player): { valid: boolean; error?: string } {
  // Can always fold (though it's silly if you can check for free)
  return { valid: true };
}

function validateCheck(state: TableState, player: Player): { valid: boolean; error?: string } {
  // Can check if no bet or already matched the bet
  if (state.currentBet > player.currentBet) {
    return { valid: false, error: 'Cannot check when there is a bet to call' };
  }

  return { valid: true };
}

function validateCall(state: TableState, player: Player): { valid: boolean; error?: string } {
  const callAmount = state.currentBet - player.currentBet;

  if (callAmount <= 0) {
    return { valid: false, error: 'Nothing to call' };
  }

  // Player can call even if they don't have enough (goes all-in)
  return { valid: true };
}

function validateBet(
  state: TableState,
  player: Player,
  amount?: number
): { valid: boolean; error?: string } {
  if (state.currentBet > 0) {
    return { valid: false, error: 'Cannot bet when there is already a bet (use raise)' };
  }

  if (player.stack === 0) {
    return { valid: false, error: 'No chips to bet' };
  }

  if (amount === undefined) {
    return { valid: false, error: 'Bet amount is required' };
  }

  // Minimum bet is the big blind
  const minBet = state.bigBlind;

  // If player doesn't have enough for min bet, they must go all-in
  if (amount < minBet && player.stack >= minBet) {
    return { valid: false, error: `Minimum bet is ${minBet}` };
  }

  // Cannot bet more than you have
  if (amount > player.stack) {
    return { valid: false, error: 'Bet exceeds your stack' };
  }

  return { valid: true };
}

function validateRaise(
  state: TableState,
  player: Player,
  amount?: number
): { valid: boolean; error?: string } {
  if (state.currentBet === 0) {
    return { valid: false, error: 'Cannot raise when there is no bet (use bet)' };
  }

  if (player.stack === 0) {
    return { valid: false, error: 'No chips to raise' };
  }

  if (amount === undefined) {
    return { valid: false, error: 'Raise amount is required' };
  }

  // Cannot raise to less than or equal to current bet
  if (amount <= state.currentBet) {
    return { valid: false, error: 'Raise must be higher than current bet' };
  }

  // Cannot raise more than you have (including current bet)
  if (amount > player.stack + player.currentBet) {
    return { valid: false, error: 'Raise exceeds your stack' };
  }

  // Minimum raise is currentBet + lastRaiseAmount
  const minRaise = state.currentBet + state.lastRaiseAmount;

  // If player doesn't have enough for min raise, they must call or go all-in
  if (amount < minRaise && player.stack + player.currentBet >= minRaise) {
    return { valid: false, error: `Minimum raise is ${minRaise}` };
  }

  return { valid: true };
}

function validateAllIn(state: TableState, player: Player): { valid: boolean; error?: string } {
  if (player.stack === 0) {
    return { valid: false, error: 'No chips to go all-in' };
  }

  return { valid: true };
}

// Import Player type
import type { Player } from "../types/game-state";
