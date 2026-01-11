import { describe, test, expect } from '@jest/globals';
import {
  calculatePots,
  determineWinnersForPot,
  distributePots,
  endHandByFold,
  shouldEndHandByFold,
  shouldGoToShowdown
} from './pot-manager';
import { createInitialTableState, createPlayer, type Pot } from '../types/game-state';
import { type Card } from '../core/cards';

describe('calculatePots', () => {

  test('creates single main pot with no all-ins', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);
    const charlie = createPlayer('p3', 'Charlie', 2, 10000);

    alice.status = 'active';
    alice.totalBetInHand = 500;

    bob.status = 'active';
    bob.totalBetInHand = 500;

    charlie.status = 'active';
    charlie.totalBetInHand = 500;

    table.players.push(alice, bob, charlie);
    table.pot = 1500;

    const pots = calculatePots(table);

    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(1500);
    expect(pots[0].type).toBe('main');
    expect(pots[0].eligiblePlayers).toHaveLength(3);
    expect(pots[0].eligiblePlayers).toContain('p1');
    expect(pots[0].eligiblePlayers).toContain('p2');
    expect(pots[0].eligiblePlayers).toContain('p3');
  });

  test('creates main pot and one side pot', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);
    const charlie = createPlayer('p3', 'Charlie', 2, 10000);

    // Alice all-in for 100
    alice.status = 'all-in';
    alice.totalBetInHand = 100;

    // Bob calls 500
    bob.status = 'active';
    bob.totalBetInHand = 500;

    // Charlie calls 500
    charlie.status = 'active';
    charlie.totalBetInHand = 500;

    table.players.push(alice, bob, charlie);
    table.pot = 1100; // 100 + 500 + 500

    const pots = calculatePots(table);

    expect(pots).toHaveLength(2);

    // Main pot: 100 * 3 = 300 (Alice, Bob, Charlie eligible)
    expect(pots[0].type).toBe('main');
    expect(pots[0].amount).toBe(300);
    expect(pots[0].eligiblePlayers).toHaveLength(3);

    // Side pot: 400 * 2 = 800 (only Bob and Charlie eligible)
    expect(pots[1].type).toBe('side');
    expect(pots[1].amount).toBe(800);
    expect(pots[1].eligiblePlayers).toHaveLength(2);
    expect(pots[1].eligiblePlayers).toContain('p2');
    expect(pots[1].eligiblePlayers).toContain('p3');
    expect(pots[1].eligiblePlayers).not.toContain('p1');
  });

  test('creates multiple side pots with multiple all-ins', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);
    const charlie = createPlayer('p3', 'Charlie', 2, 10000);

    // Alice all-in for 100
    alice.status = 'all-in';
    alice.totalBetInHand = 100;

    // Bob all-in for 300
    bob.status = 'all-in';
    bob.totalBetInHand = 300;

    // Charlie calls 500
    charlie.status = 'active';
    charlie.totalBetInHand = 500;

    table.players.push(alice, bob, charlie);
    table.pot = 900;

    const pots = calculatePots(table);

    expect(pots).toHaveLength(3);

    // Main pot: 100 * 3 = 300 (all eligible)
    expect(pots[0].type).toBe('main');
    expect(pots[0].amount).toBe(300);
    expect(pots[0].eligiblePlayers).toHaveLength(3);

    // Side pot 1: 200 * 2 = 400 (Bob and Charlie)
    expect(pots[1].type).toBe('side');
    expect(pots[1].amount).toBe(400);
    expect(pots[1].eligiblePlayers).toHaveLength(2);
    expect(pots[1].eligiblePlayers).toContain('p2');
    expect(pots[1].eligiblePlayers).toContain('p3');

    // Side pot 2: 200 * 1 = 200 (only Charlie)
    expect(pots[2].type).toBe('side');
    expect(pots[2].amount).toBe(200);
    expect(pots[2].eligiblePlayers).toHaveLength(1);
    expect(pots[2].eligiblePlayers).toContain('p3');
  });

  test('handles players who folded correctly', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);
    const charlie = createPlayer('p3', 'Charlie', 2, 10000);

    alice.status = 'folded'; // Folded, not in hand
    alice.totalBetInHand = 200;

    bob.status = 'active';
    bob.totalBetInHand = 500;

    charlie.status = 'active';
    charlie.totalBetInHand = 500;

    table.players.push(alice, bob, charlie);
    table.pot = 1200;

    const pots = calculatePots(table);

    // Should only count Bob and Charlie (Alice folded)
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(1000); // 500 * 2
    expect(pots[0].eligiblePlayers).toHaveLength(2);
    expect(pots[0].eligiblePlayers).not.toContain('p1');
  });

  test('returns empty array when no players in hand', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'folded';
    table.players.push(alice);

    const pots = calculatePots(table);

    expect(pots).toHaveLength(0);
  });

});

describe('determineWinnersForPot', () => {

  test('awards pot to only eligible player', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'active';
    alice.holeCards = [
      { rank: 'A', suit: 'hearts' },
      { rank: 'K', suit: 'hearts' }
    ];

    table.players.push(alice);

    const pot: Pot = {
      amount: 500,
      eligiblePlayers: ['p1'],
      type: 'main'
    };

    const communityCards: Card[] = [
      { rank: 'Q', suit: 'hearts' },
      { rank: 'J', suit: 'hearts' },
      { rank: 'T', suit: 'hearts' },
      { rank: '2', suit: 'clubs' },
      { rank: '3', suit: 'diamonds' }
    ];

    const result = determineWinnersForPot(pot, table.players, communityCards);

    expect(result.winners).toHaveLength(1);
    expect(result.winners[0].playerId).toBe('p1');
    expect(result.winners[0].amountWon).toBe(500);
    expect(result.wasSplit).toBe(false);
  });

  test('awards pot to player with best hand', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    // Alice has pair of Aces
    alice.status = 'active';
    alice.holeCards = [
      { rank: 'A', suit: 'hearts' },
      { rank: 'A', suit: 'diamonds' }
    ];

    // Bob has pair of Kings
    bob.status = 'active';
    bob.holeCards = [
      { rank: 'K', suit: 'hearts' },
      { rank: 'K', suit: 'diamonds' }
    ];

    table.players.push(alice, bob);

    const pot: Pot = {
      amount: 1000,
      eligiblePlayers: ['p1', 'p2'],
      type: 'main'
    };

    const communityCards: Card[] = [
      { rank: 'Q', suit: 'hearts' },
      { rank: 'J', suit: 'hearts' },
      { rank: 'T', suit: 'hearts' },
      { rank: '2', suit: 'clubs' },
      { rank: '3', suit: 'diamonds' }
    ];

    const result = determineWinnersForPot(pot, table.players, communityCards);

    expect(result.winners).toHaveLength(1);
    expect(result.winners[0].playerId).toBe('p1'); // Alice wins with higher pair
    expect(result.winners[0].amountWon).toBe(1000);
    expect(result.wasSplit).toBe(false);
  });

  test('splits pot between tied players', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    // Both have Ace-King
    alice.status = 'active';
    alice.holeCards = [
      { rank: 'A', suit: 'hearts' },
      { rank: 'K', suit: 'diamonds' }
    ];

    bob.status = 'active';
    bob.holeCards = [
      { rank: 'A', suit: 'clubs' },
      { rank: 'K', suit: 'spades' }
    ];

    table.players.push(alice, bob);

    const pot: Pot = {
      amount: 1000,
      eligiblePlayers: ['p1', 'p2'],
      type: 'main'
    };

    const communityCards: Card[] = [
      { rank: 'Q', suit: 'hearts' },
      { rank: 'J', suit: 'hearts' },
      { rank: 'T', suit: 'hearts' },
      { rank: '9', suit: 'clubs' },
      { rank: '8', suit: 'diamonds' }
    ];

    const result = determineWinnersForPot(pot, table.players, communityCards);

    expect(result.winners).toHaveLength(2);
    expect(result.wasSplit).toBe(true);

    // Each gets 500
    const alice_win = result.winners.find(w => w.playerId === 'p1');
    const bob_win = result.winners.find(w => w.playerId === 'p2');

    expect(alice_win?.amountWon).toBe(500);
    expect(bob_win?.amountWon).toBe(500);
  });

  test('gives odd chip to first winner in split pot', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    alice.holeCards = [
      { rank: 'A', suit: 'hearts' },
      { rank: 'K', suit: 'diamonds' }
    ];

    bob.status = 'active';
    bob.holeCards = [
      { rank: 'A', suit: 'clubs' },
      { rank: 'K', suit: 'spades' }
    ];

    table.players.push(alice, bob);

    const pot: Pot = {
      amount: 1001, // Odd amount
      eligiblePlayers: ['p1', 'p2'],
      type: 'main'
    };

    const communityCards: Card[] = [
      { rank: 'Q', suit: 'hearts' },
      { rank: 'J', suit: 'hearts' },
      { rank: 'T', suit: 'hearts' },
      { rank: '9', suit: 'clubs' },
      { rank: '8', suit: 'diamonds' }
    ];

    const result = determineWinnersForPot(pot, table.players, communityCards);

    expect(result.winners).toHaveLength(2);

    // First winner gets 501, second gets 500
    expect(result.winners[0].amountWon).toBe(501);
    expect(result.winners[1].amountWon).toBe(500);
  });

  test('only considers eligible players for pot', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);
    const charlie = createPlayer('p3', 'Charlie', 2, 10000);

    // Alice has best hand but not eligible for this pot
    alice.status = 'all-in';
    alice.holeCards = [
      { rank: 'A', suit: 'hearts' },
      { rank: 'A', suit: 'diamonds' }
    ];

    // Bob eligible with Kings
    bob.status = 'active';
    bob.holeCards = [
      { rank: 'K', suit: 'hearts' },
      { rank: 'K', suit: 'diamonds' }
    ];

    // Charlie eligible with Queens
    charlie.status = 'active';
    charlie.holeCards = [
      { rank: 'Q', suit: 'hearts' },
      { rank: 'Q', suit: 'diamonds' }
    ];

    table.players.push(alice, bob, charlie);

    // Side pot - only Bob and Charlie eligible
    const pot: Pot = {
      amount: 800,
      eligiblePlayers: ['p2', 'p3'], // Alice not eligible
      type: 'side'
    };

    const communityCards: Card[] = [
      { rank: 'J', suit: 'hearts' },
      { rank: 'T', suit: 'hearts' },
      { rank: '9', suit: 'hearts' },
      { rank: '2', suit: 'clubs' },
      { rank: '3', suit: 'diamonds' }
    ];

    const result = determineWinnersForPot(pot, table.players, communityCards);

    expect(result.winners).toHaveLength(1);
    expect(result.winners[0].playerId).toBe('p2'); // Bob wins (not Alice)
    expect(result.winners[0].amountWon).toBe(800);
  });

});

describe('distributePots', () => {

  test('distributes single pot to winner', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 9500);
    const bob = createPlayer('p2', 'Bob', 1, 9500);

    // Alice has better hand
    alice.status = 'active';
    alice.totalBetInHand = 500;
    alice.holeCards = [
      { rank: 'A', suit: 'hearts' },
      { rank: 'A', suit: 'diamonds' }
    ];

    bob.status = 'active';
    bob.totalBetInHand = 500;
    bob.holeCards = [
      { rank: 'K', suit: 'hearts' },
      { rank: 'K', suit: 'diamonds' }
    ];

    table.players.push(alice, bob);
    table.pot = 1000;
    table.communityCards = [
      { rank: 'Q', suit: 'hearts' },
      { rank: 'J', suit: 'clubs' },
      { rank: 'T', suit: 'diamonds' },
      { rank: '2', suit: 'spades' },
      { rank: '3', suit: 'hearts' }
    ];

    const { table: resultTable, result } = distributePots(table);

    expect(result.potResults).toHaveLength(1);
    expect(result.totalDistributed).toBe(1000);

    // Alice should now have 10500 (9500 + 1000)
    const aliceAfter = resultTable.players.find(p => p.id === 'p1');
    expect(aliceAfter?.stack).toBe(10500);

    // Bob should still have 9500
    const bobAfter = resultTable.players.find(p => p.id === 'p2');
    expect(bobAfter?.stack).toBe(9500);

    // Pot should be cleared
    expect(resultTable.pot).toBe(0);
  });

  test('distributes multiple pots correctly', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 0); // All-in, now has 0
    const bob = createPlayer('p2', 'Bob', 1, 9500);
    const charlie = createPlayer('p3', 'Charlie', 2, 9000);

    // Alice all-in for 100, has worst hand
    alice.status = 'all-in';
    alice.totalBetInHand = 100;
    alice.holeCards = [
      { rank: '2', suit: 'hearts' },
      { rank: '3', suit: 'diamonds' }
    ];

    // Bob bet 500, has best hand
    bob.status = 'active';
    bob.totalBetInHand = 500;
    bob.holeCards = [
      { rank: 'K', suit: 'hearts' },
      { rank: 'K', suit: 'diamonds' }
    ];

    // Charlie bet 500, has medium hand
    charlie.status = 'active';
    charlie.totalBetInHand = 500;
    charlie.holeCards = [
      { rank: 'A', suit: 'hearts' },
      { rank: 'A', suit: 'diamonds' }
    ];

    table.players.push(alice, bob, charlie);
    table.pot = 1100;
    table.communityCards = [
      { rank: 'Q', suit: 'hearts' },
      { rank: 'J', suit: 'clubs' },
      { rank: 'T', suit: 'diamonds' },
      { rank: '9', suit: 'spades' },
      { rank: '8', suit: 'hearts' }
    ];

    const { table: resultTable, result } = distributePots(table);

    expect(result.potResults).toHaveLength(2);

    // Main pot (300): Bob wins
    expect(result.potResults[0].pot.type).toBe('main');
    expect(result.potResults[0].winners[0].playerId).toBe('p2');

    // Side pot (800): Bob wins
    expect(result.potResults[1].pot.type).toBe('side');
    expect(result.potResults[1].winners[0].playerId).toBe('p2');

    // Bob should get all 1100
    expect(result.totalDistributed).toBe(1100);
    const bobAfter = resultTable.players.find(p => p.id === 'p2');
    expect(bobAfter?.stack).toBe(10600); // 9500 + 1100
  });

  test('handles split pot distribution', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 9500);
    const bob = createPlayer('p2', 'Bob', 1, 9500);

    // Both have same hand
    alice.status = 'active';
    alice.totalBetInHand = 500;
    alice.holeCards = [
      { rank: 'A', suit: 'hearts' },
      { rank: 'K', suit: 'diamonds' }
    ];

    bob.status = 'active';
    bob.totalBetInHand = 500;
    bob.holeCards = [
      { rank: 'A', suit: 'clubs' },
      { rank: 'K', suit: 'spades' }
    ];

    table.players.push(alice, bob);
    table.pot = 1000;
    table.communityCards = [
      { rank: 'Q', suit: 'hearts' },
      { rank: 'J', suit: 'clubs' },
      { rank: 'T', suit: 'diamonds' },
      { rank: '9', suit: 'spades' },
      { rank: '8', suit: 'hearts' }
    ];

    const { table: resultTable, result } = distributePots(table);

    expect(result.potResults[0].wasSplit).toBe(true);
    expect(result.totalDistributed).toBe(1000);

    // Both should have 10000 (9500 + 500)
    const aliceAfter = resultTable.players.find(p => p.id === 'p1');
    const bobAfter = resultTable.players.find(p => p.id === 'p2');

    expect(aliceAfter?.stack).toBe(10000);
    expect(bobAfter?.stack).toBe(10000);
  });

  test('best hand wins only main pot when all-in for small amount', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 0); // All-in, now has 0
    const bob = createPlayer('p2', 'Bob', 1, 9500);
    const charlie = createPlayer('p3', 'Charlie', 2, 9000);

    // Alice all-in for 100, has BEST hand overall
    alice.status = 'all-in';
    alice.totalBetInHand = 100;
    alice.holeCards = [
      { rank: 'A', suit: 'hearts' },
      { rank: 'A', suit: 'diamonds' }
    ];

    // Bob bet 500, has medium hand
    bob.status = 'active';
    bob.totalBetInHand = 500;
    bob.holeCards = [
      { rank: 'K', suit: 'hearts' },
      { rank: 'K', suit: 'diamonds' }
    ];

    // Charlie bet 500, has worst hand
    charlie.status = 'active';
    charlie.totalBetInHand = 500;
    charlie.holeCards = [
      { rank: 'J', suit: 'hearts' },
      { rank: 'J', suit: 'diamonds' }
    ];

    table.players.push(alice, bob, charlie);
    table.pot = 1100;
    table.communityCards = [
      { rank: 'Q', suit: 'hearts' },
      { rank: 'Q', suit: 'diamonds' },
      { rank: 'Q', suit: 'clubs' },
      { rank: '9', suit: 'spades' },
      { rank: '8', suit: 'hearts' }
    ];

    const { table: resultTable, result } = distributePots(table);

    expect(result.potResults).toHaveLength(2);

    // Main pot (300): Alice wins with Aces full of Queens (best hand overall)
    expect(result.potResults[0].pot.type).toBe('main');
    expect(result.potResults[0].pot.amount).toBe(300);
    expect(result.potResults[0].winners[0].playerId).toBe('p1');

    // Side pot (800): Bob wins with Kings full of Queens (best eligible hand for side pot)
    expect(result.potResults[1].pot.type).toBe('side');
    expect(result.potResults[1].pot.amount).toBe(800);
    expect(result.potResults[1].winners[0].playerId).toBe('p2');

    // Verify final stacks
    expect(result.totalDistributed).toBe(1100);
    const aliceAfter = resultTable.players.find(p => p.id === 'p1');
    const bobAfter = resultTable.players.find(p => p.id === 'p2');
    const charlieAfter = resultTable.players.find(p => p.id === 'p3');

    expect(aliceAfter?.stack).toBe(300); // 0 + 300 (main pot only)
    expect(bobAfter?.stack).toBe(10300); // 9500 + 800 (side pot only)
    expect(charlieAfter?.stack).toBe(9000); // unchanged, won nothing
  });

});

describe('endHandByFold', () => {

  test('awards pot to remaining player when everyone folds', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 9500);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'folded';
    alice.totalBetInHand = 500;

    bob.status = 'active'; // Only player left
    bob.totalBetInHand = 500;

    table.players.push(alice, bob);
    table.pot = 1000;

    const { table: resultTable, result } = endHandByFold(table);

    expect(result.potResults).toHaveLength(1);
    expect(result.potResults[0].winners).toHaveLength(1);
    expect(result.potResults[0].winners[0].playerId).toBe('p2');
    expect(result.potResults[0].winners[0].amountWon).toBe(1000);
    expect(result.totalDistributed).toBe(1000);

    // Bob should now have 11000 (10000 + 1000)
    const bobAfter = resultTable.players.find(p => p.id === 'p2');
    expect(bobAfter?.stack).toBe(11000);

    // Pot cleared
    expect(resultTable.pot).toBe(0);
  });

  test('throws error if multiple players remain', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    bob.status = 'active'; // Both still in

    table.players.push(alice, bob);
    table.pot = 1000;

    expect(() => endHandByFold(table)).toThrow('Expected 1 player in hand, found 2');
  });

  test('throws error if no players remain', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'folded'; // No one left

    table.players.push(alice);
    table.pot = 1000;

    expect(() => endHandByFold(table)).toThrow('Expected 1 player in hand, found 0');
  });

});

describe('shouldEndHandByFold', () => {

  test('returns true when only 1 player remains', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'folded';
    bob.status = 'active';

    table.players.push(alice, bob);

    expect(shouldEndHandByFold(table)).toBe(true);
  });

  test('returns false when multiple players remain', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    bob.status = 'active';

    table.players.push(alice, bob);

    expect(shouldEndHandByFold(table)).toBe(false);
  });

  test('counts all-in players as in hand', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'all-in'; // Still in hand
    bob.status = 'active';

    table.players.push(alice, bob);

    expect(shouldEndHandByFold(table)).toBe(false);
  });

});

describe('shouldGoToShowdown', () => {

  test('returns true when on river with multiple players', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    bob.status = 'active';

    table.players.push(alice, bob);
    table.currentStreet = 'river';

    expect(shouldGoToShowdown(table)).toBe(true);
  });

  test('returns false when not on river', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    bob.status = 'active';

    table.players.push(alice, bob);
    table.currentStreet = 'flop';

    expect(shouldGoToShowdown(table)).toBe(false);
  });

  test('returns false when only 1 player remains', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'folded';
    bob.status = 'active';

    table.players.push(alice, bob);
    table.currentStreet = 'river';

    expect(shouldGoToShowdown(table)).toBe(false);
  });

});
