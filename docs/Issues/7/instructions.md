# Poker Game Implementation Guide

## Philosophy: Bottom-Up, Test-Driven Development

We'll build this poker game from the **inside out**, starting with pure game logic that has zero dependencies, then gradually adding layers. This approach lets you:
- **Test each piece independently** before connecting to servers/databases
- **Understand the core logic** without networking complexity
- **Build confidence** as each layer works before moving up
- **Debug easily** because failures are isolated to specific layers

Think of it like building a house: foundation → walls → roof → paint, not the other way around.

---

## The 7 Layers of Poker Implementation

```
Layer 7: Frontend UI (displays state)
Layer 6: Socket.IO Server (real-time communication)
Layer 5: Database Persistence (save/load state)
Layer 4: Game Engine (orchestrates flow)
Layer 3: State Manager (holds current game state)
Layer 2: Game Rules (poker logic)
Layer 1: Card Utilities (deck, hand evaluation)
```

We'll build **bottom to top** (1 → 7), testing each layer before moving up.

---

## Phase 1: Core Poker Logic (No Server, No Database)

**Goal:** Build testable poker utilities that work in pure JavaScript/TypeScript.

### Step 1.1: Card & Deck Utilities [x]

**File:** `src/game/core/cards.ts`

Build the foundation:
```typescript
// Card representation
type Rank = '2' | '3' | '4' | ... | 'A'
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
type Card = { rank: Rank; suit: Suit }

// Functions to implement:
- createDeck(): Card[]           // 52 cards
- shuffleDeck(deck: Card[]): Card[]
- dealCards(deck: Card[], count: number): { dealt: Card[], remaining: Card[] }
```

**Why start here?** Cards are the most basic building block. No poker game exists without them. These functions are pure (no side effects), easy to test, and have no dependencies.

**Testing:** Write tests in `src/game/core/cards.test.ts`
```typescript
test('createDeck returns 52 unique cards', () => { ... })
test('shuffleDeck randomizes order', () => { ... })
test('dealCards removes cards from deck', () => { ... })
```

### Step 1.2: Hand Evaluation

**File:** `src/game/core/hand-evaluator.ts`

Implement poker hand rankings:
```typescript
type HandRank =
  | { type: 'high-card', value: number, cards: Card[] }
  | { type: 'pair', value: number, cards: Card[] }
  | { type: 'two-pair', value: number, cards: Card[] }
  // ... up to royal flush

// Functions to implement:
- evaluateHand(cards: Card[]): HandRank
- compareHands(hand1: HandRank, hand2: HandRank): number  // -1, 0, 1
- findBestHand(holeCards: Card[], communityCards: Card[]): HandRank
```

**Why this order?** Hand evaluation is independent of game flow. You can test "does a flush beat a straight?" without dealing with blinds, betting, or players.

**Learning opportunity:** This is a great algorithm exercise. You'll learn about sorting, grouping, and pattern matching.

**Testing:** Test every hand ranking combination:
```typescript
test('identifies royal flush', () => { ... })
test('flush beats straight', () => { ... })
test('finds best 5-card combination from 7 cards', () => { ... })
```

---

## Phase 2: Game State Management

**Goal:** Model the "snapshot" of a poker game at any moment.

### Step 2.1: Type Definitions

**File:** `src/game/types/game-state.ts`

Define interfaces that match your database schema but live in memory:
```typescript
interface Player {
  id: string
  seatPosition: number
  stack: number
  holeCards: Card[]
  status: 'active' | 'folded' | 'all-in' | 'sitting-out'
  currentBet: number
  totalBet: number
}

interface TableState {
  id: string
  players: Player[]
  dealerPosition: number
  smallBlindPosition: number
  bigBlindPosition: number
  currentStreet: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
  communityCards: Card[]
  pot: number
  currentBet: number
  activePlayerPosition: number | null
  deck: Card[]
}

interface GameAction {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise'
  playerId: string
  amount?: number
  timestamp: number
}
```

**Why separate types?** These are your "contract". They define what a poker game looks like. Frontend, backend, database all use these same types.

### Step 2.2: State Manager

**File:** `src/game/state/state-manager.ts`

Create functions to manipulate state (still no game flow yet):
```typescript
class PokerGameState {
  private state: TableState

  // State queries (read-only)
  getPlayers(): Player[]
  getActivePlayer(): Player | null
  getPot(): number
  getCommunityCards(): Card[]

  // State mutations (write)
  addPlayer(player: Player): void
  removePlayer(playerId: string): void
  setPlayerBet(playerId: string, amount: number): void
  setPlayerFolded(playerId: string): void
  dealCommunityCards(cards: Card[]): void
  advanceStreet(): void

  // Validation
  canPlayerAct(playerId: string): boolean
  getValidActions(playerId: string): ActionType[]
}
```

**Why this approach?** Separates "what is the state" from "how does the state change". You can test state mutations without running a full game.

**Testing:**
```typescript
test('adding player increases player count', () => { ... })
test('folded player is not in active players', () => { ... })
test('pot increases when player bets', () => { ... })
```

---

## Phase 3: Game Rules & Action Validation

**Goal:** Enforce poker rules without running a full game.

### Step 3.1: Action Validator

**File:** `src/game/rules/action-validator.ts`

```typescript
// Can this player do this action right now?
function validateAction(
  state: TableState,
  playerId: string,
  action: GameAction
): { valid: boolean; error?: string }

// What actions can this player take?
function getAvailableActions(
  state: TableState,
  playerId: string
): ActionType[]

// How much can this player bet/raise?
function getBettingLimits(
  state: TableState,
  playerId: string
): { min: number; max: number }
```

**Why separate validation?** You can unit test "can player check when facing a bet?" without running a full game. Validation is complex and deserves focused testing.

**Edge cases to test:**
- Can't bet more than stack (all-in)
- Can't check when facing a bet
- Minimum raise = previous raise size
- Can't act out of turn

### Step 3.2: Pot Calculator

**File:** `src/game/rules/pot-calculator.ts`

```typescript
interface Pot {
  amount: number
  eligiblePlayers: string[]
  type: 'main' | 'side'
}

// Calculate main pot and side pots when players go all-in
function calculatePots(players: Player[]): Pot[]

// Distribute pots to winners
function distributePots(
  pots: Pot[],
  winners: { playerId: string; handRank: HandRank }[]
): { playerId: string; amount: number }[]
```

**Why this matters?** Side pot calculation is tricky. Getting it right in isolation prevents bugs later.

---

## Phase 4: Game Engine (The Orchestrator)

**Goal:** Run a complete hand from start to finish using all previous layers.

### Step 4.1: Hand Controller

**File:** `src/game/engine/hand-controller.ts`

This is where everything comes together:
```typescript
class HandController {
  private state: PokerGameState
  private eventEmitter: EventEmitter

  // Start a new hand
  async startHand(): Promise<void> {
    // 1. Reset player bets
    // 2. Advance dealer button
    // 3. Post blinds
    // 4. Shuffle and deal hole cards
    // 5. Emit 'hand-started' event
  }

  // Process a player action
  async handleAction(action: GameAction): Promise<void> {
    // 1. Validate action
    // 2. Update state
    // 3. Check if betting round is complete
    // 4. If complete, advance to next street or showdown
    // 5. Emit state update events
  }

  // Advance to next street (flop/turn/river)
  private async advanceStreet(): Promise<void> {
    // 1. Deal community cards
    // 2. Reset betting round
    // 3. Emit 'street-changed' event
  }

  // Handle showdown
  private async showdown(): Promise<void> {
    // 1. Evaluate all hands
    // 2. Calculate pots and winners
    // 3. Distribute winnings
    // 4. Emit 'hand-completed' event
  }
}
```

**Why EventEmitter?** Decouples game logic from networking. The engine doesn't know about Socket.IO. It just emits events like `player-acted`, `street-changed`, `hand-completed`. Later, Socket.IO will listen to these events and broadcast to clients.

**Testing:** You can now test a full hand!
```typescript
test('complete hand with one winner', async () => {
  const controller = new HandController(initialState)
  await controller.startHand()

  // Simulate actions
  await controller.handleAction({ type: 'call', playerId: 'p1' })
  await controller.handleAction({ type: 'raise', playerId: 'p2', amount: 100 })
  // ... etc

  // Assert final state
  expect(controller.getState().pot).toBe(expectedAmount)
})
```

### Step 4.2: Betting Round Manager

**File:** `src/game/engine/betting-round.ts`

Extract betting round logic:
```typescript
class BettingRound {
  // Is betting complete for this street?
  isBettingComplete(state: TableState): boolean

  // Who acts next?
  getNextActivePlayer(state: TableState): Player | null

  // Has everyone had a chance to act?
  hasActionCompletedCircle(state: TableState): boolean
}
```

**Why separate this?** Betting round completion logic is subtle:
- Everyone folded except one
- Everyone checked
- Everyone called/raised and action is back to last raiser
- Handling all-in players

---

## Phase 5: Socket.IO Server Layer

**Goal:** Expose the game engine over WebSockets.

### Step 5.1: Create Socket.IO Server

**File:** `src/server/socket-server.ts`

```typescript
// Separate from Next.js (different port, different process)
import { Server } from 'socket.io'
import { HandController } from '@/game/engine/hand-controller'

const io = new Server(3001, {
  cors: { origin: 'http://localhost:3000' }
})

// Room management
const gameRooms = new Map<string, HandController>()

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  // Client wants to join a table
  socket.on('join-table', async ({ tableId, playerId }) => {
    // Join socket room
    socket.join(tableId)

    // Get or create game controller
    let controller = gameRooms.get(tableId)
    if (!controller) {
      controller = new HandController(tableId)
      gameRooms.set(tableId, controller)
    }

    // Add player to game
    await controller.addPlayer({ id: playerId, ... })

    // Send current state to new player
    socket.emit('game-state', controller.getState())

    // Notify others
    socket.to(tableId).emit('player-joined', { playerId })
  })

  // Client takes an action
  socket.on('player-action', async ({ tableId, action }) => {
    const controller = gameRooms.get(tableId)
    if (!controller) return

    try {
      await controller.handleAction(action)
    } catch (error) {
      socket.emit('action-error', { message: error.message })
    }
  })
})
```

**Key concept:** The Socket.IO server is a **thin wrapper** around your game engine. The engine does all the work; Socket.IO just:
1. Receives client events
2. Calls engine methods
3. Broadcasts engine events to clients

### Step 5.2: Connect Engine Events to Socket.IO

```typescript
class HandController {
  constructor(tableId: string, io: Server) {
    this.tableId = tableId
    this.io = io

    // When engine emits events, broadcast to all clients in room
    this.eventEmitter.on('player-acted', (data) => {
      io.to(tableId).emit('player-acted', data)
    })

    this.eventEmitter.on('street-changed', (data) => {
      io.to(tableId).emit('street-changed', data)
    })

    this.eventEmitter.on('hand-completed', (data) => {
      io.to(tableId).emit('hand-completed', data)
    })
  }
}
```

**Why this pattern?** Keeps the engine testable. In tests, you don't pass Socket.IO; you just listen to EventEmitter. In production, Socket.IO listens to the same events.

---

## Phase 6: Database Persistence

**Goal:** Save/load game state from PostgreSQL.

### Step 6.1: Repository Pattern

**File:** `src/server/repositories/game-repository.ts`

```typescript
class GameRepository {
  constructor(private prisma: PrismaClient) {}

  // Save current game state
  async saveGameState(tableId: string, state: TableState): Promise<void> {
    await this.prisma.$transaction([
      // Update table
      this.prisma.table.update({ ... }),

      // Update seats
      this.prisma.tableSeat.updateMany({ ... }),

      // Save current hand
      this.prisma.hand.upsert({ ... }),

      // Save actions
      this.prisma.action.createMany({ ... })
    ])
  }

  // Load game state from database
  async loadGameState(tableId: string): Promise<TableState> {
    const table = await this.prisma.table.findUnique({
      where: { id: tableId },
      include: {
        seats: true,
        currentHand: {
          include: {
            players: true,
            actions: true,
            communityCards: true
          }
        }
      }
    })

    return this.mapToTableState(table)
  }
}
```

**When to persist?**
- After every action (for crash recovery)
- Or batch at end of each street (for performance)
- Or only at end of hand (simplest, but lose state on crash)

**Your choice matters:** More frequent = safer but slower. Less frequent = faster but riskier. Start with end-of-hand persistence, optimize later.

### Step 6.2: Integrate with Hand Controller

```typescript
class HandController {
  constructor(
    tableId: string,
    private repository: GameRepository
  ) {
    // Load existing state on startup
    this.state = await repository.loadGameState(tableId)
  }

  async handleAction(action: GameAction): Promise<void> {
    // ... validate and update state ...

    // Persist after each action
    await this.repository.saveGameState(this.tableId, this.state)

    // Emit events
    this.eventEmitter.emit('player-acted', ...)
  }
}
```

---

## Phase 7: Frontend Client

**Goal:** Minimal UI to visualize and test the server.

### Step 7.1: Socket.IO Client Hook

**File:** `src/app/game/[tableId]/use-game-socket.ts`

```typescript
function useGameSocket(tableId: string, playerId: string) {
  const [gameState, setGameState] = useState<TableState | null>(null)
  const socketRef = useRef<Socket>()

  useEffect(() => {
    // Connect to Socket.IO server
    const socket = io('http://localhost:3001')
    socketRef.current = socket

    // Join table
    socket.emit('join-table', { tableId, playerId })

    // Listen for state updates
    socket.on('game-state', setGameState)
    socket.on('player-acted', (data) => {
      // Update local state optimistically or wait for full state
    })

    return () => socket.disconnect()
  }, [tableId, playerId])

  const takeAction = (action: GameAction) => {
    socketRef.current?.emit('player-action', { tableId, action })
  }

  return { gameState, takeAction }
}
```

### Step 7.2: Simple Game Table UI

**File:** `src/app/game/[tableId]/page.tsx`

```tsx
export default function GameTable({ params }: { params: { tableId: string } }) {
  const { gameState, takeAction } = useGameSocket(params.tableId, 'player-1')

  if (!gameState) return <div>Loading...</div>

  return (
    <div>
      <h1>Table {params.tableId}</h1>

      {/* Community Cards */}
      <div>
        {gameState.communityCards.map(card => (
          <div key={`${card.rank}-${card.suit}`}>{card.rank}{card.suit}</div>
        ))}
      </div>

      {/* Players */}
      {gameState.players.map(player => (
        <div key={player.id}>
          {player.id}: ${player.stack} ({player.status})
        </div>
      ))}

      {/* Actions */}
      <button onClick={() => takeAction({ type: 'fold', playerId: 'player-1' })}>
        Fold
      </button>
      <button onClick={() => takeAction({ type: 'call', playerId: 'player-1' })}>
        Call
      </button>
      {/* etc */}
    </div>
  )
}
```

**Start simple!** Just text, no fancy graphics. You're testing **logic**, not design. Polish the UI after the game works.

---

## Implementation Order Summary

1. **Week 1: Core Logic**
   - [ ] Card utilities + tests
   - [ ] Hand evaluator + tests
   - [ ] Run tests in isolation (no server needed)

2. **Week 2: State & Rules**
   - [ ] Game state types
   - [ ] State manager + tests
   - [ ] Action validator + tests
   - [ ] Pot calculator + tests

3. **Week 3: Game Engine**
   - [ ] Hand controller
   - [ ] Betting round manager
   - [ ] Full hand simulation tests
   - [ ] Can play a complete hand programmatically

4. **Week 4: Server Layer**
   - [ ] Socket.IO server setup
   - [ ] Event wiring
   - [ ] Manual testing with Postman/socket.io-client CLI

5. **Week 5: Database**
   - [ ] Repository pattern
   - [ ] State persistence
   - [ ] Load/save tests

6. **Week 6: Frontend**
   - [ ] Socket.IO client hook
   - [ ] Basic table UI
   - [ ] End-to-end manual testing

---

## Testing Strategy

Each phase has different testing approaches:

**Phases 1-3 (Pure Logic):**
```bash
npm test src/game/core
npm test src/game/rules
```
- Fast unit tests
- No mocks needed
- 100% code coverage achievable

**Phase 4 (Engine):**
```bash
npm test src/game/engine
```
- Integration tests
- Mock EventEmitter listeners
- Test complete hand scenarios

**Phase 5 (Socket.IO):**
- Manual testing with multiple browser tabs
- Use socket.io-client in Node to simulate players
- Check Chrome DevTools → Network → WS for messages

**Phase 6 (Database):**
- Test with real database (or Docker PostgreSQL)
- Integration tests that start → play → crash → restart → verify state

**Phase 7 (Frontend):**
- Manual E2E testing
- Open 6+ tabs, simulate a full table

---

## Key Learning Principles

1. **Build vertically, not horizontally**
   - ❌ Don't build "all database stuff" then "all server stuff"
   - ✅ Build one feature end-to-end, then the next

2. **Test before integrating**
   - Each layer should work perfectly in isolation before connecting to the next

3. **Events over direct coupling**
   - Use EventEmitter to decouple layers
   - Makes testing and debugging easier

4. **State is immutable (ideally)**
   - Don't mutate state directly; create new state objects
   - Makes debugging easier (can log before/after)

5. **Start simple, then optimize**
   - Don't worry about performance until it's a problem
   - Readable code > clever code

---

## Common Pitfalls to Avoid

1. **Starting with Socket.IO** - You'll get tangled in async networking before the game works
2. **Skipping tests** - You'll waste hours debugging weird edge cases
3. **Putting everything in one file** - Separation of concerns is critical
4. **Making UI first** - UI makes testing harder; start with pure logic
5. **Premature optimization** - Get it working, then make it fast

---

## When You Get Stuck

Ask yourself:
1. **Can I test this without a server?** If no, you're too high in the stack. Go lower.
2. **Can I call this function and verify the output?** If no, break it into smaller functions.
3. **Do I need the database for this?** Usually no in early phases. Mock/stub it.

---

## Getting Started (Your First Session)

Let's start with Step 1.1. Create:
- `src/game/core/cards.ts` - Card type definitions and deck functions
- `src/game/core/cards.test.ts` - Tests for those functions

Run tests with:
```bash
npm test -- cards.test
```

Get those tests green, and you've built your first poker building block! 🎰

---

## Questions to Ponder

- **How will you represent a card?** Object? String? Array?
- **How will you ensure shuffling is truly random?**
- **What happens when the deck runs out?** (Shouldn't happen in Texas Hold'em, but what if?)

These small decisions ripple through the entire system. That's why we start here!
