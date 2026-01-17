/**
 * Game actions for Tilted v2
 *
 * Actions are still initiated by players, but validated against seat state.
 */

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

/**
 * A game action submitted by a player
 */
export interface GameAction {
  type: ActionType;
  playerId: string;      // Who submitted the action
  seatPosition: number;  // Which seat they're acting from
  amount?: number;       // For bet/raise actions
  timestamp: Date;
}

/**
 * Result of validating an action
 */
export interface ActionValidation {
  valid: boolean;
  error?: string;
  // Computed values for valid actions
  actualAmount?: number;  // Amount after adjustments (e.g., call amount, all-in cap)
}

/**
 * Hand result after showdown or fold-out
 */
export interface HandResult {
  winners: Array<{
    seatPosition: number;
    playerId: string | null;
    playerName: string | null;
    amount: number;
    handRank?: string;
  }>;
  pots: Array<{
    amount: number;
    eligibleSeats: number[];
    winners: number[];  // Seat positions
  }>;
  totalDistributed: number;
}

/**
 * Create a game action
 */
export function createAction(
  type: ActionType,
  playerId: string,
  seatPosition: number,
  amount?: number
): GameAction {
  return {
    type,
    playerId,
    seatPosition,
    amount,
    timestamp: new Date(),
  };
}
