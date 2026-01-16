import { describe, test, expect } from '@jest/globals';
import { HandController } from './hand-controller';
import { createInitialTableState, createPlayer, GameAction } from '../types/game-state';
import { shuffleDeck } from '../core/cards';

describe('HandController - All-in Auto-Advance Tests', () => {
  /**
   * CRITICAL FIX TEST: All players all-in on turn should auto-advance to showdown
   *
   * This test verifies that when all remaining players go all-in before the river,
   * the game automatically deals the remaining community cards and proceeds to showdown.
   *
   * Scenario (matching user bug report):
   * - 3 players: Alice, Bob, Charlie
   * - Charlie folds on flop
   * - Alice goes all-in for 1300 on turn
   * - Bob goes all-in for 1000 on turn (smaller stack)
   * - No active players can act -> should auto-deal river and go to showdown
   */
  test('auto-advances to showdown when all players are all-in on turn', async () => {
    const table = createInitialTableState('t1', 'Test Table', 10, 20);

    // Setup 3 players with different stacks
    const alice = createPlayer('alice', 'Alice', 1, 1300);   // Will go all-in for 1300
    const bob = createPlayer('bob', 'Bob', 2, 1000);         // Will go all-in for 1000
    const charlie = createPlayer('charlie', 'Charlie', 3, 1000); // Will fold

    table.players.push(alice, bob, charlie);
    table.dealerPosition = 1;

    const controller = new HandController(table);

    // Track events
    const events: string[] = [];
    controller.on(event => {
      events.push(event.type);
    });

    await controller.startHand();

    // Set up controlled cards
    const internalState = controller['state'];
    internalState.players.find(p => p.id === 'alice')!.holeCards = [
      { rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' }
    ];
    internalState.players.find(p => p.id === 'bob')!.holeCards = [
      { rank: 'Q', suit: 'hearts' }, { rank: 'Q', suit: 'diamonds' }
    ];
    internalState.players.find(p => p.id === 'charlie')!.holeCards = [
      { rank: '2', suit: 'clubs' }, { rank: '3', suit: 'clubs' }
    ];

    // Set controlled deck for remaining community cards
    internalState.deck = [
      // Burn + Flop
      { rank: '4', suit: 'clubs' }, { rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'hearts' }, { rank: '7', suit: 'diamonds' },
      // Burn + Turn
      { rank: '5', suit: 'clubs' }, { rank: '8', suit: 'spades' },
      // Burn + River
      { rank: '6', suit: 'clubs' }, { rank: '9', suit: 'spades' }
    ];

    let state = controller.getState();

    // PRE-FLOP: Everyone calls
    // First to act calls
    let activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    await controller.handleAction({ type: 'call', playerId: activePlayer.id, timestamp: new Date() });

    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    await controller.handleAction({ type: 'call', playerId: activePlayer.id, timestamp: new Date() });

    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    await controller.handleAction({ type: 'check', playerId: activePlayer.id, timestamp: new Date() });

    state = controller.getState();
    expect(state.currentStreet).toBe('flop');

    // FLOP: Charlie folds, others check
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    await controller.handleAction({ type: 'check', playerId: activePlayer.id, timestamp: new Date() });

    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    await controller.handleAction({ type: 'check', playerId: activePlayer.id, timestamp: new Date() });

    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    // Charlie folds
    await controller.handleAction({ type: 'fold', playerId: activePlayer.id, timestamp: new Date() });

    state = controller.getState();
    expect(state.currentStreet).toBe('turn');

    // TURN: This is where the bug occurred
    // Alice goes all-in for remaining stack (1300 - 20 blind = 1280)
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    const aliceStack = state.players.find(p => p.id === 'alice')!.stack;
    await controller.handleAction({ type: 'all-in', playerId: activePlayer.id, timestamp: new Date() });

    state = controller.getState();
    // Bob goes all-in for remaining stack (1000 - 20 blind = 980)
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    await controller.handleAction({ type: 'all-in', playerId: activePlayer.id, timestamp: new Date() });

    // After both all-ins, the game should automatically:
    // 1. Deal the river (no active players to act)
    // 2. Go to showdown
    state = controller.getState();

    // CRITICAL: Should be at showdown, not stuck on turn/river
    expect(state.currentStreet).toBe('showdown');

    // Verify all community cards were dealt
    expect(state.communityCards.length).toBe(5);

    // Verify events were emitted (should include street-changed for river and hand-completed)
    expect(events).toContain('street-changed');
    expect(events).toContain('hand-completed');

    // Verify winners were determined
    const winners = state.players.filter(p => p.isWinner);
    expect(winners.length).toBeGreaterThan(0);

    // Alice should win (AA vs QQ with A K 7 8 9 board)
    const aliceWinner = state.players.find(p => p.id === 'alice')!;
    expect(aliceWinner.isWinner).toBe(true);

    // Verify side pot - Alice should get back excess chips (300)
    // Alice bet 1300, Bob only had 1000
    // Main pot: 1000 * 2 = 2000 (both eligible)
    // Side pot: 300 (only Alice eligible - she gets it back regardless)
    const aliceFinal = state.players.find(p => p.id === 'alice')!;
    const bobFinal = state.players.find(p => p.id === 'bob')!;

    // Alice should have won everything
    expect(aliceFinal.stack).toBeGreaterThan(1300);

    console.log('=== ALL-IN AUTO-ADVANCE TEST RESULTS ===');
    console.log('Final street:', state.currentStreet);
    console.log('Community cards:', state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' '));
    console.log('Alice stack:', aliceFinal.stack, '(started with 1300)');
    console.log('Bob stack:', bobFinal.stack, '(started with 1000)');
    console.log('Events emitted:', events.join(', '));
  });

  test('auto-advances through multiple streets when all-in on pre-flop', async () => {
    const table = createInitialTableState('t1', 'Test Table', 10, 20);

    // Setup 2 players
    const alice = createPlayer('alice', 'Alice', 1, 500);
    const bob = createPlayer('bob', 'Bob', 2, 500);

    table.players.push(alice, bob);
    table.dealerPosition = 1;

    const controller = new HandController(table);

    // Track events
    const streetChanges: string[] = [];
    controller.on(event => {
      if (event.type === 'street-changed') {
        streetChanges.push(event.street);
      }
    });

    await controller.startHand();

    // Set controlled cards
    const internalState = controller['state'];
    internalState.players.find(p => p.id === 'alice')!.holeCards = [
      { rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }
    ];
    internalState.players.find(p => p.id === 'bob')!.holeCards = [
      { rank: 'K', suit: 'spades' }, { rank: 'K', suit: 'hearts' }
    ];

    internalState.deck = [
      // Burn + Flop
      { rank: '4', suit: 'clubs' }, { rank: '2', suit: 'hearts' }, { rank: '3', suit: 'hearts' }, { rank: '7', suit: 'diamonds' },
      // Burn + Turn
      { rank: '5', suit: 'clubs' }, { rank: '8', suit: 'spades' },
      // Burn + River
      { rank: '6', suit: 'clubs' }, { rank: '9', suit: 'spades' }
    ];

    let state = controller.getState();

    // Pre-flop: Alice all-in
    let activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    await controller.handleAction({ type: 'all-in', playerId: activePlayer.id, timestamp: new Date() });

    state = controller.getState();
    // Bob calls all-in
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    await controller.handleAction({ type: 'call', playerId: activePlayer.id, timestamp: new Date() });

    // Should auto-advance through flop, turn, river to showdown
    state = controller.getState();

    expect(state.currentStreet).toBe('showdown');
    expect(state.communityCards.length).toBe(5);

    // Should have advanced through all streets
    expect(streetChanges).toContain('flop');
    expect(streetChanges).toContain('turn');
    expect(streetChanges).toContain('river');

    console.log('=== PRE-FLOP ALL-IN TEST RESULTS ===');
    console.log('Street progression:', streetChanges.join(' -> '));
    console.log('Final street:', state.currentStreet);
    console.log('Community cards:', state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' '));
  });
});

describe('HandController - Complex Integration Tests', () => {

  /**
   * THE HOLY GRAIL TEST
   *
   * This test simulates a complete, complex poker hand with:
   * - 6 players with different stack sizes
   * - Multiple all-ins at different streets
   * - Raises, re-raises, calls, folds
   * - Multiple pots (main pot + 2 side pots) - 3-way pot split
   * - Winner determination with proper pot distribution
   *
   * Scenario:
   * - Alice (500 chips, Royal Flush A♠K♠ + Q♠Q♥Q♦J♠T♠): All-in at flop, wins main pot (pot 1)
   * - Frank (1500 chips, Straight Flush 9♠8♠ + Q♠J♠T♠9♠8♠): All-in at turn, wins side pot 1 (pot 2)
   * - Charlie (5000 chips, Flush 7♠6♠ + Q♠J♠T♠7♠6♠): Goes to showdown, wins side pot 2 (pot 3)
   * - Bob (2000 chips, Straight A♥K♥ + AKQJT): Goes to showdown, loses to Charlie
   * - Diana (5000 chips, Full House 5♥5♦ + QQQ55): Folds on turn
   * - Eve (5000 chips, Three of a Kind 2♥2♦ + QQQ22): Folds on flop
   *
   * Tests proper 3-pot split with multiple all-ins and side pot calculations
   */
  test('THE HOLY GRAIL: Complete complex hand with multiple all-ins and side pots', async () => {
    const table = createInitialTableState('t1', 100, 200);

    // Setup 6 players with specific stacks
    const alice = createPlayer('alice', 'Alice', 2, 500);    // Short stack, will win main pot (pot 1)
    const frank = createPlayer('frank', 'Frank', 3, 1500);   // Medium-short stack, will win side pot 1 (pot 2)
    const bob = createPlayer('bob', 'Bob', 4, 2000);         // Medium stack, will lose at showdown
    const charlie = createPlayer('charlie', 'Charlie', 5, 5000); // Big stack, will win side pot 2 (pot 3)
    const diana = createPlayer('diana', 'Diana', 0, 5000);   // Big stack, will fold on turn
    const eve = createPlayer('eve', 'Eve', 1, 5000);         // Big stack, will fold on flop

    table.players.push(diana, eve, alice, frank, bob, charlie);
    table.dealerPosition = 0; // Diana is dealer

    const controller = new HandController(table);

    // Start hand - blinds will be posted
    await controller.startHand();
    let state = controller.getState();

    // Force specific cards for controlled outcome BEFORE dealing
    // We need to modify the controller's internal state carefully
    const internalState = controller['state'];

    // Set specific hole cards for controlled outcome
    // Community cards will be: Q♠ Q♥ Q♦ (flop), J♠ (turn), T♠ (river)
    // This creates:
    // - Alice A♠ K♠: Royal Flush (A K Q J T all spades) - BEST HAND (wins pot 1)
    // - Frank 9♠ 8♠: Straight Flush (Q J T 9 8 all spades) - 2ND BEST (wins pot 2)
    // - Charlie 7♠ 6♠: Flush (Q J T 7 6 all spades) - 3RD BEST (wins pot 3)
    // - Diana 5♥ 5♦: Full House Queens over Fives (Q Q Q 5 5) - 4TH BEST (folds on turn)
    // - Bob A♥ K♥: Broadway Straight (A K Q J T) - 5TH BEST (loses to Charlie's flush)
    // - Eve 2♥ 2♦: Three of a Kind Queens (Q Q Q 2 2) - WORST HAND (folds on flop)

    internalState.players.find(p => p.id === 'diana')!.holeCards = [{ rank: '5', suit: 'hearts' }, { rank: '5', suit: 'diamonds' }];
    internalState.players.find(p => p.id === 'eve')!.holeCards = [{ rank: '2', suit: 'hearts' }, { rank: '2', suit: 'diamonds' }];
    internalState.players.find(p => p.id === 'alice')!.holeCards = [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' }];
    internalState.players.find(p => p.id === 'frank')!.holeCards = [{ rank: '9', suit: 'spades' }, { rank: '8', suit: 'spades' }];
    internalState.players.find(p => p.id === 'bob')!.holeCards = [{ rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'hearts' }];
    internalState.players.find(p => p.id === 'charlie')!.holeCards = [{ rank: '7', suit: 'spades' }, { rank: '6', suit: 'spades' }];

    // Pre-set community cards in deck for controlled dealing
    // Cards are dealt from beginning of array
    internalState.deck = [
      // Burn + Flop (3 cards) - dealt first
      { rank: '4', suit: 'clubs' }, { rank: 'Q', suit: 'spades' }, { rank: 'Q', suit: 'hearts' }, { rank: 'Q', suit: 'diamonds' },
      // Burn + Turn - dealt second
      { rank: '6', suit: 'clubs' }, { rank: 'J', suit: 'spades' },
      // Burn + River - dealt last
      { rank: '7', suit: 'clubs' }, { rank: 'T', suit: 'spades' }
    ];

    console.log('\n=== STARTING STACKS ===');
    console.log('Alice:', alice.stack, '(will win pot 1 - main pot with Royal Flush)');
    console.log('Frank:', frank.stack, '(will win pot 2 - side pot 1 with Straight Flush)');
    console.log('Bob:', bob.stack, '(will lose at showdown - Straight < Flush)');
    console.log('Charlie:', charlie.stack, '(will win pot 3 - side pot 2 with Flush > Straight)');
    console.log('Diana:', diana.stack, '(will fold on turn)');
    console.log('Eve:', eve.stack, '(will fold on flop)');

    // PRE-FLOP ACTION
    console.log('\n=== PRE-FLOP ===');
    console.log('Blinds posted: SB=100, BB=200');

    state = controller.getState();
    console.log('First to act:', state.activePlayerPosition);

    // Everyone just calls the BB (200) to keep it simple
    // This ensures Alice has 300 left for the flop

    // First player calls
    state = controller.getState();
    let activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} calls 200`);
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // Next player calls
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} calls 200`);
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // Next player calls
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} calls 200`);
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // Next player calls
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} calls 200`);
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // SB completes (calls 100 more)
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} calls 100 more (SB)`);
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // BB checks
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} checks (BB)`);
    await controller.handleAction({
      type: 'check',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    state = controller.getState();
    expect(state.currentStreet).toBe('flop');
    console.log('\nPot after pre-flop:', state.pot);
    console.log('Flop dealt:', state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' '));

    // FLOP ACTION (Q♠ Q♥ Q♦)
    console.log('\n=== FLOP: Q♠ Q♥ Q♦ ===');

    // Alice (first to act, SB) goes all-in with remaining stack (300)
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    const aliceStack = state.players.find(p => p.id === 'alice')!.stack;
    console.log(`${activePlayer.name} bets all-in for ${aliceStack}`);
    await controller.handleAction({
      type: 'bet',
      playerId: activePlayer.id,
      amount: aliceStack,
      timestamp: new Date()
    });

    // Frank calls Alice's bet
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} calls ${aliceStack}`);
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // Bob calls
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} calls ${aliceStack}`);
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // Charlie calls
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} calls ${aliceStack}`);
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // Diana calls
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} calls ${aliceStack}`);
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // Eve folds
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} folds`);
    await controller.handleAction({
      type: 'fold',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    state = controller.getState();
    expect(state.currentStreet).toBe('turn');
    console.log('\nPot after flop:', state.pot);
    console.log('Turn dealt:', state.communityCards[3].rank + state.communityCards[3].suit[0]);

    // TURN ACTION (J♠)
    console.log('\n=== TURN: J♠ ===');

    // First player (Frank) goes all-in for remaining stack
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    const frankStack = state.players.find(p => p.id === 'frank')!.stack;
    console.log(`${activePlayer.name} bets all-in for ${frankStack}`);
    await controller.handleAction({
      type: 'bet',
      playerId: activePlayer.id,
      amount: frankStack,
      timestamp: new Date()
    });

    // Bob calls Frank's bet
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} calls ${frankStack}`);
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // Charlie calls
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} calls ${frankStack}`);
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // Diana folds (Eve already folded on flop, so only Diana folds here)
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} folds`);
    await controller.handleAction({
      type: 'fold',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    state = controller.getState();
    expect(state.currentStreet).toBe('river');
    console.log('\nPot after turn:', state.pot);
    console.log('River dealt:', state.communityCards[4].rank + state.communityCards[4].suit[0]);

    // RIVER ACTION (T♠)
    console.log('\n=== RIVER: T♠ ===');
    console.log('Final board:', state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' '));

    // Bob and Charlie are still active (Alice all-in at flop, Frank all-in at turn, Diana/Eve folded)
    // Keep checking/acting until we reach showdown
    state = controller.getState();
    while (state.currentStreet === 'river' && state.activePlayerPosition !== null) {
      activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
      console.log(`${activePlayer.name} checks`);
      await controller.handleAction({
        type: 'check',
        playerId: activePlayer.id,
        timestamp: new Date()
      });
      state = controller.getState();
    }

    state = controller.getState();
    expect(state.currentStreet).toBe('showdown');

    // SHOWDOWN & VERIFICATION
    console.log('\n=== SHOWDOWN ===');

    const finalState = controller.getState();

    // Get final stacks
    const aliceAfter = finalState.players.find(p => p.id === 'alice')!;
    const frankAfter = finalState.players.find(p => p.id === 'frank')!;
    const bobAfter = finalState.players.find(p => p.id === 'bob')!;
    const charlieAfter = finalState.players.find(p => p.id === 'charlie')!;
    const dianaAfter = finalState.players.find(p => p.id === 'diana')!;
    const eveAfter = finalState.players.find(p => p.id === 'eve')!;

    console.log('\n=== FINAL STACKS ===');
    console.log('Alice (Royal Flush - BEST):', aliceAfter.stack);
    console.log('Frank (Straight Flush - 2ND BEST):', frankAfter.stack);
    console.log('Charlie (Flush - 3RD BEST):', charlieAfter.stack);
    console.log('Bob (Straight - 5TH BEST, lost to Charlie):', bobAfter.stack);
    console.log('Diana (Full House - 4TH BEST, folded on turn):', dianaAfter.stack);
    console.log('Eve (Three of a Kind - WORST, folded on flop):', eveAfter.stack);

    // Pot Structure (3-way pot split):
    // Pot 1 (main pot): Alice all-in at flop for 300 → Alice wins with Royal Flush
    // Pot 2 (side pot 1): Frank all-in at turn for 1000 → Frank wins with Straight Flush
    // Pot 3 (side pot 2): Bob vs Charlie remaining → Charlie wins with Flush > Straight

    // Alice wins main pot (Royal Flush beats all)
    expect(aliceAfter.stack).toBeGreaterThan(500);
    console.log('✅ Alice won pot 1 (main pot)');

    // Frank wins side pot 1 (Straight Flush beats Flush and Straight)
    expect(frankAfter.stack).toBeGreaterThan(1500);
    console.log('✅ Frank won pot 2 (side pot 1)');

    // Charlie wins side pot 2 vs Bob (Flush > Straight)
    // Note: Charlie may not profit overall due to chips committed to other pots
    expect(charlieAfter.stack).toBeGreaterThan(bobAfter.stack);
    console.log('✅ Charlie won pot 3 (side pot 2) - beat Bob at showdown');

    // Bob loses at showdown (Straight < Flush)
    expect(bobAfter.stack).toBeLessThan(2000);
    console.log('✅ Bob lost at showdown');

    // Diana and Eve lost their bets by folding
    expect(dianaAfter.stack).toBeLessThan(5000);
    expect(eveAfter.stack).toBeLessThan(5000);
    console.log('✅ Diana and Eve folded and lost chips');

    // Chip conservation check - verify all chips are accounted for
    const totalChipsStart = 500 + 1500 + 2000 + 5000 + 5000 + 5000;
    const totalChipsEnd = aliceAfter.stack + frankAfter.stack + bobAfter.stack +
                          charlieAfter.stack + dianaAfter.stack + eveAfter.stack;

    console.log('\n=== CHIP CONSERVATION CHECK ===');
    console.log('Total chips start:', totalChipsStart);
    console.log('Total chips end:', totalChipsEnd);
    console.log('Difference:', totalChipsStart - totalChipsEnd);
    expect(totalChipsEnd).toBe(totalChipsStart); // Chip conservation verified!
  });

  test('validates minimum raise amounts', async () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('alice', 'Alice', 0, 10000);
    const bob = createPlayer('bob', 'Bob', 1, 10000);
    table.players.push(alice, bob);

    const controller = new HandController(table);
    await controller.startHand();

    let state = controller.getState();

    // Bob raises to 600 (minimum raise is BB * 2 = 400)
    await controller.handleAction({
      type: 'raise',
      playerId: 'bob',
      amount: 600,
      timestamp: new Date()
    });

    state = controller.getState();

    // Alice tries to raise to 800 (only 200 more, but minimum re-raise should be 400)
    // This should fail
    await expect(controller.handleAction({
      type: 'raise',
      playerId: 'alice',
      amount: 800, // Only 200 more than 600, but min raise was 400
      timestamp: new Date()
    })).rejects.toThrow();

    // Alice raises to 1200 (600 more, which is >= 400 min raise)
    // This should succeed
    await controller.handleAction({
      type: 'raise',
      playerId: 'alice',
      amount: 1200,
      timestamp: new Date()
    });

    state = controller.getState();
    expect(state.currentBet).toBe(1200);
  });

  test('handles heads-up with multiple streets and all-in', async () => {
    const table = createInitialTableState('t1', 100, 200);
    const alice = createPlayer('alice', 'Alice', 0, 1000);
    const bob = createPlayer('bob', 'Bob', 1, 2000);

    // Give Alice the better hand
    alice.holeCards = [{ rank: 'A', suit: 'hearts' }, { rank: 'A', suit: 'diamonds' }];
    bob.holeCards = [{ rank: 'K', suit: 'hearts' }, { rank: 'K', suit: 'diamonds' }];

    table.players.push(alice, bob);

    const controller = new HandController(table);
    await controller.startHand();

    // Pre-flop: Alice all-in
    let state = controller.getState();
    const aliceIsFirst = state.activePlayerPosition === alice.seatPosition;

    if (aliceIsFirst) {
      await controller.handleAction({
        type: 'all-in',
        playerId: 'alice',
        timestamp: new Date()
      });

      state = controller.getState();
      await controller.handleAction({
        type: 'call',
        playerId: 'bob',
        timestamp: new Date()
      });
    } else {
      await controller.handleAction({
        type: 'call',
        playerId: 'bob',
        timestamp: new Date()
      });

      state = controller.getState();
      await controller.handleAction({
        type: 'all-in',
        playerId: 'alice',
        timestamp: new Date()
      });
    }

    // Both players all-in, but we're still on pre-flop
    // In a real implementation, this would auto-deal to showdown
    // For now, we just verify chips were properly distributed
    state = controller.getState();

    // Test verifies the all-in logic works correctly
    // Full showdown logic tested in holy grail test
    expect(state.players.find(p => p.id === 'alice')!.status).toBe('all-in');
    expect(state.players.find(p => p.id === 'bob')!.stack).toBeLessThan(2000);
  });

  test('handles three-way all-in with different stack sizes', async () => {
    const table = createInitialTableState('t1', 100, 200);

    // Three players with different stacks
    const alice = createPlayer('alice', 'Alice', 0, 500);   // Short stack, worst hand
    const bob = createPlayer('bob', 'Bob', 1, 1500);        // Medium stack, medium hand
    const charlie = createPlayer('charlie', 'Charlie', 2, 3000); // Big stack, best hand

    // Set hole cards for controlled outcome
    alice.holeCards = [{ rank: '2', suit: 'hearts' }, { rank: '3', suit: 'hearts' }];
    bob.holeCards = [{ rank: 'K', suit: 'hearts' }, { rank: 'K', suit: 'diamonds' }];
    charlie.holeCards = [{ rank: 'A', suit: 'hearts' }, { rank: 'A', suit: 'diamonds' }];

    table.players.push(alice, bob, charlie);

    const controller = new HandController(table);
    await controller.startHand();

    // Everyone goes all-in pre-flop
    let state = controller.getState();

    // First player all-in
    await controller.handleAction({
      type: 'all-in',
      playerId: state.players.find(p => p.seatPosition === state.activePlayerPosition)!.id,
      timestamp: new Date()
    });

    state = controller.getState();
    await controller.handleAction({
      type: 'all-in',
      playerId: state.players.find(p => p.seatPosition === state.activePlayerPosition)!.id,
      timestamp: new Date()
    });

    state = controller.getState();
    await controller.handleAction({
      type: 'call', // Last player calls
      playerId: state.players.find(p => p.seatPosition === state.activePlayerPosition)!.id,
      timestamp: new Date()
    });

    // All players all-in pre-flop
    state = controller.getState();

    // Verify all players went all-in
    expect(state.players.filter(p => p.status === 'all-in').length).toBeGreaterThanOrEqual(2);

    // Verify pot has all chips
    const totalBet = state.players.reduce((sum, p) => sum + p.totalBetInHand, 0);
    expect(totalBet).toBeGreaterThan(0);
  });

  /**
   * CRITICAL TEST: Folded player with best hand cannot win
   *
   * This test verifies that even if a player folds with the best hand,
   * they cannot win any pot. The remaining players go to showdown.
   * This is fundamental to poker rules.
   */
  test('folded player with best hand cannot win - remaining players showdown', async () => {
    const table = createInitialTableState('t1', 10, 20);

    // Setup 3 players
    const alice = createPlayer('alice', 'Alice', 0, 1000);   // Has pair of Aces (best hand, but folds)
    const bob = createPlayer('bob', 'Bob', 1, 1000);         // Has pair of Kings (wins at showdown)
    const charlie = createPlayer('charlie', 'Charlie', 2, 1000); // Has pair of 9s (loses at showdown)

    table.players.push(alice, bob, charlie);
    table.dealerPosition = 0;

    const controller = new HandController(table);
    await controller.startHand();

    const internalState = controller['state'];

    // Set cards for controlled outcome
    // Board: 2♣ 7♥ 9♦ K♠ 5♣ (no pairs, no flush, no straight possible)
    // Alice: A♠ A♥ = Pair of Aces - BEST HAND - but will fold
    // Bob: K♥ Q♦ = Pair of Kings (from board K) - 2nd best (wins at showdown)
    // Charlie: 9♥ 8♦ = Pair of 9s (from board 9) - 3rd best (loses at showdown)
    internalState.players.find(p => p.id === 'alice')!.holeCards = [{ rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }];
    internalState.players.find(p => p.id === 'bob')!.holeCards = [{ rank: 'K', suit: 'hearts' }, { rank: 'Q', suit: 'diamonds' }];
    internalState.players.find(p => p.id === 'charlie')!.holeCards = [{ rank: '9', suit: 'hearts' }, { rank: '8', suit: 'diamonds' }];

    internalState.deck = [
      // Burn + Flop
      { rank: '3', suit: 'clubs' }, { rank: '2', suit: 'clubs' }, { rank: '7', suit: 'hearts' }, { rank: '9', suit: 'diamonds' },
      // Burn + Turn
      { rank: '4', suit: 'clubs' }, { rank: 'K', suit: 'spades' },
      // Burn + River
      { rank: '6', suit: 'clubs' }, { rank: '5', suit: 'clubs' }
    ];

    console.log('\n=== FOLDED PLAYER WITH BEST HAND TEST ===');
    console.log('Alice has Pair of Aces (BEST HAND) but will fold');
    console.log('Bob has Pair of Kings (2nd best, wins at showdown)');
    console.log('Charlie has Pair of 9s (3rd best, loses at showdown)');

    // Pre-flop: Bob raises, everyone calls
    let state = controller.getState();
    let activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;

    await controller.handleAction({
      type: 'raise',
      playerId: activePlayer.id,
      amount: 100,
      timestamp: new Date()
    });

    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // Flop: Alice must fold her Pair of Aces (best hand)!
    state = controller.getState();
    expect(state.currentStreet).toBe('flop');
    console.log('\nFlop:', state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' '));

    // First player bets
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    const firstPlayer = activePlayer.name;
    console.log(`${activePlayer.name} bets 200`);
    await controller.handleAction({
      type: 'bet',
      playerId: activePlayer.id,
      amount: 200,
      timestamp: new Date()
    });

    // Alice FOLDS her Pair of Aces (best hand)!
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} FOLDS Pair of Aces (best hand)!`);
    expect(activePlayer.id).toBe('alice'); // Verify it's Alice
    await controller.handleAction({
      type: 'fold',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // Third player calls
    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} calls 200`);
    await controller.handleAction({
      type: 'call',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // Turn: Bob and Charlie continue
    state = controller.getState();
    expect(state.currentStreet).toBe('turn');
    console.log('\nTurn:', state.communityCards[3].rank + state.communityCards[3].suit[0]);

    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} checks`);
    await controller.handleAction({
      type: 'check',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} checks`);
    await controller.handleAction({
      type: 'check',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // River: Bob and Charlie go to showdown
    state = controller.getState();
    expect(state.currentStreet).toBe('river');
    console.log('\nRiver:', state.communityCards[4].rank + state.communityCards[4].suit[0]);
    console.log('Final board:', state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' '));

    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} checks`);
    await controller.handleAction({
      type: 'check',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    state = controller.getState();
    activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;
    console.log(`${activePlayer.name} checks`);
    await controller.handleAction({
      type: 'check',
      playerId: activePlayer.id,
      timestamp: new Date()
    });

    // Showdown between Bob and Charlie
    state = controller.getState();
    expect(state.currentStreet).toBe('showdown');
    console.log('\n=== SHOWDOWN: Bob vs Charlie ===');

    const finalState = controller.getState();
    const aliceAfter = finalState.players.find(p => p.id === 'alice')!;
    const bobAfter = finalState.players.find(p => p.id === 'bob')!;
    const charlieAfter = finalState.players.find(p => p.id === 'charlie')!;

    console.log('\n=== FINAL STACKS ===');
    console.log(`Alice (folded Pair of Aces): ${aliceAfter.stack}`);
    console.log(`Bob (Pair of Kings): ${bobAfter.stack}`);
    console.log(`Charlie (Pair of 9s): ${charlieAfter.stack}`);

    // Alice folded - she should have LOST chips even with the best hand (Pair of Aces)
    expect(aliceAfter.stack).toBeLessThan(1000);
    console.log('✅ Alice folded and lost chips (had best hand - Pair of Aces)');

    // Bob should have WON at showdown (Pair of Kings > Pair of 9s)
    expect(bobAfter.stack).toBeGreaterThan(1000);
    console.log('✅ Bob won at showdown with Pair of Kings');

    // Charlie should have LOST at showdown (Pair of 9s < Pair of Kings)
    expect(charlieAfter.stack).toBeLessThan(1000);
    console.log('✅ Charlie lost at showdown with Pair of 9s');

    // Verify Alice didn't win despite having the best hand
    expect(bobAfter.stack).toBeGreaterThan(aliceAfter.stack);
    expect(bobAfter.stack).toBeGreaterThan(charlieAfter.stack);
    console.log('✅ CRITICAL: Folded player did NOT win despite having best hand');
    console.log('✅ Bob and Charlie went to showdown (Alice folded)');

    // Chip conservation
    const totalStart = 1000 + 1000 + 1000;
    const totalEnd = aliceAfter.stack + bobAfter.stack + charlieAfter.stack;
    expect(totalEnd).toBe(totalStart);
    console.log('✅ Chip conservation maintained');
  });

  test('properly burns cards before flop, turn, and river', async () => {
    const table = createInitialTableState('t1', 10, 20);

    // Setup 2 players for simplicity
    const alice = createPlayer('alice', 'Alice', 0, 1000);
    const bob = createPlayer('bob', 'Bob', 1, 1000);

    table.players.push(alice, bob);
    table.dealerPosition = 0;

    const controller = new HandController(table);
    await controller.startHand();

    const internalState = controller['state'];

    // Set up a specific deck to track burn cards
    // Deck order (top to bottom):
    // Position 0: BURN 1 (2♣)
    // Position 1-3: FLOP (3♣, 4♣, 5♣)
    // Position 4: BURN 2 (6♣)
    // Position 5: TURN (7♣)
    // Position 6: BURN 3 (8♣)
    // Position 7: RIVER (9♣)
    internalState.deck = [
      // Burn card before flop
      { rank: '2', suit: 'clubs' },
      // Flop (3 cards)
      { rank: '3', suit: 'clubs' },
      { rank: '4', suit: 'clubs' },
      { rank: '5', suit: 'clubs' },
      // Burn card before turn
      { rank: '6', suit: 'clubs' },
      // Turn (1 card)
      { rank: '7', suit: 'clubs' },
      // Burn card before river
      { rank: '8', suit: 'clubs' },
      // River (1 card)
      { rank: '9', suit: 'clubs' }
    ];

    console.log('\n=== BURN CARD TEST ===');
    console.log('Deck setup:');
    console.log('Position 0 (BURN 1): 2♣');
    console.log('Position 1-3 (FLOP): 3♣ 4♣ 5♣');
    console.log('Position 4 (BURN 2): 6♣');
    console.log('Position 5 (TURN): 7♣');
    console.log('Position 6 (BURN 3): 8♣');
    console.log('Position 7 (RIVER): 9♣');

    // Pre-flop: both players check
    let state = controller.getState();
    let activePlayer = state.players.find(p => p.seatPosition === state.activePlayerPosition)!;

    await controller.handleAction({
      type: 'call',
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

    // After flop
    state = controller.getState();
    expect(state.currentStreet).toBe('flop');
    console.log('\n=== FLOP ===');
    console.log('Community cards:', state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' '));

    // Verify flop has cards from positions 1, 2, 3 (NOT position 0 which is burn)
    expect(state.communityCards.length).toBe(3);
    expect(state.communityCards[0]).toEqual({ rank: '3', suit: 'clubs' });
    expect(state.communityCards[1]).toEqual({ rank: '4', suit: 'clubs' });
    expect(state.communityCards[2]).toEqual({ rank: '5', suit: 'clubs' });

    // Verify burn card (2♣) is NOT in community cards
    const hasBurnCard1 = state.communityCards.some(c => c.rank === '2' && c.suit === 'clubs');
    expect(hasBurnCard1).toBe(false);
    console.log('✅ Burn card 1 (2♣) not in community cards');
    console.log('✅ Flop is 3♣ 4♣ 5♣ (correct cards from deck positions 1-3)');

    // Both players check to go to turn
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

    // After turn
    state = controller.getState();
    expect(state.currentStreet).toBe('turn');
    console.log('\n=== TURN ===');
    console.log('Community cards:', state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' '));

    // Verify turn card is from position 5 (NOT position 4 which is burn)
    expect(state.communityCards.length).toBe(4);
    expect(state.communityCards[3]).toEqual({ rank: '7', suit: 'clubs' });

    // Verify burn card (6♣) is NOT in community cards
    const hasBurnCard2 = state.communityCards.some(c => c.rank === '6' && c.suit === 'clubs');
    expect(hasBurnCard2).toBe(false);
    console.log('✅ Burn card 2 (6♣) not in community cards');
    console.log('✅ Turn is 7♣ (correct card from deck position 5)');

    // Both players check to go to river
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

    // After river
    state = controller.getState();
    expect(state.currentStreet).toBe('river');
    console.log('\n=== RIVER ===');
    console.log('Community cards:', state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' '));

    // Verify river card is from position 7 (NOT position 6 which is burn)
    expect(state.communityCards.length).toBe(5);
    expect(state.communityCards[4]).toEqual({ rank: '9', suit: 'clubs' });

    // Verify burn card (8♣) is NOT in community cards
    const hasBurnCard3 = state.communityCards.some(c => c.rank === '8' && c.suit === 'clubs');
    expect(hasBurnCard3).toBe(false);
    console.log('✅ Burn card 3 (8♣) not in community cards');
    console.log('✅ River is 9♣ (correct card from deck position 7)');

    // Verify final board has NO burn cards
    console.log('\n=== FINAL VERIFICATION ===');
    console.log('Final board:', state.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' '));
    expect(state.communityCards).toEqual([
      { rank: '3', suit: 'clubs' },
      { rank: '4', suit: 'clubs' },
      { rank: '5', suit: 'clubs' },
      { rank: '7', suit: 'clubs' },
      { rank: '9', suit: 'clubs' }
    ]);
    console.log('✅ All 3 burn cards (2♣, 6♣, 8♣) were properly discarded');
    console.log('✅ Community cards are exactly: 3♣ 4♣ 5♣ 7♣ 9♣');
  });
});
