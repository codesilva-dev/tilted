import { describe, test, expect } from '@jest/globals';
import {
  sitPlayer,
  standPlayer,
  abandonSeat,
  cleanupSeatsAfterHand,
  getAvailableSeats,
  canSitAt,
  reclaimSeat,
} from './seat-manager';
import { createTable } from './table-factory';
import { TableState } from '../types/game-state';

describe('seat-manager', () => {
  let table: TableState;

  beforeEach(() => {
    table = createTable({
      id: 'test-table',
      name: 'Test Table',
      smallBlind: 10,
      bigBlind: 20,
      minBuyIn: 200,
      maxBuyIn: 2000,
    });
  });

  describe('sitPlayer', () => {
    test('sits a player at an empty seat', () => {
      const result = sitPlayer(table, 0, 'player-1', 'Alice', 1000);

      expect(result.success).toBe(true);
      expect(result.table.seats[0].playerId).toBe('player-1');
      expect(result.table.seats[0].playerName).toBe('Alice');
      expect(result.table.seats[0].stack).toBe(1000);
      expect(result.table.seats[0].handStatus).toBe('sitting-out');
    });

    test('rejects sitting at occupied seat', () => {
      const { table: tableWithPlayer } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);
      const result = sitPlayer(tableWithPlayer, 0, 'player-2', 'Bob', 1000);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Seat is occupied');
    });

    test('rejects if player already seated elsewhere', () => {
      const { table: tableWithPlayer } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);
      const result = sitPlayer(tableWithPlayer, 1, 'player-1', 'Alice', 1000);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Player already seated at another seat');
    });

    test('rejects buy-in below minimum', () => {
      const result = sitPlayer(table, 0, 'player-1', 'Alice', 100); // min is 200

      expect(result.success).toBe(false);
      expect(result.error).toBe('Minimum buy-in is 200');
    });

    test('rejects buy-in above maximum', () => {
      const result = sitPlayer(table, 0, 'player-1', 'Alice', 5000); // max is 2000

      expect(result.success).toBe(false);
      expect(result.error).toBe('Maximum buy-in is 2000');
    });

    test('rejects invalid seat position', () => {
      const result = sitPlayer(table, 15, 'player-1', 'Alice', 1000);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid seat position');
    });
  });

  describe('standPlayer', () => {
    test('removes player from seat when no hand in progress', () => {
      const { table: tableWithPlayer } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);
      const result = standPlayer(tableWithPlayer, 'player-1');

      expect(result.success).toBe(true);
      expect(result.table.seats[0].playerId).toBeNull();
      expect(result.table.seats[0].stack).toBe(0);
      expect(result.table.seats[0].handStatus).toBe('empty');
    });

    test('marks seat as abandoned when hand in progress', () => {
      let { table: t } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);

      // Simulate hand in progress
      t = {
        ...t,
        seats: t.seats.map((s, i) =>
          i === 0
            ? { ...s, handStatus: 'active' as const, holeCards: [{ rank: 'A' as const, suit: 'spades' as const }, { rank: 'K' as const, suit: 'spades' as const }] }
            : s
        ),
      };

      const result = standPlayer(t, 'player-1');

      expect(result.success).toBe(true);
      expect(result.table.seats[0].playerId).toBeNull();
      expect(result.table.seats[0].handStatus).toBe('abandoned');
      expect(result.table.seats[0].stack).toBe(1000); // Stack stays
      expect(result.table.seats[0].holeCards.length).toBe(2); // Cards stay
    });

    test('returns error if player not seated', () => {
      const result = standPlayer(table, 'player-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Player not seated');
    });
  });

  describe('abandonSeat', () => {
    test('marks seat as abandoned mid-hand', () => {
      let { table: t } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);

      // Simulate hand in progress
      t = {
        ...t,
        seats: t.seats.map((s, i) =>
          i === 0
            ? { ...s, handStatus: 'active' as const, holeCards: [{ rank: 'A' as const, suit: 'spades' as const }, { rank: 'K' as const, suit: 'spades' as const }] }
            : s
        ),
      };

      const result = abandonSeat(t, 0);

      expect(result.success).toBe(true);
      expect(result.table.seats[0].playerId).toBeNull();
      expect(result.table.seats[0].handStatus).toBe('abandoned');
    });

    test('clears seat if no hand in progress', () => {
      const { table: t } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);
      const result = abandonSeat(t, 0);

      expect(result.success).toBe(true);
      expect(result.table.seats[0].playerId).toBeNull();
      expect(result.table.seats[0].handStatus).toBe('empty');
    });
  });

  describe('cleanupSeatsAfterHand', () => {
    test('resets active seats to sitting-out', () => {
      let { table: t } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);

      // Simulate end of hand
      t = {
        ...t,
        seats: t.seats.map((s, i) =>
          i === 0
            ? {
                ...s,
                handStatus: 'active' as const,
                holeCards: [{ rank: 'A' as const, suit: 'spades' as const }, { rank: 'K' as const, suit: 'spades' as const }],
                currentBet: 50,
                totalBetInHand: 100,
              }
            : s
        ),
      };

      const result = cleanupSeatsAfterHand(t);

      expect(result.seats[0].handStatus).toBe('sitting-out');
      expect(result.seats[0].holeCards).toEqual([]);
      expect(result.seats[0].currentBet).toBe(0);
      expect(result.seats[0].totalBetInHand).toBe(0);
      expect(result.seats[0].playerId).toBe('player-1'); // Player still there
    });

    test('clears busted players', () => {
      let { table: t } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);

      // Simulate player going bust
      t = {
        ...t,
        seats: t.seats.map((s, i) =>
          i === 0
            ? { ...s, stack: 0, handStatus: 'all-in' as const }
            : s
        ),
      };

      const result = cleanupSeatsAfterHand(t);

      expect(result.seats[0].handStatus).toBe('empty');
      expect(result.seats[0].playerId).toBeNull();
    });

    test('clears abandoned seats with no chips', () => {
      let { table: t } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);

      // Simulate abandoned and busted
      t = {
        ...t,
        seats: t.seats.map((s, i) =>
          i === 0
            ? { ...s, stack: 0, playerId: null, handStatus: 'abandoned' as const }
            : s
        ),
      };

      const result = cleanupSeatsAfterHand(t);

      expect(result.seats[0].handStatus).toBe('empty');
    });

    test('keeps abandoned seats with chips', () => {
      let { table: t } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);

      // Simulate abandoned but has chips
      t = {
        ...t,
        seats: t.seats.map((s, i) =>
          i === 0
            ? { ...s, playerId: null, handStatus: 'abandoned' as const }
            : s
        ),
      };

      const result = cleanupSeatsAfterHand(t);

      expect(result.seats[0].handStatus).toBe('abandoned');
      expect(result.seats[0].stack).toBe(1000);
    });
  });

  describe('getAvailableSeats', () => {
    test('returns all seats when table empty', () => {
      const available = getAvailableSeats(table);
      expect(available.length).toBe(10);
    });

    test('excludes occupied seats', () => {
      const { table: t } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);
      const available = getAvailableSeats(t);

      expect(available.length).toBe(9);
      expect(available).not.toContain(0);
    });
  });

  describe('canSitAt', () => {
    test('returns true for empty seat', () => {
      const result = canSitAt(table, 0, 'player-1');
      expect(result.canSit).toBe(true);
    });

    test('returns false for occupied seat', () => {
      const { table: t } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);
      const result = canSitAt(t, 0, 'player-2');

      expect(result.canSit).toBe(false);
      expect(result.reason).toBe('Seat is occupied');
    });

    test('returns false if already seated', () => {
      const { table: t } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);
      const result = canSitAt(t, 1, 'player-1');

      expect(result.canSit).toBe(false);
      expect(result.reason).toBe('Already seated');
    });
  });

  describe('reclaimSeat', () => {
    test('allows reclaiming an abandoned seat', () => {
      let { table: t } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);

      // Abandon the seat
      t = {
        ...t,
        seats: t.seats.map((s, i) =>
          i === 0
            ? { ...s, playerId: null, playerName: null, handStatus: 'abandoned' as const }
            : s
        ),
      };

      const result = reclaimSeat(t, 0, 'player-2', 'Bob');

      expect(result.success).toBe(true);
      expect(result.table.seats[0].playerId).toBe('player-2');
      expect(result.table.seats[0].playerName).toBe('Bob');
      expect(result.table.seats[0].stack).toBe(1000); // Original stack
    });

    test('rejects reclaiming non-abandoned seat', () => {
      const { table: t } = sitPlayer(table, 0, 'player-1', 'Alice', 1000);
      const result = reclaimSeat(t, 0, 'player-2', 'Bob');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Seat is not abandoned');
    });
  });
});
