import { describe, test, expect } from '@jest/globals';
import {
  createInitialTableState,
  createPlayer,
  getNextPosition,
  getPreviousPosition,
  getPositionDistance,
  isPlayerActive,
  isPlayerInHand,
  hasPlayerFolded,
  canPlayerBet,
  getSeatsInfo,
  getFirstOccupiedPosition,
  getNextOccupiedPosition,
  getPreviousOccupiedPosition,
  getNextActivePlayer,
  type Player,
  type TableState,
  type PlayerStatus
} from './game-state'
import { createDeck } from '../core/cards'

describe('createInitialTableState', () => {

    test('creates table with correct ID', () => {
        const state = createInitialTableState('table-123', 100, 200)

        expect(state.id).toBe('table-123')
    })

    test('creates table with correct blind amounts', () => {
        const state = createInitialTableState('table-123', 100, 200)

        expect(state.smallBlind).toBe(100)
        expect(state.bigBlind).toBe(200)
    })

    test('initializes with empty players array', () => {
        const state = createInitialTableState('table-123', 100, 200)

        expect(state.players).toEqual([])
        expect(state.players).toHaveLength(0)
    })

    test('initializes dealer, small blind, and big blind positions', () => {
        const state = createInitialTableState('table-123', 100, 200)

        expect(state.dealerPosition).toBe(0)
        expect(state.smallBlindPosition).toBe(1)
        expect(state.bigBlindPosition).toBe(2)
    })

    test('starts at pre-flop street', () => {
        const state = createInitialTableState('table-123', 100, 200)

        expect(state.currentStreet).toBe('pre-flop')
    })

    test('initializes with empty community cards', () => {
        const state = createInitialTableState('table-123', 100, 200)

        expect(state.communityCards).toEqual([])
        expect(state.communityCards).toHaveLength(0)
    })

    test('initializes pot and currentBet to zero', () => {
        const state = createInitialTableState('table-123', 100, 200)

        expect(state.pot).toBe(0)
        expect(state.currentBet).toBe(0)
    })

    test('initializes with null active player', () => {
        const state = createInitialTableState('table-123', 100, 200)

        expect(state.activePlayerPosition).toBeNull()
    })

    test('creates a full deck', () => {
        const state = createInitialTableState('table-123', 100, 200)

        expect(state.deck).toHaveLength(52)
    })

    test('sets hand number to 0', () => {
        const state = createInitialTableState('table-123', 100, 200)

        expect(state.handNumber).toBe(0)
    })

    test('sets handStartedAt to current date', () => {
        const before = new Date()
        const state = createInitialTableState('table-123', 100, 200)
        const after = new Date()

        expect(state.handStartedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
        expect(state.handStartedAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

})

describe('createPlayer', () => {

    test('creates player with correct ID and name', () => {
        const player = createPlayer('player-1', 'Alice', 0, 1000)

        expect(player.id).toBe('player-1')
        expect(player.name).toBe('Alice')
    })

    test('creates player with correct seat position', () => {
        const player = createPlayer('player-1', 'Alice', 5, 1000)

        expect(player.seatPosition).toBe(5)
    })

    test('creates player with correct initial stack', () => {
        const player = createPlayer('player-1', 'Alice', 0, 50000)

        expect(player.stack).toBe(50000)
    })

    test('initializes with empty hole cards', () => {
        const player = createPlayer('player-1', 'Alice', 0, 1000)

        expect(player.holeCards).toEqual([])
        expect(player.holeCards).toHaveLength(0)
    })

    test('initializes with waiting status', () => {
        const player = createPlayer('player-1', 'Alice', 0, 1000)

        expect(player.status).toBe('waiting')
    })

    test('initializes betting amounts to zero', () => {
        const player = createPlayer('player-1', 'Alice', 0, 1000)

        expect(player.currentBet).toBe(0)
        expect(player.totalBetInHand).toBe(0)
    })

    test('initializes hasActed to false', () => {
        const player = createPlayer('player-1', 'Alice', 0, 1000)

        expect(player.hasActed).toBe(false)
    })
})

describe('getNextPosition', () => {

    test('increments position by 1', () => {
        expect(getNextPosition(0, 10)).toBe(1)
        expect(getNextPosition(3, 10)).toBe(4)
        expect(getNextPosition(7, 10)).toBe(8)
    })

    test('wraps around from last seat to first', () => {
        expect(getNextPosition(9, 10)).toBe(0)
    })

    test('works with 6-seat table', () => {
        expect(getNextPosition(0, 6)).toBe(1)
        expect(getNextPosition(5, 6)).toBe(0)  // Wrap around
    })

    test('works with heads-up (2-seat)', () => {
        expect(getNextPosition(0, 2)).toBe(1)
        expect(getNextPosition(1, 2)).toBe(0)  // Wrap around
    })

})

describe('getPreviousPosition', () => {

    test('decrements position by 1', () => {
        expect(getPreviousPosition(5, 10)).toBe(4)
        expect(getPreviousPosition(3, 10)).toBe(2)
        expect(getPreviousPosition(1, 10)).toBe(0)
    })

    test('wraps around from first seat to last', () => {
        expect(getPreviousPosition(0, 10)).toBe(9)
    })

    test('works with 6-seat table', () => {
        expect(getPreviousPosition(3, 6)).toBe(2)
        expect(getPreviousPosition(0, 6)).toBe(5)  // Wrap around
    })

})

describe('getPositionDistance', () => {

    test('calculates distance moving clockwise', () => {
        // From position 0 to position 3 = 3 seats
        expect(getPositionDistance(0, 3, 10)).toBe(3)

        // From position 2 to position 7 = 5 seats
        expect(getPositionDistance(2, 7, 10)).toBe(5)
    })

    test('wraps around the table', () => {
        // From position 8 to position 1 = 3 seats (8�9�0�1)
        expect(getPositionDistance(8, 1, 10)).toBe(3)
    })

    test('distance to same position is 0', () => {
        expect(getPositionDistance(5, 5, 10)).toBe(0)
    })

    test('distance to next seat is 1', () => {
        expect(getPositionDistance(0, 1, 10)).toBe(1)
        expect(getPositionDistance(9, 0, 10)).toBe(1)  // Wrap around
    })

    test('works with 6-seat table', () => {
        expect(getPositionDistance(5, 2, 6)).toBe(3)  // 5�0�1�2
    })

})

describe('isPlayerActive', () => {

    test('returns true for active player', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'active'

        expect(isPlayerActive(player)).toBe(true)
    })

    test('returns false for waiting player', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'waiting'

        expect(isPlayerActive(player)).toBe(false)
    })

    test('returns false for folded player', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'folded'

        expect(isPlayerActive(player)).toBe(false)
    })

    test('returns false for all-in player', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'all-in'

        expect(isPlayerActive(player)).toBe(false)
    })

    test('returns false for sitting-out player', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'sitting-out'

        expect(isPlayerActive(player)).toBe(false)
    })

})

describe('isPlayerInHand', () => {
    test('returns true for active player', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'active'

        expect(isPlayerInHand(player)).toBe(true)
    })

    test('returns true for all-in player', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'all-in'

        expect(isPlayerInHand(player)).toBe(true)
    })

    test('returns false for folded player', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'folded'

        expect(isPlayerInHand(player)).toBe(false)
    })

    test('returns false for waiting player', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'waiting'

        expect(isPlayerInHand(player)).toBe(false)
    })
})

describe('hasPlayerFolded', () => {

    test('returns true for folded player', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'folded'

        expect(hasPlayerFolded(player)).toBe(true)
    })

    test('returns false for active player', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'active'

        expect(hasPlayerFolded(player)).toBe(false)
    })

    test('returns false for all-in player', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'all-in'

        expect(hasPlayerFolded(player)).toBe(false)
    })

})

describe('canPlayerBet', () => {

    test('returns true when player is active, has stack, and no current bet', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'active'

        const table = createInitialTableState('t1', 100, 200)
        table.currentBet = 0  // No one has bet yet

        expect(canPlayerBet(player, table)).toBe(true)
    })

    test('returns false when current bet is already placed', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'active'

        const table = createInitialTableState('t1', 100, 200)
        table.currentBet = 200  // Someone already bet

        expect(canPlayerBet(player, table)).toBe(false)
    })

    test('returns false when player has no chips', () => {
        const player = createPlayer('p1', 'Alice', 0, 0)  // No stack
        player.status = 'active'

        const table = createInitialTableState('t1', 100, 200)
        table.currentBet = 0

        expect(canPlayerBet(player, table)).toBe(false)
    })

    test('returns false when player is folded', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'folded'

        const table = createInitialTableState('t1', 100, 200)
        table.currentBet = 0

        expect(canPlayerBet(player, table)).toBe(false)
    })

    test('returns false when player is all-in', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'all-in'

        const table = createInitialTableState('t1', 100, 200)
        table.currentBet = 0

        expect(canPlayerBet(player, table)).toBe(false)
    })

})

describe('getSeatsInfo', () => {

    test('returns correct number of seats', () => {
        const table = createInitialTableState('t1', 100, 200)
        const seats = getSeatsInfo(table, 10)

        expect(seats).toHaveLength(10)
    })

    test('all seats are unoccupied for empty table', () => {
        const table = createInitialTableState('t1', 100, 200)
        const seats = getSeatsInfo(table, 10)

        seats.forEach(seat => {
        expect(seat.isOccupied).toBe(false)
        expect(seat.player).toBeUndefined()
        })
    })

    test('marks occupied seats correctly', () => {
        const table = createInitialTableState('t1', 100, 200)

        const player1 = createPlayer('p1', 'Alice', 2, 1000)
        const player2 = createPlayer('p2', 'Bob', 5, 1000)
        table.players.push(player1, player2)

        const seats = getSeatsInfo(table, 10)

        expect(seats[2].isOccupied).toBe(true)
        expect(seats[2].player).toEqual(player1)

        expect(seats[5].isOccupied).toBe(true)
        expect(seats[5].player).toEqual(player2)

        expect(seats[0].isOccupied).toBe(false)
        expect(seats[1].isOccupied).toBe(false)
    })

    test('works with 6-seat table', () => {
        const table = createInitialTableState('t1', 100, 200)
        const seats = getSeatsInfo(table, 6)

        expect(seats).toHaveLength(6)
    })

    test('seat positions match array indices', () => {
        const table = createInitialTableState('t1', 100, 200)
        const seats = getSeatsInfo(table, 10)

        seats.forEach((seat, index) => {
        expect(seat.position).toBe(index)
        })
    })

})

describe('Multiple Players', () => {

    test('can add multiple players to table', () => {
        const table = createInitialTableState('t1', 100, 200)

        const players = [
        createPlayer('p1', 'Alice', 0, 1000),
        createPlayer('p2', 'Bob', 1, 1000),
        createPlayer('p3', 'Charlie', 2, 1000)
        ]

        table.players.push(...players)

        expect(table.players).toHaveLength(3)
    })

    test('players maintain separate state', () => {
        const player1 = createPlayer('p1', 'Alice', 0, 1000)
        const player2 = createPlayer('p2', 'Bob', 1, 2000)

        player1.status = 'active'
        player2.status = 'folded'

        expect(player1.status).toBe('active')
        expect(player2.status).toBe('folded')
        expect(player1.stack).toBe(1000)
        expect(player2.stack).toBe(2000)
    })

})

describe('Position Wrap-Around Edge Cases', () => {

    test('handles position 9 to 0 correctly', () => {
        expect(getNextPosition(9, 10)).toBe(0)
        expect(getPreviousPosition(0, 10)).toBe(9)
    })

    test('handles full circle distance', () => {
        expect(getPositionDistance(0, 0, 10)).toBe(0)
        expect(getPositionDistance(0, 9, 10)).toBe(9)
    })

    test('handles 2-player heads-up correctly', () => {
        expect(getNextPosition(0, 2)).toBe(1)
        expect(getNextPosition(1, 2)).toBe(0)
        expect(getPreviousPosition(0, 2)).toBe(1)
        expect(getPreviousPosition(1, 2)).toBe(0)
    })

})

describe('Player Status Transitions', () => {

    test('player can transition from waiting to active', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)

        expect(player.status).toBe('waiting')

        player.status = 'active'
        expect(player.status).toBe('active')
    })

    test('player can transition from active to folded', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'active'

        player.status = 'folded'

        expect(player.status).toBe('folded')
        expect(hasPlayerFolded(player)).toBe(true)
    })

    test('player can transition from active to all-in', () => {
        const player = createPlayer('p1', 'Alice', 0, 1000)
        player.status = 'active'

        player.status = 'all-in'

        expect(player.status).toBe('all-in')
        expect(isPlayerInHand(player)).toBe(true)
        expect(isPlayerActive(player)).toBe(false)
    })

})

describe('getFirstOccupiedPosition', () => {

    test('returns null for empty players array', () => {
        expect(getFirstOccupiedPosition([])).toBeNull()
    })

    test('returns position of single player', () => {
        const players = [createPlayer('p1', 'Alice', 5, 1000)]
        expect(getFirstOccupiedPosition(players)).toBe(5)
    })

    test('returns lowest position when multiple players', () => {
        const players = [
            createPlayer('p1', 'Alice', 5, 1000),
            createPlayer('p2', 'Bob', 1, 1000),
            createPlayer('p3', 'Charlie', 8, 1000)
        ]
        expect(getFirstOccupiedPosition(players)).toBe(1)
    })

    test('works with players at sparse positions', () => {
        const players = [
            createPlayer('p1', 'Alice', 9, 1000),
            createPlayer('p2', 'Bob', 3, 1000),
            createPlayer('p3', 'Charlie', 6, 1000)
        ]
        expect(getFirstOccupiedPosition(players)).toBe(3)
    })

})

describe('getNextOccupiedPosition', () => {

    test('returns null for empty players array', () => {
        expect(getNextOccupiedPosition(0, [], 10)).toBeNull()
    })

    test('skips empty seats', () => {
        const players = [
            createPlayer('p1', 'Alice', 1, 1000),
            createPlayer('p2', 'Bob', 5, 1000)
        ]

        // From position 0, next occupied is 1
        expect(getNextOccupiedPosition(0, players, 10)).toBe(1)

        // From position 1, next occupied is 5 (skips 2, 3, 4)
        expect(getNextOccupiedPosition(1, players, 10)).toBe(5)
    })

    test('wraps around the table', () => {
        const players = [
            createPlayer('p1', 'Alice', 1, 1000),
            createPlayer('p2', 'Bob', 5, 1000)
        ]

        // From position 5, wraps to 1 (skips 6, 7, 8, 9, 0)
        expect(getNextOccupiedPosition(5, players, 10)).toBe(1)
    })

    test('works with three players at positions 1, 3, 5', () => {
        const players = [
            createPlayer('p1', 'Alice', 1, 1000),
            createPlayer('p2', 'Bob', 3, 1000),
            createPlayer('p3', 'Charlie', 5, 1000)
        ]

        expect(getNextOccupiedPosition(0, players, 10)).toBe(1)
        expect(getNextOccupiedPosition(1, players, 10)).toBe(3)
        expect(getNextOccupiedPosition(3, players, 10)).toBe(5)
        expect(getNextOccupiedPosition(5, players, 10)).toBe(1) // Wraps around
    })

    test('works with 6-seat table', () => {
        const players = [
            createPlayer('p1', 'Alice', 1, 1000),
            createPlayer('p2', 'Bob', 4, 1000)
        ]

        expect(getNextOccupiedPosition(0, players, 6)).toBe(1)
        expect(getNextOccupiedPosition(1, players, 6)).toBe(4)
        expect(getNextOccupiedPosition(4, players, 6)).toBe(1) // Wraps around
    })

})

describe('getPreviousOccupiedPosition', () => {

    test('returns null for empty players array', () => {
        expect(getPreviousOccupiedPosition(5, [], 10)).toBeNull()
    })

    test('skips empty seats going backwards', () => {
        const players = [
            createPlayer('p1', 'Alice', 1, 1000),
            createPlayer('p2', 'Bob', 5, 1000)
        ]

        // From position 6, previous occupied is 5
        expect(getPreviousOccupiedPosition(6, players, 10)).toBe(5)

        // From position 5, previous occupied is 1 (skips 4, 3, 2)
        expect(getPreviousOccupiedPosition(5, players, 10)).toBe(1)
    })

    test('wraps around backwards', () => {
        const players = [
            createPlayer('p1', 'Alice', 1, 1000),
            createPlayer('p2', 'Bob', 8, 1000)
        ]

        // From position 1, wraps backwards to 8
        expect(getPreviousOccupiedPosition(1, players, 10)).toBe(8)
    })

})

describe('getNextActivePlayer', () => {

    test('returns null for empty table', () => {
        const table = createInitialTableState('t1', 100, 200)
        expect(getNextActivePlayer(0, table)).toBeNull()
    })

    test('finds next active player skipping empty seats', () => {
        const table = createInitialTableState('t1', 100, 200)
        const alice = createPlayer('p1', 'Alice', 1, 1000)
        const bob = createPlayer('p2', 'Bob', 5, 1000)

        alice.status = 'active'
        bob.status = 'active'

        table.players.push(alice, bob)

        // From position 0, next active is Alice at position 1
        const next1 = getNextActivePlayer(0, table)
        expect(next1?.id).toBe('p1')
        expect(next1?.seatPosition).toBe(1)

        // From position 1, next active is Bob at position 5
        const next2 = getNextActivePlayer(1, table)
        expect(next2?.id).toBe('p2')
        expect(next2?.seatPosition).toBe(5)
    })

    test('skips folded players', () => {
        const table = createInitialTableState('t1', 100, 200)
        const alice = createPlayer('p1', 'Alice', 1, 1000)
        const bob = createPlayer('p2', 'Bob', 3, 1000)
        const charlie = createPlayer('p3', 'Charlie', 5, 1000)

        alice.status = 'active'
        bob.status = 'folded'  // Bob folded
        charlie.status = 'active'

        table.players.push(alice, bob, charlie)

        // From position 1, skips Bob (folded), goes to Charlie
        const next = getNextActivePlayer(1, table)
        expect(next?.id).toBe('p3')
        expect(next?.seatPosition).toBe(5)
    })

    test('skips all-in players', () => {
        const table = createInitialTableState('t1', 100, 200)
        const alice = createPlayer('p1', 'Alice', 1, 1000)
        const bob = createPlayer('p2', 'Bob', 3, 1000)
        const charlie = createPlayer('p3', 'Charlie', 5, 1000)

        alice.status = 'active'
        bob.status = 'all-in'  // Bob all-in
        charlie.status = 'active'

        table.players.push(alice, bob, charlie)

        // From position 1, skips Bob (all-in), goes to Charlie
        const next = getNextActivePlayer(1, table)
        expect(next?.id).toBe('p3')
    })

    test('skips players with no stack', () => {
        const table = createInitialTableState('t1', 100, 200)
        const alice = createPlayer('p1', 'Alice', 1, 1000)
        const bob = createPlayer('p2', 'Bob', 3, 0) // No chips
        const charlie = createPlayer('p3', 'Charlie', 5, 1000)

        alice.status = 'active'
        bob.status = 'active'  // Active but no chips
        charlie.status = 'active'

        table.players.push(alice, bob, charlie)

        // From position 1, skips Bob (no stack), goes to Charlie
        const next = getNextActivePlayer(1, table)
        expect(next?.id).toBe('p3')
    })

    test('wraps around the table', () => {
        const table = createInitialTableState('t1', 100, 200)
        const alice = createPlayer('p1', 'Alice', 1, 1000)
        const bob = createPlayer('p2', 'Bob', 5, 1000)

        alice.status = 'active'
        bob.status = 'active'

        table.players.push(alice, bob)

        // From position 5, wraps to Alice at position 1
        const next = getNextActivePlayer(5, table)
        expect(next?.id).toBe('p1')
        expect(next?.seatPosition).toBe(1)
    })

    test('returns null when no active players', () => {
        const table = createInitialTableState('t1', 100, 200)
        const alice = createPlayer('p1', 'Alice', 1, 1000)
        const bob = createPlayer('p2', 'Bob', 5, 1000)

        alice.status = 'folded'
        bob.status = 'all-in'

        table.players.push(alice, bob)

        // No active players
        expect(getNextActivePlayer(0, table)).toBeNull()
    })

    test('game loop example: positions 1, 3, 5', () => {
        const table = createInitialTableState('t1', 100, 200)
        const alice = createPlayer('p1', 'Alice', 1, 1000)
        const bob = createPlayer('p2', 'Bob', 3, 1000)
        const charlie = createPlayer('p3', 'Charlie', 5, 1000)

        alice.status = 'active'
        bob.status = 'active'
        charlie.status = 'active'

        table.players.push(alice, bob, charlie)

        // Action order: 1 -> 3 -> 5 -> 1 (wraps)
        let current = getNextActivePlayer(0, table)
        expect(current?.seatPosition).toBe(1) // Alice

        current = getNextActivePlayer(1, table)
        expect(current?.seatPosition).toBe(3) // Bob

        current = getNextActivePlayer(3, table)
        expect(current?.seatPosition).toBe(5) // Charlie

        current = getNextActivePlayer(5, table)
        expect(current?.seatPosition).toBe(1) // Back to Alice
    })

})