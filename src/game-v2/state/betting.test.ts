import { describe, test, expect } from '@jest/globals';
import {
  postBlinds,
  validateAction,
  processAction,
  isBettingRoundComplete,
  resetForNewStreet,
  autoFoldAbandonedSeat,
} from './betting';
import { createTable } from './table-factory';
import { sitPlayer } from './seat-manager';
import { TableState, Seat } from '../types/game-state';
import { GameAction } from '../types/actions';

describe('betting', () => {
  // Helper to set up a table with players
  function setupTable(): TableState {
    let table = createTable({
      id: 'test',
      name: 'Test',
      smallBlind: 10,
      bigBlind: 20,
      minBuyIn: 200,
      maxBuyIn: 2000,
    });

    // Sit 3 players
    table = sitPlayer(table, 0, 'alice', 'Alice', 1000).table;
    table = sitPlayer(table, 1, 'bob', 'Bob', 1000).table;
    table = sitPlayer(table, 2, 'charlie', 'Charlie', 1000).table;

    // Set positions
    table.dealerPosition = 0;
    table.smallBlindPosition = 1;
    table.bigBlindPosition = 2;

    // Mark all as active
    table = {
      ...table,
      seats: table.seats.map(s =>
        s.playerId ? { ...s, handStatus: 'active' as const } : s
      ),
    };

    return table;
  }

  describe('postBlinds', () => {
    test('posts small and big blinds correctly', () => {
      const table = setupTable();
      const result = postBlinds(table);

      // SB (seat 1)
      expect(result.seats[1].stack).toBe(990); // 1000 - 10
      expect(result.seats[1].currentBet).toBe(10);
      expect(result.seats[1].totalBetInHand).toBe(10);

      // BB (seat 2)
      expect(result.seats[2].stack).toBe(980); // 1000 - 20
      expect(result.seats[2].currentBet).toBe(20);
      expect(result.seats[2].totalBetInHand).toBe(20);

      // Pot
      expect(result.pot).toBe(30);
      expect(result.currentBet).toBe(20);
    });

    test('handles short stack going all-in for blind', () => {
      let table = setupTable();

      // Give SB only 5 chips
      table = {
        ...table,
        seats: table.seats.map((s, i) =>
          i === 1 ? { ...s, stack: 5 } : s
        ),
      };

      const result = postBlinds(table);

      expect(result.seats[1].stack).toBe(0);
      expect(result.seats[1].currentBet).toBe(5);
      expect(result.seats[1].handStatus).toBe('all-in');
    });

    test('heads-up: dealer is small blind', () => {
      let table = createTable({
        id: 'test',
        name: 'Test',
        smallBlind: 10,
        bigBlind: 20,
        minBuyIn: 200,
        maxBuyIn: 2000,
      });

      // Only 2 players
      table = sitPlayer(table, 0, 'alice', 'Alice', 1000).table;
      table = sitPlayer(table, 3, 'bob', 'Bob', 1000).table;

      table.dealerPosition = 0;

      table = {
        ...table,
        seats: table.seats.map(s =>
          s.playerId ? { ...s, handStatus: 'active' as const } : s
        ),
      };

      const result = postBlinds(table);

      // Dealer (seat 0) should be SB
      expect(result.smallBlindPosition).toBe(0);
      expect(result.seats[0].currentBet).toBe(10);

      // Other player (seat 3) should be BB
      expect(result.bigBlindPosition).toBe(3);
      expect(result.seats[3].currentBet).toBe(20);
    });
  });

  describe('validateAction', () => {
    test('validates fold', () => {
      let table = setupTable();
      table = postBlinds(table);
      table.activePosition = 0; // Alice's turn

      const action: GameAction = {
        type: 'fold',
        playerId: 'alice',
        seatPosition: 0,
        timestamp: new Date(),
      };

      const result = validateAction(table, action);
      expect(result.valid).toBe(true);
    });

    test('rejects action when not your turn', () => {
      let table = setupTable();
      table = postBlinds(table);
      table.activePosition = 0; // Alice's turn

      const action: GameAction = {
        type: 'fold',
        playerId: 'bob',
        seatPosition: 1, // Bob trying to act
        timestamp: new Date(),
      };

      const result = validateAction(table, action);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Not your turn');
    });

    test('validates check when no bet to call', () => {
      let table = setupTable();
      table.activePosition = 0;
      table.currentBet = 0;

      const action: GameAction = {
        type: 'check',
        playerId: 'alice',
        seatPosition: 0,
        timestamp: new Date(),
      };

      const result = validateAction(table, action);
      expect(result.valid).toBe(true);
    });

    test('rejects check when there is a bet', () => {
      let table = setupTable();
      table = postBlinds(table);
      table.activePosition = 0;

      const action: GameAction = {
        type: 'check',
        playerId: 'alice',
        seatPosition: 0,
        timestamp: new Date(),
      };

      const result = validateAction(table, action);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cannot check - must call or raise');
    });

    test('validates call', () => {
      let table = setupTable();
      table = postBlinds(table);
      table.activePosition = 0;

      const action: GameAction = {
        type: 'call',
        playerId: 'alice',
        seatPosition: 0,
        timestamp: new Date(),
      };

      const result = validateAction(table, action);
      expect(result.valid).toBe(true);
      expect(result.actualAmount).toBe(20); // Call the BB
    });

    test('validates bet when no current bet', () => {
      let table = setupTable();
      table.activePosition = 0;
      table.currentBet = 0;

      const action: GameAction = {
        type: 'bet',
        playerId: 'alice',
        seatPosition: 0,
        amount: 50,
        timestamp: new Date(),
      };

      const result = validateAction(table, action);
      expect(result.valid).toBe(true);
      expect(result.actualAmount).toBe(50);
    });

    test('rejects bet when there is already a bet', () => {
      let table = setupTable();
      table = postBlinds(table);
      table.activePosition = 0;

      const action: GameAction = {
        type: 'bet',
        playerId: 'alice',
        seatPosition: 0,
        amount: 50,
        timestamp: new Date(),
      };

      const result = validateAction(table, action);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cannot bet - use raise');
    });

    test('validates raise', () => {
      let table = setupTable();
      table = postBlinds(table);
      table.activePosition = 0;

      const action: GameAction = {
        type: 'raise',
        playerId: 'alice',
        seatPosition: 0,
        amount: 60, // Raise to 60
        timestamp: new Date(),
      };

      const result = validateAction(table, action);
      expect(result.valid).toBe(true);
    });

    test('validates all-in', () => {
      let table = setupTable();
      table = postBlinds(table);
      table.activePosition = 0;

      const action: GameAction = {
        type: 'all-in',
        playerId: 'alice',
        seatPosition: 0,
        timestamp: new Date(),
      };

      const result = validateAction(table, action);
      expect(result.valid).toBe(true);
      expect(result.actualAmount).toBe(1000); // Full stack
    });
  });

  describe('processAction', () => {
    test('processes fold', () => {
      let table = setupTable();
      table = postBlinds(table);
      table.activePosition = 0;

      const action: GameAction = {
        type: 'fold',
        playerId: 'alice',
        seatPosition: 0,
        timestamp: new Date(),
      };

      const result = processAction(table, action);

      expect(result.seats[0].handStatus).toBe('folded');
      expect(result.seats[0].hasActed).toBe(true);
      expect(result.activePosition).toBe(1); // Moves to next player
    });

    test('processes call', () => {
      let table = setupTable();
      table = postBlinds(table);
      table.activePosition = 0;

      const action: GameAction = {
        type: 'call',
        playerId: 'alice',
        seatPosition: 0,
        timestamp: new Date(),
      };

      const result = processAction(table, action);

      expect(result.seats[0].stack).toBe(980); // 1000 - 20
      expect(result.seats[0].currentBet).toBe(20);
      expect(result.pot).toBe(50); // 30 + 20
    });

    test('processes bet', () => {
      let table = setupTable();
      table.activePosition = 0;
      table.currentBet = 0;
      table = {
        ...table,
        seats: table.seats.map(s =>
          s.playerId ? { ...s, handStatus: 'active' as const } : s
        ),
      };

      const action: GameAction = {
        type: 'bet',
        playerId: 'alice',
        seatPosition: 0,
        amount: 50,
        timestamp: new Date(),
      };

      const result = processAction(table, action);

      expect(result.seats[0].stack).toBe(950);
      expect(result.seats[0].currentBet).toBe(50);
      expect(result.currentBet).toBe(50);
      expect(result.pot).toBe(50);
      // Other players should have hasActed reset
      expect(result.seats[1].hasActed).toBe(false);
      expect(result.seats[2].hasActed).toBe(false);
    });

    test('processes all-in', () => {
      let table = setupTable();
      table = postBlinds(table);
      table.activePosition = 0;

      const action: GameAction = {
        type: 'all-in',
        playerId: 'alice',
        seatPosition: 0,
        timestamp: new Date(),
      };

      const result = processAction(table, action);

      expect(result.seats[0].stack).toBe(0);
      expect(result.seats[0].handStatus).toBe('all-in');
      expect(result.seats[0].currentBet).toBe(1000);
      expect(result.currentBet).toBe(1000);
    });
  });

  describe('isBettingRoundComplete', () => {
    test('returns true when only one player remains', () => {
      let table = setupTable();
      table = postBlinds(table);

      // Alice and Bob fold
      table.seats[0].handStatus = 'folded';
      table.seats[1].handStatus = 'folded';

      expect(isBettingRoundComplete(table)).toBe(true);
    });

    test('returns false when players have not acted', () => {
      let table = setupTable();
      table = postBlinds(table);
      table.activePosition = 0;

      expect(isBettingRoundComplete(table)).toBe(false);
    });

    test('returns true when all active players have acted and matched', () => {
      let table = setupTable();
      table = postBlinds(table);

      // Everyone calls 20
      table.seats[0].currentBet = 20;
      table.seats[0].hasActed = true;
      table.seats[1].currentBet = 20;
      table.seats[1].hasActed = true;
      table.seats[2].currentBet = 20;
      table.seats[2].hasActed = true;

      expect(isBettingRoundComplete(table)).toBe(true);
    });

    test('returns true when all but one are all-in and active player has matched', () => {
      let table = setupTable();
      table = postBlinds(table);

      // Bob and Charlie all-in
      table.seats[1].handStatus = 'all-in';
      table.seats[1].currentBet = 100;
      table.seats[2].handStatus = 'all-in';
      table.seats[2].currentBet = 100;
      table.currentBet = 100;

      // Alice calls
      table.seats[0].currentBet = 100;
      table.seats[0].hasActed = true;

      expect(isBettingRoundComplete(table)).toBe(true);
    });
  });

  describe('resetForNewStreet', () => {
    test('resets current bets and hasActed', () => {
      let table = setupTable();
      table = postBlinds(table);

      // Simulate some betting
      table.seats[0].currentBet = 50;
      table.seats[0].hasActed = true;
      table.seats[1].currentBet = 50;
      table.seats[1].hasActed = true;
      table.seats[2].currentBet = 50;
      table.seats[2].hasActed = true;
      table.currentBet = 50;

      const result = resetForNewStreet(table);

      expect(result.currentBet).toBe(0);
      expect(result.seats[0].currentBet).toBe(0);
      expect(result.seats[0].hasActed).toBe(false);
      expect(result.seats[1].currentBet).toBe(0);
      expect(result.seats[2].currentBet).toBe(0);
    });

    test('sets active position to first player after dealer', () => {
      let table = setupTable();
      table.dealerPosition = 0;

      // Mark all as active
      table = {
        ...table,
        seats: table.seats.map(s =>
          s.playerId ? { ...s, handStatus: 'active' as const } : s
        ),
      };

      const result = resetForNewStreet(table);

      expect(result.activePosition).toBe(1); // First active after dealer
    });
  });

  describe('autoFoldAbandonedSeat', () => {
    test('folds an abandoned seat', () => {
      let table = setupTable();
      table = postBlinds(table);
      table.activePosition = 0;

      // Abandon seat 0
      table.seats[0].handStatus = 'abandoned';
      table.seats[0].playerId = null;

      const result = autoFoldAbandonedSeat(table, 0);

      expect(result.seats[0].handStatus).toBe('folded');
      expect(result.seats[0].hasActed).toBe(true);
      expect(result.activePosition).toBe(1); // Moves to next
    });

    test('does nothing for non-abandoned seat', () => {
      let table = setupTable();
      table = postBlinds(table);
      table.activePosition = 0;

      const result = autoFoldAbandonedSeat(table, 0);

      expect(result.seats[0].handStatus).toBe('active');
    });
  });
});
