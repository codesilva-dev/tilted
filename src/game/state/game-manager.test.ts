import { describe, test, expect } from '@jest/globals';
import {
  postBlinds,
  dealHoleCards,
  dealFlop,
  dealTurn,
  dealRiver,
  processAction,
  isBettingRoundComplete,
  advanceToNextStreet,
  resetForNextHand,
  startNewHand
} from './game-manager';
import { createInitialTableState, createPlayer, type GameAction } from '../types/game-state';
import { createDeck, shuffleDeck } from '../core/cards';

describe('postBlinds', () => {

  test('posts small blind and big blind correctly', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000); // Dealer
    const bob = createPlayer('p2', 'Bob', 1, 10000);     // Small blind
    const charlie = createPlayer('p3', 'Charlie', 2, 10000); // Big blind

    table.players.push(alice, bob, charlie);
    table.dealerPosition = 0;
    table.smallBlindPosition = 1;
    table.bigBlindPosition = 2;

    const result = postBlinds(table);

    // Check small blind
    const sbPlayer = result.players.find(p => p.id === 'p2');
    expect(sbPlayer?.stack).toBe(9900); // 10000 - 100
    expect(sbPlayer?.currentBet).toBe(100);
    expect(sbPlayer?.totalBetInHand).toBe(100);

    // Check big blind
    const bbPlayer = result.players.find(p => p.id === 'p3');
    expect(bbPlayer?.stack).toBe(9800); // 10000 - 200
    expect(bbPlayer?.currentBet).toBe(200);
    expect(bbPlayer?.totalBetInHand).toBe(200);

    // Check pot
    expect(result.pot).toBe(300); // 100 + 200
    expect(result.currentBet).toBe(200);
  });

  test('handles short stack for small blind', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 50); // Only 50 chips
    const charlie = createPlayer('p3', 'Charlie', 2, 10000);

    table.players.push(alice, bob, charlie);
    table.dealerPosition = 0;
    table.smallBlindPosition = 1;
    table.bigBlindPosition = 2;

    const result = postBlinds(table);

    const sbPlayer = result.players.find(p => p.id === 'p2');
    expect(sbPlayer?.stack).toBe(0); // All in
    expect(sbPlayer?.currentBet).toBe(50); // Could only post 50
    expect(result.pot).toBe(250); // 50 + 200
  });

  test('handles short stack for big blind', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);
    const charlie = createPlayer('p3', 'Charlie', 2, 150); // Only 150 chips

    table.players.push(alice, bob, charlie);
    table.dealerPosition = 0;
    table.smallBlindPosition = 1;
    table.bigBlindPosition = 2;

    const result = postBlinds(table);

    const bbPlayer = result.players.find(p => p.id === 'p3');
    expect(bbPlayer?.stack).toBe(0); // All in
    expect(bbPlayer?.currentBet).toBe(150); // Could only post 150
    expect(result.pot).toBe(250); // 100 + 150
    expect(result.currentBet).toBe(150); // Current bet is the BB amount
  });

});

describe('dealHoleCards', () => {

  test('deals 2 cards to each active player', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);
    const charlie = createPlayer('p3', 'Charlie', 2, 10000);

    alice.status = 'active';
    bob.status = 'active';
    charlie.status = 'active';

    table.players.push(alice, bob, charlie);
    table.deck = createDeck();

    const result = dealHoleCards(table);

    expect(result.players[0].holeCards).toHaveLength(2);
    expect(result.players[1].holeCards).toHaveLength(2);
    expect(result.players[2].holeCards).toHaveLength(2);

    // Deck should have 46 cards left (52 - 6)
    expect(result.deck).toHaveLength(46);
  });

  test('does not deal to waiting players', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    bob.status = 'waiting'; // Not active

    table.players.push(alice, bob);
    table.deck = createDeck();

    const result = dealHoleCards(table);

    expect(result.players[0].holeCards).toHaveLength(2); // Alice got cards
    expect(result.players[1].holeCards).toHaveLength(0); // Bob didn't

    // Deck should have 50 cards left (52 - 2)
    expect(result.deck).toHaveLength(50);
  });

  test('does not deal to sitting-out players', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);

    alice.status = 'sitting-out';

    table.players.push(alice);
    table.deck = createDeck();

    const result = dealHoleCards(table);

    expect(result.players[0].holeCards).toHaveLength(0);
    expect(result.deck).toHaveLength(52); // No cards dealt
  });

});

describe('dealFlop', () => {

  test('deals 3 community cards', () => {
    const table = createInitialTableState('t1', 100, 200);
    table.deck = createDeck();
    table.currentStreet = 'pre-flop';

    const result = dealFlop(table);

    expect(result.communityCards).toHaveLength(3);
    expect(result.currentStreet).toBe('flop');
    // Deck should have 48 cards left (52 - 1 burn - 3 flop)
    expect(result.deck).toHaveLength(48);
  });

  test('resets current bets for new street', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    alice.currentBet = 200;
    alice.hasActed = true;

    table.players.push(alice);
    table.deck = createDeck();
    table.currentStreet = 'pre-flop';
    table.currentBet = 200;

    const result = dealFlop(table);

    expect(result.currentBet).toBe(0);
    expect(result.players[0].currentBet).toBe(0);
    expect(result.players[0].hasActed).toBe(false);
  });

  test('throws error if not on pre-flop', () => {
    const table = createInitialTableState('t1', 100, 200);
    table.deck = createDeck();
    table.currentStreet = 'flop'; // Already on flop

    expect(() => dealFlop(table)).toThrow('Can only deal flop from pre-flop');
  });

});

describe('dealTurn', () => {

  test('deals 4th community card', () => {
    const table = createInitialTableState('t1', 100, 200);
    table.deck = createDeck();
    table.currentStreet = 'flop';
    table.communityCards = [
      { rank: 'A', suit: 'hearts' },
      { rank: 'K', suit: 'diamonds' },
      { rank: 'Q', suit: 'clubs' }
    ];

    const result = dealTurn(table);

    expect(result.communityCards).toHaveLength(4);
    expect(result.currentStreet).toBe('turn');
    // Deck should have 50 cards left (52 - 1 burn - 1 turn)
    expect(result.deck).toHaveLength(50);
  });

  test('throws error if not on flop', () => {
    const table = createInitialTableState('t1', 100, 200);
    table.deck = createDeck();
    table.currentStreet = 'pre-flop';

    expect(() => dealTurn(table)).toThrow('Can only deal turn from flop');
  });

});

describe('dealRiver', () => {

  test('deals 5th community card', () => {
    const table = createInitialTableState('t1', 100, 200);
    table.deck = createDeck();
    table.currentStreet = 'turn';
    table.communityCards = [
      { rank: 'A', suit: 'hearts' },
      { rank: 'K', suit: 'diamonds' },
      { rank: 'Q', suit: 'clubs' },
      { rank: 'J', suit: 'spades' }
    ];

    const result = dealRiver(table);

    expect(result.communityCards).toHaveLength(5);
    expect(result.currentStreet).toBe('river');
    expect(result.deck).toHaveLength(50);
  });

  test('throws error if not on turn', () => {
    const table = createInitialTableState('t1', 100, 200);
    table.deck = createDeck();
    table.currentStreet = 'flop';

    expect(() => dealRiver(table)).toThrow('Can only deal river from turn');
  });

});

describe('processAction - fold', () => {

  test('marks player as folded', () => {
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

    const result = processAction(table, action);

    const player = result.players.find(p => p.id === 'p1');
    expect(player?.status).toBe('folded');
    expect(player?.hasActed).toBe(true);
  });

});

describe('processAction - check', () => {

  test('allows check when no bet to call', () => {
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

    const result = processAction(table, action);

    const player = result.players.find(p => p.id === 'p1');
    expect(player?.hasActed).toBe(true);
    expect(player?.stack).toBe(10000); // No change
  });

  test('throws error when there is a bet to call', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    alice.status = 'active';

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200; // Someone bet

    const action: GameAction = {
      type: 'check',
      playerId: 'p1',
      timestamp: new Date()
    };

    expect(() => processAction(table, action)).toThrow('Cannot check when there is a bet to call');
  });

});

describe('processAction - call', () => {

  test('calls the current bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    alice.status = 'active';

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200;
    table.pot = 200; // Someone already bet

    const action: GameAction = {
      type: 'call',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = processAction(table, action);

    const player = result.players.find(p => p.id === 'p1');
    expect(player?.stack).toBe(9800); // 10000 - 200
    expect(player?.currentBet).toBe(200);
    expect(player?.totalBetInHand).toBe(200);
    expect(result.pot).toBe(400); // 200 + 200
  });

  test('handles partial call (all-in)', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 150); // Only 150 chips
    alice.status = 'active';

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200;
    table.pot = 200;

    const action: GameAction = {
      type: 'call',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = processAction(table, action);

    const player = result.players.find(p => p.id === 'p1');
    expect(player?.stack).toBe(0); // All in
    expect(player?.currentBet).toBe(150); // Could only call 150
    expect(player?.status).toBe('all-in');
    expect(result.pot).toBe(350); // 200 + 150
  });

  test('throws error when nothing to call', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    alice.status = 'active';

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 0; // No bet to call

    const action: GameAction = {
      type: 'call',
      playerId: 'p1',
      timestamp: new Date()
    };

    expect(() => processAction(table, action)).toThrow('Nothing to call');
  });

});

describe('processAction - bet', () => {

  test('places a bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);
    alice.status = 'active';
    bob.status = 'active';

    table.players.push(alice, bob);
    table.activePlayerPosition = 0;
    table.currentBet = 0;

    const action: GameAction = {
      type: 'bet',
      playerId: 'p1',
      amount: 500,
      timestamp: new Date()
    };

    const result = processAction(table, action);

    const player = result.players.find(p => p.id === 'p1');
    expect(player?.stack).toBe(9500); // 10000 - 500
    expect(player?.currentBet).toBe(500);
    expect(result.pot).toBe(500);
    expect(result.currentBet).toBe(500);

    // Bob should be marked as not acted
    const otherPlayer = result.players.find(p => p.id === 'p2');
    expect(otherPlayer?.hasActed).toBe(false);
  });

  test('throws error when there is already a bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    alice.status = 'active';

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200; // Already a bet

    const action: GameAction = {
      type: 'bet',
      playerId: 'p1',
      amount: 500,
      timestamp: new Date()
    };

    expect(() => processAction(table, action)).toThrow('Cannot bet when there is already a bet');
  });

});

describe('processAction - raise', () => {

  test('raises the bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);
    alice.status = 'active';
    bob.status = 'active';
    bob.hasActed = true; // Bob already acted

    table.players.push(alice, bob);
    table.activePlayerPosition = 0;
    table.currentBet = 200;
    table.pot = 200;

    const action: GameAction = {
      type: 'raise',
      playerId: 'p1',
      amount: 600, // Raise to 600 total
      timestamp: new Date()
    };

    const result = processAction(table, action);

    const player = result.players.find(p => p.id === 'p1');
    expect(player?.stack).toBe(9400); // 10000 - 600
    expect(player?.currentBet).toBe(600);
    expect(result.pot).toBe(800); // 200 + 600
    expect(result.currentBet).toBe(600);

    // Bob should be marked as not acted (needs to respond)
    const otherPlayer = result.players.find(p => p.id === 'p2');
    expect(otherPlayer?.hasActed).toBe(false);
  });

  test('throws error when no bet to raise', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    alice.status = 'active';

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 0; // No bet

    const action: GameAction = {
      type: 'raise',
      playerId: 'p1',
      amount: 600,
      timestamp: new Date()
    };

    expect(() => processAction(table, action)).toThrow('Cannot raise when there is no bet');
  });

});

describe('processAction - all-in', () => {

  test('goes all-in with entire stack', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 1000);
    alice.status = 'active';

    table.players.push(alice);
    table.activePlayerPosition = 0;
    table.currentBet = 200;

    const action: GameAction = {
      type: 'all-in',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = processAction(table, action);

    const player = result.players.find(p => p.id === 'p1');
    expect(player?.stack).toBe(0);
    expect(player?.currentBet).toBe(1000);
    expect(player?.status).toBe('all-in');
    expect(result.pot).toBe(1000);
  });

  test('all-in raises the current bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 1000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);
    alice.status = 'active';
    bob.status = 'active';
    bob.hasActed = true;

    table.players.push(alice, bob);
    table.activePlayerPosition = 0;
    table.currentBet = 200;

    const action: GameAction = {
      type: 'all-in',
      playerId: 'p1',
      timestamp: new Date()
    };

    const result = processAction(table, action);

    expect(result.currentBet).toBe(1000); // All-in raised it

    // Bob needs to respond
    const otherPlayer = result.players.find(p => p.id === 'p2');
    expect(otherPlayer?.hasActed).toBe(false);
  });

});

describe('isBettingRoundComplete', () => {

  test('returns true when all active players have acted and matched bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    alice.hasActed = true;
    alice.currentBet = 200;

    bob.status = 'active';
    bob.hasActed = true;
    bob.currentBet = 200;

    table.players.push(alice, bob);
    table.currentBet = 200;

    expect(isBettingRoundComplete(table)).toBe(true);
  });

  test('returns false when player has not acted', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    alice.hasActed = true;
    alice.currentBet = 200;

    bob.status = 'active';
    bob.hasActed = false; // Bob hasn't acted
    bob.currentBet = 0;

    table.players.push(alice, bob);
    table.currentBet = 200;

    expect(isBettingRoundComplete(table)).toBe(false);
  });

  test('returns false when player has not matched current bet', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    alice.hasActed = true;
    alice.currentBet = 200;

    bob.status = 'active';
    bob.hasActed = true;
    bob.currentBet = 100; // Bob hasn't matched

    table.players.push(alice, bob);
    table.currentBet = 200;

    expect(isBettingRoundComplete(table)).toBe(false);
  });

  test('returns true when only one player in hand', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    bob.status = 'folded'; // Bob folded

    table.players.push(alice, bob);

    expect(isBettingRoundComplete(table)).toBe(true);
  });

  test('ignores all-in players when checking if round is complete', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    alice.hasActed = true;
    alice.currentBet = 200;

    bob.status = 'all-in'; // All-in, doesn't need to act
    bob.currentBet = 150;

    table.players.push(alice, bob);
    table.currentBet = 200;

    expect(isBettingRoundComplete(table)).toBe(true);
  });

});

describe('advanceToNextStreet', () => {

  test('advances from pre-flop to flop', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    alice.status = 'active';
    alice.hasActed = true;
    alice.currentBet = 200;

    table.players.push(alice);
    table.currentStreet = 'pre-flop';
    table.currentBet = 200;

    const result = advanceToNextStreet(table);

    expect(result.currentStreet).toBe('flop');
    expect(result.currentBet).toBe(0);
    expect(result.players[0].currentBet).toBe(0);
    expect(result.players[0].hasActed).toBe(false);
  });

  test('advances through all streets', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    alice.status = 'active';
    alice.hasActed = true;

    table.players.push(alice);

    // Pre-flop -> Flop
    table.currentStreet = 'pre-flop';
    let result = advanceToNextStreet(table);
    expect(result.currentStreet).toBe('flop');

    // Flop -> Turn
    result.currentStreet = 'flop';
    result.players[0].hasActed = true;
    result = advanceToNextStreet(result);
    expect(result.currentStreet).toBe('turn');

    // Turn -> River
    result.currentStreet = 'turn';
    result.players[0].hasActed = true;
    result = advanceToNextStreet(result);
    expect(result.currentStreet).toBe('river');

    // River -> Showdown
    result.currentStreet = 'river';
    result.players[0].hasActed = true;
    result = advanceToNextStreet(result);
    expect(result.currentStreet).toBe('showdown');
  });

  test('throws error if betting not complete', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    alice.status = 'active';
    alice.hasActed = false; // Alice hasn't acted

    bob.status = 'active';
    bob.hasActed = true; // Bob has acted

    table.players.push(alice, bob);
    table.currentStreet = 'pre-flop';

    expect(() => advanceToNextStreet(table)).toThrow('betting round not complete');
  });

  test('throws error when trying to advance from showdown', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000);
    alice.status = 'active';
    alice.hasActed = true;

    table.players.push(alice);
    table.currentStreet = 'showdown';

    expect(() => advanceToNextStreet(table)).toThrow('Cannot advance from showdown');
  });

});

describe('resetForNextHand', () => {

  test('rotates dealer button', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 1, 10000);
    const bob = createPlayer('p2', 'Bob', 3, 10000);
    const charlie = createPlayer('p3', 'Charlie', 5, 10000);

    table.players.push(alice, bob, charlie);
    table.dealerPosition = 1; // Alice is dealer

    const result = resetForNextHand(table);

    expect(result.dealerPosition).toBe(3); // Rotated to Bob
    expect(result.smallBlindPosition).toBe(5); // Charlie
    expect(result.bigBlindPosition).toBe(1); // Alice (wraps around)
  });

  test('clears cards and resets pot', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 1, 10000);
    alice.holeCards = [{ rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'hearts' }];

    table.players.push(alice);
    table.communityCards = [
      { rank: 'Q', suit: 'hearts' },
      { rank: 'J', suit: 'hearts' },
      { rank: 'T', suit: 'hearts' }
    ];
    table.pot = 1000;

    const result = resetForNextHand(table);

    expect(result.players[0].holeCards).toHaveLength(0);
    expect(result.communityCards).toHaveLength(0);
    expect(result.pot).toBe(0);
  });

  test('increments hand number', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 1, 10000);
    table.players.push(alice);
    table.handNumber = 5;

    const result = resetForNextHand(table);

    expect(result.handNumber).toBe(6);
  });

  test('resets all players to waiting status', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 1, 10000);
    alice.status = 'folded';
    alice.currentBet = 200;
    alice.totalBetInHand = 500;

    table.players.push(alice);

    const result = resetForNextHand(table);

    expect(result.players[0].status).toBe('waiting');
    expect(result.players[0].currentBet).toBe(0);
    expect(result.players[0].totalBetInHand).toBe(0);
  });

});

describe('startNewHand', () => {

  test('posts blinds, deals cards, and sets first player', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 10000); // Dealer
    const bob = createPlayer('p2', 'Bob', 1, 10000);     // Small blind
    const charlie = createPlayer('p3', 'Charlie', 2, 10000); // Big blind

    table.players.push(alice, bob, charlie);
    table.dealerPosition = 0;
    table.smallBlindPosition = 1;
    table.bigBlindPosition = 2;

    const deck = shuffleDeck(createDeck());
    const result = startNewHand(table, deck);

    // Check blinds posted
    expect(result.pot).toBe(300); // 100 + 200

    // Check cards dealt
    expect(result.players[0].holeCards).toHaveLength(2);
    expect(result.players[1].holeCards).toHaveLength(2);
    expect(result.players[2].holeCards).toHaveLength(2);

    // Check first player is after big blind (wraps to dealer)
    expect(result.activePlayerPosition).toBe(0); // Alice acts first
  });

  test('marks players with no chips as sitting-out', () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('p1', 'Alice', 0, 0); // No chips
    const bob = createPlayer('p2', 'Bob', 1, 10000);

    table.players.push(alice, bob);
    table.dealerPosition = 0;
    table.smallBlindPosition = 1;
    table.bigBlindPosition = 0;

    const deck = shuffleDeck(createDeck());
    const result = startNewHand(table, deck);

    expect(result.players[0].status).toBe('sitting-out');
    expect(result.players[1].status).toBe('active');
  });

});
