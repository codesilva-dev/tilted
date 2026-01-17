import { describe, test, expect } from '@jest/globals';
import {
  initializeDeck,
  dealHoleCards,
  dealFlop,
  dealTurn,
  dealRiver,
  dealNextStreet,
} from './dealing';
import { createTable } from './table-factory';
import { sitPlayer } from './seat-manager';
import { postBlinds } from './betting';
import { TableState } from '../types/game-state';

describe('dealing', () => {
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

    table.dealerPosition = 0;
    table.smallBlindPosition = 1;
    table.bigBlindPosition = 2;

    // Mark as active
    table = {
      ...table,
      seats: table.seats.map(s =>
        s.playerId ? { ...s, handStatus: 'active' as const } : s
      ),
    };

    return table;
  }

  describe('initializeDeck', () => {
    test('creates a shuffled 52-card deck', () => {
      const table = setupTable();
      const result = initializeDeck(table);

      expect(result.deck.length).toBe(52);
      expect(result.communityCards).toEqual([]);
    });

    test('deck is shuffled (not in original order)', () => {
      const table = setupTable();
      const result1 = initializeDeck(table);
      const result2 = initializeDeck(table);

      // Very unlikely to be identical if shuffled
      const deck1Str = result1.deck.map(c => `${c.rank}${c.suit}`).join('');
      const deck2Str = result2.deck.map(c => `${c.rank}${c.suit}`).join('');

      // This test has a tiny chance of failing if both decks happen to shuffle identically
      // but probability is 1/52! which is essentially zero
      expect(deck1Str).not.toBe(deck2Str);
    });
  });

  describe('dealHoleCards', () => {
    test('deals 2 cards to each active player', () => {
      let table = setupTable();
      table = initializeDeck(table);
      table = postBlinds(table);

      const result = dealHoleCards(table);

      // Each player should have 2 cards
      expect(result.seats[0].holeCards.length).toBe(2);
      expect(result.seats[1].holeCards.length).toBe(2);
      expect(result.seats[2].holeCards.length).toBe(2);

      // Deck should have 52 - 6 = 46 cards
      expect(result.deck.length).toBe(46);
    });

    test('does not deal to empty seats', () => {
      let table = setupTable();

      // Remove one player
      table = {
        ...table,
        seats: table.seats.map((s, i) =>
          i === 2 ? { ...s, playerId: null, handStatus: 'empty' as const } : s
        ),
      };

      table = initializeDeck(table);
      const result = dealHoleCards(table);

      expect(result.seats[0].holeCards.length).toBe(2);
      expect(result.seats[1].holeCards.length).toBe(2);
      expect(result.seats[2].holeCards.length).toBe(0); // Empty seat

      // Deck should have 52 - 4 = 48 cards
      expect(result.deck.length).toBe(48);
    });

    test('all dealt cards are unique', () => {
      let table = setupTable();
      table = initializeDeck(table);
      table = postBlinds(table);

      const result = dealHoleCards(table);

      const allCards = [
        ...result.seats[0].holeCards,
        ...result.seats[1].holeCards,
        ...result.seats[2].holeCards,
      ];

      const cardStrings = allCards.map(c => `${c.rank}${c.suit}`);
      const uniqueCards = new Set(cardStrings);

      expect(uniqueCards.size).toBe(6); // All 6 cards unique
    });
  });

  describe('dealFlop', () => {
    test('deals 3 community cards', () => {
      let table = setupTable();
      table = initializeDeck(table);
      table = postBlinds(table);
      table = dealHoleCards(table);
      table.currentStreet = 'pre-flop';

      const result = dealFlop(table);

      expect(result.communityCards.length).toBe(3);
      expect(result.currentStreet).toBe('flop');
      // Deck loses 4 cards (1 burn + 3 flop)
      expect(result.deck.length).toBe(table.deck.length - 4);
    });

    test('throws if not on pre-flop', () => {
      let table = setupTable();
      table.currentStreet = 'flop';

      expect(() => dealFlop(table)).toThrow('Can only deal flop from pre-flop');
    });
  });

  describe('dealTurn', () => {
    test('deals 1 community card', () => {
      let table = setupTable();
      table = initializeDeck(table);
      table.communityCards = [
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'spades' },
        { rank: 'Q', suit: 'spades' },
      ];
      table.currentStreet = 'flop';

      const result = dealTurn(table);

      expect(result.communityCards.length).toBe(4);
      expect(result.currentStreet).toBe('turn');
    });

    test('throws if not on flop', () => {
      let table = setupTable();
      table.currentStreet = 'pre-flop';

      expect(() => dealTurn(table)).toThrow('Can only deal turn from flop');
    });
  });

  describe('dealRiver', () => {
    test('deals 1 community card', () => {
      let table = setupTable();
      table = initializeDeck(table);
      table.communityCards = [
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'spades' },
        { rank: 'Q', suit: 'spades' },
        { rank: 'J', suit: 'spades' },
      ];
      table.currentStreet = 'turn';

      const result = dealRiver(table);

      expect(result.communityCards.length).toBe(5);
      expect(result.currentStreet).toBe('river');
    });

    test('throws if not on turn', () => {
      let table = setupTable();
      table.currentStreet = 'flop';

      expect(() => dealRiver(table)).toThrow('Can only deal river from turn');
    });
  });

  describe('dealNextStreet', () => {
    test('deals flop from pre-flop', () => {
      let table = setupTable();
      table = initializeDeck(table);
      table.currentStreet = 'pre-flop';

      const result = dealNextStreet(table);

      expect(result.currentStreet).toBe('flop');
      expect(result.communityCards.length).toBe(3);
    });

    test('deals turn from flop', () => {
      let table = setupTable();
      table = initializeDeck(table);
      table.communityCards = [
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'spades' },
        { rank: 'Q', suit: 'spades' },
      ];
      table.currentStreet = 'flop';

      const result = dealNextStreet(table);

      expect(result.currentStreet).toBe('turn');
      expect(result.communityCards.length).toBe(4);
    });

    test('deals river from turn', () => {
      let table = setupTable();
      table = initializeDeck(table);
      table.communityCards = [
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'spades' },
        { rank: 'Q', suit: 'spades' },
        { rank: 'J', suit: 'spades' },
      ];
      table.currentStreet = 'turn';

      const result = dealNextStreet(table);

      expect(result.currentStreet).toBe('river');
      expect(result.communityCards.length).toBe(5);
    });

    test('throws after river', () => {
      let table = setupTable();
      table.currentStreet = 'river';

      expect(() => dealNextStreet(table)).toThrow('Cannot deal after river');
    });
  });
});
