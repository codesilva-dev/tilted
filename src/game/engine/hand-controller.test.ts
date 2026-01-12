import { describe, test, expect, beforeEach } from '@jest/globals';
import { HandController, HandEvent } from './hand-controller';
import { createInitialTableState, createPlayer, GameAction } from '../types/game-state';

describe('HandController', () => {
  let table: ReturnType<typeof createInitialTableState>;
  let controller: HandController;

  beforeEach(() => {
    table = createInitialTableState('t1', 100, 200);
  });

  describe('startHand', () => {
    test('initializes a new hand with proper setup', async () => {
      // Add 3 players
      const alice = createPlayer('p1', 'Alice', 0, 10000);
      const bob = createPlayer('p2', 'Bob', 1, 10000);
      const charlie = createPlayer('p3', 'Charlie', 2, 10000);
      table.players.push(alice, bob, charlie);

      controller = new HandController(table);
      const state = await controller.startHand();

      // Check hand was incremented
      expect(state.handNumber).toBe(1);

      // Check blinds were posted
      expect(state.pot).toBe(300); // SB 100 + BB 200

      // Check hole cards were dealt
      expect(state.players[0].holeCards).toHaveLength(2);
      expect(state.players[1].holeCards).toHaveLength(2);
      expect(state.players[2].holeCards).toHaveLength(2);

      // Check active player is set (first to act after BB)
      expect(state.activePlayerPosition).not.toBeNull();

      // Check all players are active
      expect(state.players.every(p => p.status === 'active')).toBe(true);
    });

    test('emits correct events during hand start', async () => {
      const alice = createPlayer('p1', 'Alice', 0, 10000);
      const bob = createPlayer('p2', 'Bob', 1, 10000);
      const charlie = createPlayer('p3', 'Charlie', 2, 10000);
      table.players.push(alice, bob, charlie);

      controller = new HandController(table);

      const events: HandEvent[] = [];
      controller.on((event) => events.push(event));

      await controller.startHand();

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('hand-started');
      expect(events[1].type).toBe('blinds-posted');
      expect(events[2].type).toBe('cards-dealt');
    });

    test('throws error with fewer than 2 players', async () => {
      const alice = createPlayer('p1', 'Alice', 0, 10000);
      table.players.push(alice);

      controller = new HandController(table);

      await expect(controller.startHand()).rejects.toThrow('Need at least 2 active players');
    });

    test('advances dealer button correctly', async () => {
      const alice = createPlayer('p1', 'Alice', 0, 10000);
      const bob = createPlayer('p2', 'Bob', 1, 10000);
      table.players.push(alice, bob);
      table.dealerPosition = 0;

      controller = new HandController(table);
      await controller.startHand();

      const state = controller.getState();
      expect(state.dealerPosition).toBe(1); // Advanced from 0 to 1
    });
  });

  describe('handleAction', () => {
    beforeEach(async () => {
      const alice = createPlayer('p1', 'Alice', 0, 10000);
      const bob = createPlayer('p2', 'Bob', 1, 10000);
      const charlie = createPlayer('p3', 'Charlie', 2, 10000);
      table.players.push(alice, bob, charlie);

      controller = new HandController(table);
      await controller.startHand();
    });

    test('processes a valid fold action', async () => {
      const state = controller.getState();
      const activePlayerId = state.players.find(p => p.seatPosition === state.activePlayerPosition)?.id;

      const action: GameAction = {
        type: 'fold',
        playerId: activePlayerId!,
        timestamp: new Date()
      };

      const newState = await controller.handleAction(action);
      const player = newState.players.find(p => p.id === activePlayerId);

      expect(player?.status).toBe('folded');
    });

    test('processes a valid call action', async () => {
      const state = controller.getState();
      const activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      const initialStack = activePlayer.stack;

      const action: GameAction = {
        type: 'call',
        playerId: activePlayer.id,
        timestamp: new Date()
      };

      const newState = await controller.handleAction(action);
      const player = newState.players.find(p => p.id === activePlayer.id)!;

      // Should have called the big blind (200)
      expect(player.stack).toBe(initialStack - 200);
      expect(player.currentBet).toBe(200);
    });

    test('processes a valid raise action', async () => {
      const state = controller.getState();
      const activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;

      const action: GameAction = {
        type: 'raise',
        playerId: activePlayer.id,
        amount: 600, // Raise to 600
        timestamp: new Date()
      };

      const newState = await controller.handleAction(action);

      expect(newState.currentBet).toBe(600);
    });

    test('throws error for invalid action', async () => {
      const state = controller.getState();
      const activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;

      // Try to check when there's a bet to call
      const action: GameAction = {
        type: 'check',
        playerId: activePlayer.id,
        timestamp: new Date()
      };

      await expect(controller.handleAction(action)).rejects.toThrow();
    });

    test('emits action-processed event', async () => {
      const events: HandEvent[] = [];
      controller.on((event) => events.push(event));

      const state = controller.getState();
      const activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;

      const action: GameAction = {
        type: 'fold',
        playerId: activePlayer.id,
        timestamp: new Date()
      };

      await controller.handleAction(action);

      const actionEvents = events.filter(e => e.type === 'action-processed');
      expect(actionEvents).toHaveLength(1);
    });
  });

  describe('complete hand flow', () => {
    test('completes a hand ending in fold', async () => {
      const alice = createPlayer('p1', 'Alice', 0, 10000);
      const bob = createPlayer('p2', 'Bob', 1, 10000);
      const charlie = createPlayer('p3', 'Charlie', 2, 10000);
      table.players.push(alice, bob, charlie);

      controller = new HandController(table);

      const events: HandEvent[] = [];
      controller.on((event) => events.push(event));

      await controller.startHand();

      // Everyone folds except one player
      let state = controller.getState();

      // First player folds
      let activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      await controller.handleAction({
        type: 'fold',
        playerId: activePlayer.id,
        timestamp: new Date()
      });

      // Second player folds
      state = controller.getState();
      activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      await controller.handleAction({
        type: 'fold',
        playerId: activePlayer.id,
        timestamp: new Date()
      });

      // Hand should be complete
      const completeEvents = events.filter(e => e.type === 'hand-completed');
      expect(completeEvents).toHaveLength(1);

      // Winner should have the pot
      state = controller.getState();
      const winner = state.players.find(p => p.status !== 'folded')!;
      expect(winner.stack).toBeGreaterThan(10000);
    });

    test('advances through all streets to showdown', async () => {
      const alice = createPlayer('p1', 'Alice', 0, 10000);
      const bob = createPlayer('p2', 'Bob', 1, 10000);
      table.players.push(alice, bob);

      controller = new HandController(table);

      const events: HandEvent[] = [];
      controller.on((event) => events.push(event));

      await controller.startHand();

      // Pre-flop: both call
      let state = controller.getState();

      // Player 1 calls
      let activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      await controller.handleAction({
        type: 'call',
        playerId: activePlayer.id,
        timestamp: new Date()
      });

      // Player 2 checks (big blind)
      state = controller.getState();
      activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      await controller.handleAction({
        type: 'check',
        playerId: activePlayer.id,
        timestamp: new Date()
      });

      // Should advance to flop
      state = controller.getState();
      expect(state.currentStreet).toBe('flop');
      expect(state.communityCards).toHaveLength(3);

      // Flop: both check
      activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      await controller.handleAction({
        type: 'check',
        playerId: activePlayer.id,
        timestamp: new Date()
      });

      state = controller.getState();
      activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      await controller.handleAction({
        type: 'check',
        playerId: activePlayer.id,
        timestamp: new Date()
      });

      // Should advance to turn
      state = controller.getState();
      expect(state.currentStreet).toBe('turn');
      expect(state.communityCards).toHaveLength(4);

      // Turn: both check
      activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      await controller.handleAction({
        type: 'check',
        playerId: activePlayer.id,
        timestamp: new Date()
      });

      state = controller.getState();
      activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      await controller.handleAction({
        type: 'check',
        playerId: activePlayer.id,
        timestamp: new Date()
      });

      // Should advance to river
      state = controller.getState();
      expect(state.currentStreet).toBe('river');
      expect(state.communityCards).toHaveLength(5);

      // River: both check
      activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      await controller.handleAction({
        type: 'check',
        playerId: activePlayer.id,
        timestamp: new Date()
      });

      state = controller.getState();
      activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      await controller.handleAction({
        type: 'check',
        playerId: activePlayer.id,
        timestamp: new Date()
      });

      // Should go to showdown
      state = controller.getState();
      expect(state.currentStreet).toBe('showdown');

      // Check hand-completed event was emitted
      const completeEvents = events.filter(e => e.type === 'hand-completed');
      expect(completeEvents).toHaveLength(1);

      // Check street-changed events
      const streetEvents = events.filter(e => e.type === 'street-changed');
      expect(streetEvents).toHaveLength(3); // flop, turn, river
    });

    test('handles all-in situation correctly', async () => {
      const alice = createPlayer('p1', 'Alice', 0, 500); // Short stack
      const bob = createPlayer('p2', 'Bob', 1, 10000);
      table.players.push(alice, bob);

      controller = new HandController(table);
      await controller.startHand();

      let state = controller.getState();

      // Alice (short stack) goes all-in
      let activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      if (activePlayer.id === alice.id) {
        await controller.handleAction({
          type: 'all-in',
          playerId: activePlayer.id,
          timestamp: new Date()
        });
      } else {
        // If Bob is first, he calls
        await controller.handleAction({
          type: 'call',
          playerId: activePlayer.id,
          timestamp: new Date()
        });

        state = controller.getState();
        activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
        await controller.handleAction({
          type: 'all-in',
          playerId: activePlayer.id,
          timestamp: new Date()
        });
      }

      state = controller.getState();
      const alicePlayer = state.players.find(p => p.id === alice.id)!;
      expect(alicePlayer.status).toBe('all-in');
      expect(alicePlayer.stack).toBe(0);
    });
  });

  describe('edge cases', () => {
    test('handles heads-up correctly (dealer is small blind)', async () => {
      const alice = createPlayer('p1', 'Alice', 0, 10000);
      const bob = createPlayer('p2', 'Bob', 1, 10000);
      table.players.push(alice, bob);
      table.dealerPosition = 0;

      controller = new HandController(table);
      await controller.startHand();

      const state = controller.getState();

      // In heads-up, dealer should be small blind
      expect(state.smallBlindPosition).toBe(state.dealerPosition);
    });

    test('maintains pot integrity through betting rounds', async () => {
      const alice = createPlayer('p1', 'Alice', 0, 10000);
      const bob = createPlayer('p2', 'Bob', 1, 10000);
      table.players.push(alice, bob);

      controller = new HandController(table);
      await controller.startHand();

      let state = controller.getState();
      const initialPot = state.pot;

      // Player 1 calls
      let activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      await controller.handleAction({
        type: 'call',
        playerId: activePlayer.id,
        timestamp: new Date()
      });

      state = controller.getState();
      expect(state.pot).toBe(initialPot + 100); // Added call amount
    });

    test('resets state correctly for new hand', async () => {
      const alice = createPlayer('p1', 'Alice', 0, 10000);
      const bob = createPlayer('p2', 'Bob', 1, 10000);
      table.players.push(alice, bob);

      controller = new HandController(table);
      await controller.startHand();

      // Simulate some actions
      let state = controller.getState();
      let activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      await controller.handleAction({
        type: 'fold',
        playerId: activePlayer.id,
        timestamp: new Date()
      });

      // Start new hand
      await controller.startHand();

      state = controller.getState();

      // Check everything is reset
      expect(state.players.every(p => p.currentBet === 0 || p.currentBet === 100 || p.currentBet === 200)).toBe(true);
      expect(state.players.every(p => p.holeCards.length === 2)).toBe(true);
      expect(state.handNumber).toBe(2);
    });
  });
});
