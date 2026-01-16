# Poker State Management Refactor Plan

This document outlines a plan to refactor the poker game engine using proper state management patterns, potentially with XState.

## Current Architecture Issues

### 1. Scattered State Checks
The same conditions are checked in multiple places:
- `handInProgress` logic in `socket-server.ts`, `hand-controller.ts`
- "Enough players?" checks in socket handlers and controller
- `currentStreet === 'showdown'` checks scattered throughout

### 2. Mixed Responsibilities
- `socket-server.ts` contains game logic (player cleanup, state validation)
- `hand-controller.ts` mixes orchestration with state manipulation
- `game-manager.ts` has pure functions but they're called ad-hoc

### 3. Implicit State Transitions
- Street progression happens through chained function calls
- No clear definition of valid state transitions
- Edge cases (all-in, everyone folds) handled with patches

### 4. Player Lifecycle Complexity
- Join/leave/disconnect logic duplicated across handlers
- `isLeaving` flag managed in multiple places
- Race conditions possible between client actions

## Proposed Architecture

### State Machine Approach (XState)

```
┌─────────────────────────────────────────────────────────────────┐
│                         TABLE MACHINE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐    startHand    ┌───────────┐                   │
│   │ WAITING  │ ───────────────►│ PRE_FLOP  │                   │
│   └──────────┘                 └───────────┘                   │
│        ▲                             │                          │
│        │                             │ bettingComplete          │
│        │                             ▼                          │
│        │                       ┌───────────┐                   │
│        │                       │   FLOP    │                   │
│        │                       └───────────┘                   │
│        │                             │                          │
│        │                             │ bettingComplete          │
│        │                             ▼                          │
│        │                       ┌───────────┐                   │
│        │                       │   TURN    │                   │
│        │                       └───────────┘                   │
│        │                             │                          │
│        │                             │ bettingComplete          │
│        │                             ▼                          │
│        │                       ┌───────────┐                   │
│        │                       │   RIVER   │                   │
│        │                       └───────────┘                   │
│        │                             │                          │
│        │      resetTable             │ bettingComplete          │
│        │ ◄───────────────────────────┤                          │
│        │                             ▼                          │
│        │                       ┌───────────┐                   │
│        └───────────────────────│ SHOWDOWN  │                   │
│              countdown         └───────────┘                   │
│                                                                 │
│   Guards:                                                       │
│   - canStartHand: players >= 2, all have chips                 │
│   - bettingComplete: all players acted, bets matched           │
│   - allInShowdown: all players all-in, skip to showdown        │
│                                                                 │
│   Actions:                                                      │
│   - postBlinds, dealCards, dealCommunity, distributePots       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Benefits

1. **Explicit States** - No ambiguity about what state the game is in
2. **Valid Transitions Only** - Can't deal flop from river, can't start hand during hand
3. **Guards** - Conditions checked in one place before transitions
4. **Actions** - Side effects (dealing, pot distribution) tied to transitions
5. **Testable** - Can test state machine in isolation
6. **Visualizable** - XState has visualization tools

## Implementation Plan

### Phase 1: Setup & Core Machine
- [ ] Create new branch `refactor/xstate-game-engine`
- [ ] Install XState: `npm install xstate @xstate/react`
- [ ] Define `TableMachine` with basic states (waiting, pre-flop, flop, turn, river, showdown)
- [ ] Define context shape (players, pot, community cards, etc.)
- [ ] Implement basic transitions without actions

### Phase 2: Player Actions
- [ ] Create `PlayerActionMachine` (nested/parallel state for active player)
- [ ] Implement action validation as guards
- [ ] Handle fold, check, call, bet, raise, all-in
- [ ] Auto-advance when betting round complete

### Phase 3: Edge Cases
- [ ] All-in detection and auto-advance to showdown
- [ ] Single player remaining (win by fold)
- [ ] Side pot calculations
- [ ] Player leaving mid-hand

### Phase 4: Player Lifecycle
- [ ] Create `SeatMachine` for each seat (empty, occupied, leaving)
- [ ] Handle join/leave/disconnect uniformly
- [ ] Integrate with table machine

### Phase 5: Integration
- [ ] Replace `HandController` with machine
- [ ] Update `socket-server.ts` to send events to machine
- [ ] Update frontend to consume machine state
- [ ] Remove old game-manager functions

### Phase 6: Testing & Cleanup
- [ ] Unit tests for state machine transitions
- [ ] Integration tests for full hand scenarios
- [ ] Remove deprecated code
- [ ] Update CLAUDE.md

## File Structure (Proposed)

```
src/game/
├── machines/
│   ├── table.machine.ts      # Main table state machine
│   ├── betting.machine.ts    # Betting round logic
│   ├── seat.machine.ts       # Per-seat state
│   └── types.ts              # Machine context/event types
├── actions/
│   ├── dealing.ts            # Deal cards actions
│   ├── betting.ts            # Process bets actions
│   └── pots.ts               # Pot calculation actions
├── guards/
│   ├── canStartHand.ts
│   ├── canAct.ts
│   ├── isBettingComplete.ts
│   └── isAllInShowdown.ts
└── services/
    └── handEvaluator.ts      # Existing hand evaluation
```

## Example: Table Machine Definition

```typescript
import { createMachine, assign } from 'xstate';

export const tableMachine = createMachine({
  id: 'poker-table',
  initial: 'waiting',
  context: {
    players: [],
    deck: [],
    communityCards: [],
    pot: 0,
    currentBet: 0,
    activePlayerIndex: null,
    dealerIndex: 0,
  },
  states: {
    waiting: {
      on: {
        START_HAND: {
          target: 'preFlop',
          guard: 'canStartHand',
          actions: ['rotateDealerButton', 'shuffleDeck', 'postBlinds', 'dealHoleCards'],
        },
        PLAYER_JOIN: { actions: 'addPlayer' },
        PLAYER_LEAVE: { actions: 'removePlayer' },
      },
    },
    preFlop: {
      entry: 'setFirstToAct',
      on: {
        PLAYER_ACTION: {
          actions: 'processAction',
          guard: 'isValidAction',
        },
        BETTING_COMPLETE: [
          { target: 'showdown', guard: 'shouldSkipToShowdown' },
          { target: 'flop', actions: 'dealFlop' },
        ],
        SINGLE_PLAYER_REMAINING: {
          target: 'showdown',
          actions: 'awardPotToWinner',
        },
      },
    },
    flop: {
      entry: ['dealFlop', 'setFirstToAct'],
      on: {
        PLAYER_ACTION: {
          actions: 'processAction',
          guard: 'isValidAction',
        },
        BETTING_COMPLETE: [
          { target: 'showdown', guard: 'shouldSkipToShowdown' },
          { target: 'turn', actions: 'dealTurn' },
        ],
        SINGLE_PLAYER_REMAINING: {
          target: 'showdown',
          actions: 'awardPotToWinner',
        },
      },
    },
    // ... turn, river similar
    showdown: {
      entry: ['evaluateHands', 'distributePots'],
      after: {
        5000: { target: 'waiting', actions: 'resetForNewHand' },
      },
    },
  },
});
```

## Resources

- [XState Documentation](https://xstate.js.org/docs/)
- [XState Visualizer](https://stately.ai/viz)
- [Poker State Machine Example](https://github.com/statelyai/xstate/discussions) (search for poker examples)

## Notes

- Keep the current working version on `main`
- This refactor is a learning exercise as much as an improvement
- Consider keeping both implementations temporarily for comparison
- The machine approach will make adding features (tournaments, different game types) much easier
