import { describe, test, expect } from '@jest/globals';
import {
  validateAction,
  getAvailableActions,
  getBettingLimits
} from './action-validator';
import { createInitialTableState, createPlayer, type GameAction } from '../types/game-state';

describe('validateAction', () => {

  test('returns error when player not found', () => {
    const table = createInitialTableState('t1', 100, 200);

    const action: GameAction = {
      type: 'fold',
      playerId: 'unknown',
      timestamp: new Date()
    };

    const result = validateAction(table, 'unknown', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Player not found');
  });

  test('returns error when not player\'s turn', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    bob.status = 'active';

    table.players.push(alice, bob);
    table.activePlayerPosition = 0; // Alice's turn

    const action: GameAction = {
      type: 'fold',
      playerId: 'p2', // Bob trying to act
      timestamp: new Date()
    };

    const result = validateAction(table, 'p2', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Not your turn');
  });

  test('returns error when player is not active', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'folded'; // Not active

    table.players.push(alice);
    table.activePlayerPosition = 0;

    const action: GameAction = {
      type: 'check',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Player is not active');
  });

});

describe('validateAction - fold', () => {

  test('allows fold', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    table.players.push(alice);
    table.activePlayerPosition = 0;

    const action: GameAction = {
      type: 'fold',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(true);
  });

});

describe('validateAction - check', () => {

  test('allows check when no bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 0;

    const action: GameAction = {
      type: 'check',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(true);
  });

  test('allows check when already matched bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    alice.currentBet = 200;

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200;

    const action: GameAction = {
      type: 'check',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(true);
  });

  test('disallows check when there is a bet to call', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    alice.currentBet = 0;

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200;

    const action: GameAction = {
      type: 'check',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Cannot check when there is a bet to call');
  });

});

describe('validateAction - call', () => {

  test('allows call when there is a bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    alice.currentBet = 0;

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200;

    const action: GameAction = {
      type: 'call',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(true);
  });

  test('disallows call when nothing to call', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    alice.currentBet = 0;

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 0;

    const action: GameAction = {
      type: 'call',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Nothing to call');
  });

  test('allows call even with insufficient chips (will go all-in)', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 100); // Only 100 chips

    alice.status = 'active';
    alice.currentBet = 0;

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 500; // Need 500 to call

    const action: GameAction = {
      type: 'call',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(true); // Can call (will go all-in)
  });

});

describe('validateAction - bet', () => {

  test('allows valid bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 0;

    const action: GameAction = {
      type: 'bet',
      playerId: 'p1',
      amount: 500,
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(true);
  });

  test('disallows bet when there is already a bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200;

    const action: GameAction = {
      type: 'bet',
      playerId: 'p1',
      amount: 500,
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Cannot bet when there is already a bet (use raise)');
  });

  test('disallows bet with no chips', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 0); // No chips

    alice.status = 'active';
    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 0;

    const action: GameAction = {
      type: 'bet',
      playerId: 'p1',
      amount: 500,
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('No chips to bet');
  });

  test('requires bet amount', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 0;

    const action: GameAction = {
      type: 'bet',
      playerId: 'p1',
      // No amount
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Bet amount is required');
  });

  test('enforces minimum bet (big blind)', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 0;

    const action: GameAction = {
      type: 'bet',
      playerId: 'p1',
      amount: 50, // Less than big blind (200)
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Minimum bet is 200');
  });

  test('allows bet less than minimum if going all-in', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 150); // Less than big blind

    alice.status = 'active';
    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 0;

    const action: GameAction = {
      type: 'bet',
      playerId: 'p1',
      amount: 150, // All-in, less than big blind
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(true); // All-in allowed
  });

  test('disallows bet exceeding stack', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 500);

    alice.status = 'active';
    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 0;

    const action: GameAction = {
      type: 'bet',
      playerId: 'p1',
      amount: 1000, // More than stack
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Bet exceeds your stack');
  });

});

describe('validateAction - raise', () => {

  test('allows valid raise', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    alice.currentBet = 0;

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200;

    const action: GameAction = {
      type: 'raise',
      playerId: 'p1',
      amount: 600, // Raise to 600
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(true);
  });

  test('disallows raise when no bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 0;

    const action: GameAction = {
      type: 'raise',
      playerId: 'p1',
      amount: 500,
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Cannot raise when there is no bet (use bet)');
  });

  test('enforces minimum raise (currentBet + lastRaiseAmount)', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    alice.currentBet = 0;

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200;
    table.lastRaiseAmount = 200; // Last raise was 200 (BB)

    const action: GameAction = {
      type: 'raise',
      playerId: 'p1',
      amount: 300, // Less than minimum (200 + 200 = 400)
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Minimum raise is 400');
  });

  test('disallows raise not higher than current bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const john = createPlayer('p2', 'John', 1, 10000);
    alice.status = 'active';
    john.status = 'active';
    alice.currentBet = 0;
    john.currentBet = 500;

    table.players.push(alice, john);
    table.activePlayerPosition = 0;
    table.currentBet = 500;

    const action: GameAction = {
      type: 'raise',
      playerId: 'p1',
      amount: 400, // Less than current bet
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Raise must be higher than current bet');
  });

  test('disallows raise exceeding stack + current bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 500);

    alice.status = 'active';
    alice.currentBet = 100;

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200;

    const action: GameAction = {
      type: 'raise',
      playerId: 'p1',
      amount: 1000, // More than 500 + 100 = 600
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Raise exceeds your stack');
  });

  test('enforces proper No Limit raise increments', () => {
    const table = createInitialTableState('t1', 5, 10);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    alice.currentBet = 0;

    table.players.push(alice);
    table.activePlayerPosition = 0;

    // Player 3 raised to 20 (raise of 10)
    table.currentBet = 20;
    table.lastRaiseAmount = 10; // Size of last raise

    // Player 4 must raise minimum 10 more (to 30)
    const action1: GameAction = {
      type: 'raise',
      playerId: 'p1',
      amount: 29, // Less than minimum (20 + 10 = 30)
      timestamp: new Date()
    };

    const result1 = validateAction(table, 'p1', action1);
    expect(result1.valid).toBe(false);
    expect(result1.error).toBe('Minimum raise is 30');

    // Player 4 can raise exactly 10 (to 30)
    const action2: GameAction = {
      type: 'raise',
      playerId: 'p1',
      amount: 30,
      timestamp: new Date()
    };

    const result2 = validateAction(table, 'p1', action2);
    expect(result2.valid).toBe(true);

    // Player 4 can raise 20 (to 40)
    const action3: GameAction = {
      type: 'raise',
      playerId: 'p1',
      amount: 40,
      timestamp: new Date()
    };

    const result3 = validateAction(table, 'p1', action3);
    expect(result3.valid).toBe(true);

    // If Player 4 raised to 40 (raise of 20), next player must raise minimum 20
    table.currentBet = 40;
    table.lastRaiseAmount = 20; // New raise size

    const action4: GameAction = {
      type: 'raise',
      playerId: 'p1',
      amount: 59, // Less than minimum (40 + 20 = 60)
      timestamp: new Date()
    };

    const result4 = validateAction(table, 'p1', action4);
    expect(result4.valid).toBe(false);
    expect(result4.error).toBe('Minimum raise is 60');
  });

});

describe('validateAction - all-in', () => {

  test('allows all-in', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    table.players.push(alice);
    table.activePlayerPosition = 0;

    const action: GameAction = {
      type: 'all-in',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(true);
  });

  test('disallows all-in with no chips', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 0);

    alice.status = 'active';
    table.players.push(alice);
    table.activePlayerPosition = 0;

    const action: GameAction = {
      type: 'all-in',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = validateAction(table, 'p1', action);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('No chips to go all-in');
  });

});

describe('getAvailableActions', () => {

  test('returns empty array when not player\'s turn', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    bob.status = 'active';

    table.players.push(alice, bob);
    table.activePlayerPosition = 0; // Alice's turn

    const actions = getAvailableActions(table, 'p2'); // Bob

    expect(actions).toHaveLength(0);
  });

  test('returns empty array when player not active', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'folded';
    table.players.push(alice);
    table.activePlayerPosition = 0;

    const actions = getAvailableActions(table, 'p1');

    expect(actions).toHaveLength(0);
  });

  test('returns check, bet, all-in when no bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 0;

    const actions = getAvailableActions(table, 'p1');

    expect(actions).toContain('check');
    expect(actions).toContain('bet');
    expect(actions).toContain('all-in');
    expect(actions).not.toContain('fold'); // Can check for free
    expect(actions).not.toContain('call');
    expect(actions).not.toContain('raise');
  });

  test('returns fold, call, raise, all-in when there is a bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    alice.currentBet = 0;

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200;

    const actions = getAvailableActions(table, 'p1');

    expect(actions).toContain('fold');
    expect(actions).toContain('call');
    expect(actions).toContain('raise');
    expect(actions).toContain('all-in');
    expect(actions).not.toContain('check');
    expect(actions).not.toContain('bet');
  });

  test('returns check and raise when already matched bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    alice.currentBet = 200;

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200;

    const actions = getAvailableActions(table, 'p1');

    expect(actions).toContain('check');
    expect(actions).toContain('raise'); // Can raise (currentBet > 0)
    expect(actions).toContain('all-in');
    expect(actions).not.toContain('fold'); // Can check for free
    expect(actions).not.toContain('bet'); // Can't bet when currentBet > 0
  });

  test('excludes raise when insufficient chips', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 100); // Not enough for min raise

    alice.status = 'active';
    alice.currentBet = 0;

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 500; // Min raise would be 700

    const actions = getAvailableActions(table, 'p1');

    expect(actions).toContain('fold');
    expect(actions).toContain('call');
    expect(actions).toContain('all-in');
    expect(actions).not.toContain('raise'); // Can't afford min raise
  });

});

describe('getBettingLimits', () => {

  test('returns correct limits when no bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    table.players.push(alice);
    table.currentBet = 0;

    const limits = getBettingLimits(table, 'p1');

    expect(limits.min).toBe(200); // Big blind
    expect(limits.max).toBe(10000); // Stack
    expect(limits.canCheck).toBe(true);
    expect(limits.canBet).toBe(true);
    expect(limits.canRaise).toBe(false);
    expect(limits.callAmount).toBe(0);
  });

  test('returns correct limits when there is a bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    alice.currentBet = 0;

    table.players.push(alice);
    table.currentBet = 500;

    const limits = getBettingLimits(table, 'p1');

    expect(limits.min).toBe(700); // Current bet (500) + big blind (200)
    expect(limits.max).toBe(10000); // Stack + current bet (0)
    expect(limits.canCheck).toBe(false);
    expect(limits.canBet).toBe(false);
    expect(limits.canRaise).toBe(true);
    expect(limits.callAmount).toBe(500);
  });

  test('returns correct call amount', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    alice.currentBet = 200; // Already bet 200

    table.players.push(alice);
    table.currentBet = 500; // Need to match 500

    const limits = getBettingLimits(table, 'p1');

    expect(limits.callAmount).toBe(300); // 500 - 200
  });

  test('returns correct max including current bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 5000);

    alice.status = 'active';
    alice.currentBet = 1000; // Already bet 1000

    table.players.push(alice);
    table.currentBet = 2000;

    const limits = getBettingLimits(table, 'p1');

    expect(limits.max).toBe(6000); // Stack (5000) + current bet (1000)
  });

  test('returns zeros for unknown player', () => {
    const table = createInitialTableState('t1', 100, 200);

    const limits = getBettingLimits(table, 'unknown');

    expect(limits.min).toBe(0);
    expect(limits.max).toBe(0);
    expect(limits.canCheck).toBe(false);
    expect(limits.canBet).toBe(false);
    expect(limits.canRaise).toBe(false);
    expect(limits.callAmount).toBe(0);
  });

});
