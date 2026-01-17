import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { Table, TableConfig, TableEvent } from './Table';

describe('Table', () => {
  const defaultConfig: TableConfig = {
    id: 'test-table',
    name: 'Test Table',
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 200,
    maxBuyIn: 2000,
  };

  let table: Table;

  beforeEach(() => {
    table = new Table(defaultConfig);
  });

  // ==========================================================================
  // Player Management
  // ==========================================================================

  describe('sitPlayer', () => {
    test('player can sit at empty seat', () => {
      const result = table.sitPlayer(0, 'alice', 'Alice', 500);

      expect(result.success).toBe(true);
      expect(result.events).toContainEqual({
        type: 'player-sat',
        seatPosition: 0,
        playerId: 'alice',
        playerName: 'Alice',
      });

      const seat = table.getSeat(0);
      expect(seat?.playerId).toBe('alice');
      expect(seat?.playerName).toBe('Alice');
      expect(seat?.stack).toBe(500);
      expect(seat?.handStatus).toBe('sitting-out');
    });

    test('rejects invalid seat position', () => {
      const result = table.sitPlayer(-1, 'alice', 'Alice', 500);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid seat position');

      const result2 = table.sitPlayer(10, 'alice', 'Alice', 500);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Invalid seat position');
    });

    test('rejects occupied seat', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      const result = table.sitPlayer(0, 'bob', 'Bob', 500);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Seat is occupied');
    });

    test('rejects player already seated', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      const result = table.sitPlayer(1, 'alice', 'Alice', 500);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Already seated at this table');
    });

    test('rejects buy-in below minimum', () => {
      const result = table.sitPlayer(0, 'alice', 'Alice', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Minimum buy-in is 200');
    });

    test('rejects buy-in above maximum', () => {
      const result = table.sitPlayer(0, 'alice', 'Alice', 3000);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Maximum buy-in is 2000');
    });
  });

  describe('standPlayer', () => {
    test('player can stand when no hand in progress', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      const result = table.standPlayer('alice');

      expect(result.success).toBe(true);
      expect(result.events).toContainEqual({
        type: 'player-left',
        seatPosition: 0,
        playerId: 'alice',
      });

      const seat = table.getSeat(0);
      expect(seat?.playerId).toBeNull();
      expect(seat?.handStatus).toBe('empty');
    });

    test('player leaving mid-hand abandons seat', () => {
      // Need 3 players so we can have someone leave who isn't the active player
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.sitPlayer(2, 'charlie', 'Charlie', 500);
      table.startHand();

      // Find a player who is NOT the active player
      const activePos = table.getActivePosition()!;
      const nonActivePos = activePos === 0 ? 1 : 0;
      const nonActivePlayer = table.getSeat(nonActivePos)!.playerId!;

      const result = table.standPlayer(nonActivePlayer);

      expect(result.success).toBe(true);
      expect(result.events.some(e => e.type === 'seat-abandoned')).toBe(true);

      const seat = table.getSeat(nonActivePos);
      expect(seat?.playerId).toBeNull();
      expect(seat?.handStatus).toBe('abandoned');
      // Stack remains on seat
      expect(seat!.stack).toBeGreaterThan(0);
    });

    test('active player leaving mid-hand gets auto-folded', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      const activePos = table.getActivePosition()!;
      const activeSeat = table.getSeat(activePos)!;

      const result = table.standPlayer(activeSeat.playerId!);

      expect(result.success).toBe(true);
      expect(result.events.some(e => e.type === 'seat-abandoned')).toBe(true);
      expect(result.events.some(e => e.type === 'seat-auto-folded')).toBe(true);

      // In heads-up, the hand should end
      expect(result.events.some(e => e.type === 'hand-complete')).toBe(true);

      const seat = table.getSeat(activePos);
      expect(seat?.playerId).toBeNull();
      expect(seat?.handStatus).toBe('folded'); // Auto-folded, not just abandoned
    });

    test('rejects if player not seated', () => {
      const result = table.standPlayer('nobody');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Player not seated');
    });
  });

  // ==========================================================================
  // Game Start
  // ==========================================================================

  describe('canStartHand', () => {
    test('returns false with fewer than 2 players', () => {
      expect(table.canStartHand()).toBe(false);

      table.sitPlayer(0, 'alice', 'Alice', 500);
      expect(table.canStartHand()).toBe(false);
    });

    test('returns true with 2+ players', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);

      expect(table.canStartHand()).toBe(true);
    });

    test('returns false if hand in progress', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      expect(table.canStartHand()).toBe(false);
    });
  });

  describe('startHand', () => {
    test('starts hand with 2 players', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);

      const result = table.startHand();

      expect(result.success).toBe(true);
      expect(result.events.some(e => e.type === 'hand-started')).toBe(true);
      expect(result.events.some(e => e.type === 'blinds-posted')).toBe(true);
      expect(result.events.some(e => e.type === 'cards-dealt')).toBe(true);

      const state = table.getState();
      expect(state.currentStreet).toBe('pre-flop');
      expect(state.handNumber).toBe(1);
      expect(state.pot).toBe(30); // SB + BB

      // Both players should have cards
      expect(table.getSeat(0)?.holeCards.length).toBe(2);
      expect(table.getSeat(1)?.holeCards.length).toBe(2);
    });

    test('fails if not enough players', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);

      const result = table.startHand();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not enough players');
    });

    test('fails if hand already in progress', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      const result = table.startHand();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Hand already in progress');
    });
  });

  // ==========================================================================
  // Action Processing
  // ==========================================================================

  describe('processAction - fold', () => {
    test('fold ends hand heads-up', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      const activePos = table.getActivePosition()!;
      const seat = table.getSeat(activePos)!;

      const result = table.processAction({
        type: 'fold',
        seatPosition: activePos,
        playerId: seat.playerId!,
      });

      expect(result.success).toBe(true);
      expect(result.events.some(e => e.type === 'hand-complete')).toBe(true);
      expect(table.getStreet()).toBe('showdown');
    });
  });

  describe('processAction - check', () => {
    test('check succeeds when no bet to call', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      // First player calls, second player checks
      const pos1 = table.getActivePosition()!;
      const seat1 = table.getSeat(pos1)!;
      table.processAction({ type: 'call', seatPosition: pos1, playerId: seat1.playerId! });

      const pos2 = table.getActivePosition()!;
      const seat2 = table.getSeat(pos2)!;
      const result = table.processAction({ type: 'check', seatPosition: pos2, playerId: seat2.playerId! });

      expect(result.success).toBe(true);
      // Should advance to flop
      expect(table.getStreet()).toBe('flop');
    });

    test('check fails when bet to call', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      const activePos = table.getActivePosition()!;
      const seat = table.getSeat(activePos)!;

      const result = table.processAction({
        type: 'check',
        seatPosition: activePos,
        playerId: seat.playerId!,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot check - must call or raise');
    });
  });

  describe('processAction - call', () => {
    test('call succeeds with bet to match', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      const activePos = table.getActivePosition()!;
      const seat = table.getSeat(activePos)!;
      const initialStack = seat.stack;

      const result = table.processAction({
        type: 'call',
        seatPosition: activePos,
        playerId: seat.playerId!,
      });

      expect(result.success).toBe(true);
      const newSeat = table.getSeat(activePos)!;
      expect(newSeat.stack).toBeLessThan(initialStack);
    });
  });

  describe('processAction - bet', () => {
    test('bet succeeds post-flop', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      // Advance to flop by calling
      let pos = table.getActivePosition()!;
      let seat = table.getSeat(pos)!;
      table.processAction({ type: 'call', seatPosition: pos, playerId: seat.playerId! });

      pos = table.getActivePosition()!;
      seat = table.getSeat(pos)!;
      table.processAction({ type: 'check', seatPosition: pos, playerId: seat.playerId! });

      // Now on flop, first to act can bet
      pos = table.getActivePosition()!;
      seat = table.getSeat(pos)!;

      const result = table.processAction({
        type: 'bet',
        seatPosition: pos,
        playerId: seat.playerId!,
        amount: 50,
      });

      expect(result.success).toBe(true);
      expect(table.getState().currentBet).toBe(50);
    });

    test('bet fails when there is already a bet', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      // Pre-flop always has a bet (BB)
      const pos = table.getActivePosition()!;
      const seat = table.getSeat(pos)!;

      const result = table.processAction({
        type: 'bet',
        seatPosition: pos,
        playerId: seat.playerId!,
        amount: 50,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot bet - use raise');
    });
  });

  describe('processAction - raise', () => {
    test('raise succeeds pre-flop', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      const pos = table.getActivePosition()!;
      const seat = table.getSeat(pos)!;

      const result = table.processAction({
        type: 'raise',
        seatPosition: pos,
        playerId: seat.playerId!,
        amount: 60, // Raise to 60
      });

      expect(result.success).toBe(true);
      expect(table.getState().currentBet).toBe(60);
    });

    test('raise fails below minimum raise', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      const pos = table.getActivePosition()!;
      const seat = table.getSeat(pos)!;

      // Min raise is BB + BB = 40
      const result = table.processAction({
        type: 'raise',
        seatPosition: pos,
        playerId: seat.playerId!,
        amount: 30,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Minimum raise');
    });
  });

  describe('processAction - all-in', () => {
    test('all-in succeeds and puts player all-in', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      const pos = table.getActivePosition()!;
      const seat = table.getSeat(pos)!;

      const result = table.processAction({
        type: 'all-in',
        seatPosition: pos,
        playerId: seat.playerId!,
      });

      expect(result.success).toBe(true);
      const newSeat = table.getSeat(pos)!;
      expect(newSeat.stack).toBe(0);
      expect(newSeat.handStatus).toBe('all-in');
    });
  });

  // ==========================================================================
  // Action Validation
  // ==========================================================================

  describe('processAction validation', () => {
    test('rejects action from wrong position', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      const activePos = table.getActivePosition()!;
      const wrongPos = activePos === 0 ? 1 : 0;

      const result = table.processAction({
        type: 'fold',
        seatPosition: wrongPos,
        playerId: table.getSeat(wrongPos)!.playerId!,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not your turn');
    });

    test('rejects action from wrong player', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      const activePos = table.getActivePosition()!;

      const result = table.processAction({
        type: 'fold',
        seatPosition: activePos,
        playerId: 'wrong-player',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Player does not match seat');
    });
  });

  // ==========================================================================
  // Street Advancement
  // ==========================================================================

  describe('street advancement', () => {
    test('advances through all streets to showdown', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      expect(table.getStreet()).toBe('pre-flop');

      // Pre-flop: call and check
      let pos = table.getActivePosition()!;
      let seat = table.getSeat(pos)!;
      table.processAction({ type: 'call', seatPosition: pos, playerId: seat.playerId! });

      pos = table.getActivePosition()!;
      seat = table.getSeat(pos)!;
      table.processAction({ type: 'check', seatPosition: pos, playerId: seat.playerId! });

      expect(table.getStreet()).toBe('flop');
      expect(table.getState().communityCards.length).toBe(3);

      // Flop: check check
      pos = table.getActivePosition()!;
      seat = table.getSeat(pos)!;
      table.processAction({ type: 'check', seatPosition: pos, playerId: seat.playerId! });

      pos = table.getActivePosition()!;
      seat = table.getSeat(pos)!;
      table.processAction({ type: 'check', seatPosition: pos, playerId: seat.playerId! });

      expect(table.getStreet()).toBe('turn');
      expect(table.getState().communityCards.length).toBe(4);

      // Turn: check check
      pos = table.getActivePosition()!;
      seat = table.getSeat(pos)!;
      table.processAction({ type: 'check', seatPosition: pos, playerId: seat.playerId! });

      pos = table.getActivePosition()!;
      seat = table.getSeat(pos)!;
      table.processAction({ type: 'check', seatPosition: pos, playerId: seat.playerId! });

      expect(table.getStreet()).toBe('river');
      expect(table.getState().communityCards.length).toBe(5);

      // River: check check -> showdown
      pos = table.getActivePosition()!;
      seat = table.getSeat(pos)!;
      table.processAction({ type: 'check', seatPosition: pos, playerId: seat.playerId! });

      pos = table.getActivePosition()!;
      seat = table.getSeat(pos)!;
      const result = table.processAction({ type: 'check', seatPosition: pos, playerId: seat.playerId! });

      expect(table.getStreet()).toBe('showdown');
      expect(result.events.some(e => e.type === 'hand-complete')).toBe(true);
    });
  });

  // ==========================================================================
  // All-in / Run Out Board
  // ==========================================================================

  describe('all-in run out', () => {
    test('runs out board when both players all-in', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      // Player 1 goes all-in
      let pos = table.getActivePosition()!;
      let seat = table.getSeat(pos)!;
      table.processAction({ type: 'all-in', seatPosition: pos, playerId: seat.playerId! });

      // Player 2 calls all-in
      pos = table.getActivePosition()!;
      seat = table.getSeat(pos)!;
      const result = table.processAction({ type: 'call', seatPosition: pos, playerId: seat.playerId! });

      // Should have run out the entire board
      expect(table.getStreet()).toBe('showdown');
      expect(table.getState().communityCards.length).toBe(5);
      expect(result.events.some(e => e.type === 'hand-complete')).toBe(true);
    });
  });

  // ==========================================================================
  // Abandoned Seat Handling
  // ==========================================================================

  describe('abandoned seats', () => {
    test('auto-folds abandoned seat when action reaches them', () => {
      // 3 players so we can abandon one and have action continue
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.sitPlayer(2, 'charlie', 'Charlie', 500);
      table.startHand();

      // Find the second-to-act player and abandon them
      const firstActivePos = table.getActivePosition()!;

      // Find who acts after the first active player (they will be abandoned)
      // First player acts, advancing to second player
      const firstSeat = table.getSeat(firstActivePos)!;
      table.processAction({ type: 'call', seatPosition: firstActivePos, playerId: firstSeat.playerId! });

      const secondActivePos = table.getActivePosition()!;
      const secondSeat = table.getSeat(secondActivePos)!;

      // Abandon this player while it's their turn
      const result = table.standPlayer(secondSeat.playerId!);

      // Should have auto-folded
      expect(result.events.some(e => e.type === 'seat-auto-folded')).toBe(true);

      // Hand should continue (still 2 players)
      expect(table.isHandInProgress()).toBe(true);

      // Active position should have moved to next player
      expect(table.getActivePosition()).not.toBe(secondActivePos);
    });

    test('preserves chips on abandoned seat', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      // Abandon seat 0
      table.standPlayer('alice');

      const seat = table.getSeat(0)!;
      expect(seat.playerId).toBeNull();
      // Stack should still have some value (minus any blinds posted)
      expect(seat.stack).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Event System
  // ==========================================================================

  describe('event system', () => {
    test('emits events to listeners', () => {
      const events: TableEvent[] = [];
      table.on(e => events.push(e));

      table.sitPlayer(0, 'alice', 'Alice', 500);

      expect(events).toContainEqual({
        type: 'player-sat',
        seatPosition: 0,
        playerId: 'alice',
        playerName: 'Alice',
      });
    });

    test('can unsubscribe from events', () => {
      const events: TableEvent[] = [];
      const unsubscribe = table.on(e => events.push(e));

      table.sitPlayer(0, 'alice', 'Alice', 500);
      expect(events.length).toBe(1);

      unsubscribe();
      table.sitPlayer(1, 'bob', 'Bob', 500);
      expect(events.length).toBe(1); // No new events
    });
  });

  // ==========================================================================
  // Queries
  // ==========================================================================

  describe('getAvailableSeats', () => {
    test('returns all seats initially', () => {
      const available = table.getAvailableSeats();
      expect(available.length).toBe(10);
    });

    test('excludes occupied seats', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(5, 'bob', 'Bob', 500);

      const available = table.getAvailableSeats();
      expect(available.length).toBe(8);
      expect(available).not.toContain(0);
      expect(available).not.toContain(5);
    });
  });

  describe('getSeatByPlayerId', () => {
    test('returns seat for seated player', () => {
      table.sitPlayer(3, 'alice', 'Alice', 500);

      const seat = table.getSeatByPlayerId('alice');
      expect(seat?.position).toBe(3);
      expect(seat?.playerName).toBe('Alice');
    });

    test('returns null for unknown player', () => {
      const seat = table.getSeatByPlayerId('nobody');
      expect(seat).toBeNull();
    });
  });

  // ==========================================================================
  // Multiple Hands
  // ==========================================================================

  describe('multiple hands', () => {
    test('can start new hand after previous completes', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);

      // Hand 1
      table.startHand();
      expect(table.getState().handNumber).toBe(1);

      // End hand with fold
      const pos = table.getActivePosition()!;
      const seat = table.getSeat(pos)!;
      table.processAction({ type: 'fold', seatPosition: pos, playerId: seat.playerId! });

      expect(table.getStreet()).toBe('showdown');

      // Hand 2
      const result = table.startHand();
      expect(result.success).toBe(true);
      expect(table.getState().handNumber).toBe(2);
      expect(table.getStreet()).toBe('pre-flop');
    });

    test('dealer button rotates between hands', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);

      // Hand 1
      table.startHand();
      const firstDealer = table.getState().dealerPosition;

      // End hand
      const pos = table.getActivePosition()!;
      const seat = table.getSeat(pos)!;
      table.processAction({ type: 'fold', seatPosition: pos, playerId: seat.playerId! });

      // Hand 2
      table.startHand();
      const secondDealer = table.getState().dealerPosition;

      expect(secondDealer).not.toBe(firstDealer);
    });
  });

  // ==========================================================================
  // 3+ Player Scenarios
  // ==========================================================================

  describe('3+ players', () => {
    test('handles 3-way pot', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.sitPlayer(2, 'charlie', 'Charlie', 500);

      const result = table.startHand();
      expect(result.success).toBe(true);

      const state = table.getState();
      expect(state.pot).toBe(30); // SB + BB

      // All 3 players should have cards
      expect(table.getSeat(0)?.holeCards.length).toBe(2);
      expect(table.getSeat(1)?.holeCards.length).toBe(2);
      expect(table.getSeat(2)?.holeCards.length).toBe(2);
    });

    test('one player fold keeps hand going', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.sitPlayer(2, 'charlie', 'Charlie', 500);
      table.startHand();

      // First player folds
      let pos = table.getActivePosition()!;
      let seat = table.getSeat(pos)!;
      table.processAction({ type: 'fold', seatPosition: pos, playerId: seat.playerId! });

      // Hand should continue
      expect(table.isHandInProgress()).toBe(true);
      expect(table.getStreet()).toBe('pre-flop');
    });
  });

  // ==========================================================================
  // Pot Distribution
  // ==========================================================================

  describe('pot distribution', () => {
    test('winner receives full pot after fold', () => {
      table.sitPlayer(0, 'alice', 'Alice', 500);
      table.sitPlayer(1, 'bob', 'Bob', 500);
      table.startHand();

      // Get initial stacks
      const initialAlice = table.getSeat(0)!.stack;
      const initialBob = table.getSeat(1)!.stack;
      const pot = table.getState().pot;

      // First player folds
      const pos = table.getActivePosition()!;
      const seat = table.getSeat(pos)!;
      table.processAction({ type: 'fold', seatPosition: pos, playerId: seat.playerId! });

      // Other player should have won
      const finalAlice = table.getSeat(0)!.stack;
      const finalBob = table.getSeat(1)!.stack;

      // One of them won the pot
      expect(finalAlice + finalBob).toBe(initialAlice + initialBob + pot);
    });
  });
});
