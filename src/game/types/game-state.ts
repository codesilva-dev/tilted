import { Card, createDeck } from "../core/cards";
import { HandRank } from "../core/hand-evaluator";

export type PlayerStatus = | 'waiting' | 'active' | 'folded' | 'all-in' | 'sitting-out';

export function canPlayerAct(status: PlayerStatus): boolean {
    return status === 'active';
}

export interface Player {
    id: string;
    name: string;
    seatPosition: number;
    stack: number;
    holeCards: Card[];
    status: PlayerStatus;
    currentBet: number;
    totalBetInHand: number;
    hasActed: boolean;
    handRank?: HandRank; // Populated at showdown
    isWinner?: boolean; // True if player won the hand
    isLeaving?: boolean; // Player wants to leave but must wait until hand ends
}

export type Street = | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface TableState {
    id: string;
    name: string;
    players: Player[];
    dealerPosition: number;
    smallBlindPosition: number;
    bigBlindPosition: number;
    smallBlind: number;
    bigBlind: number;
    minBuyIn: number;
    maxBuyIn: number;
    currentStreet: Street;
    communityCards: Card[];
    pot: number;
    currentBet: number;
    /**
     * The size of the last raise in this betting round.
     * Used to determine minimum raise amount.
     * Resets to bigBlind at start of each street.
     */
    lastRaiseAmount: number;
    activePlayerPosition: number | null;
    deck: Card[];
    handStartedAt: Date;
    handNumber: number;
}

export type ActionType = | 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

export interface GameAction {
    type: ActionType;
    playerId: string;
    amount?: number;
    timestamp: Date;
}

export interface Pot {
  amount: number;
  eligiblePlayers: string[];
  type: 'main' | 'side';
}

export interface PotResult {
    pot: Pot

    // Multiple winners possible (for split pots)
    winners: {
      playerId: string
      handRank: HandRank
      amountWon: number
    }[]

    wasSplit: boolean
  }

export interface HandResult {
    potResults: PotResult[]
    totalDistributed: number
    completedAt: Date
}

export interface SeatInfo {
    position: number
    isOccupied: boolean
    player?: Player  // Only if occupied
}

export function getSeatsInfo(table: TableState, maxSeats: number = 9): SeatInfo[] {
  const seats: SeatInfo[] = []

  for (let i = 0; i < maxSeats; i++) {
    const player = table.players.find(p => p.seatPosition === i)
    seats.push({
      position: i,
      isOccupied: !!player,
      player
    })
  }

  return seats
}

export interface BettingLimits {
  min: number;
  max: number;
  canCheck: boolean;
  canBet: boolean;
  canRaise: boolean;
  callAmount: number;
}

export function createInitialTableState(
  tableId: string,
  tableName: string,
  smallBlind: number,
  bigBlind: number,
  minBuyIn: number = 1000,
  maxBuyIn: number = 10000
): TableState {
  return {
    id: tableId,
    name: tableName,
    players: [],
    dealerPosition: 0,
    smallBlindPosition: 1,
    bigBlindPosition: 2,
    smallBlind,
    bigBlind,
    minBuyIn,
    maxBuyIn,
    currentStreet: 'pre-flop',
    communityCards: [],
    pot: 0,
    currentBet: 0,
    lastRaiseAmount: bigBlind, // Initialize to big blind
    activePlayerPosition: null,
    deck: createDeck(),  // From cards.ts
    handStartedAt: new Date(),
    handNumber: 0
  }
}

export function createPlayer(
  id: string,
  name: string,
  seatPosition: number,
  initialStack: number
): Player {
  return {
    id,
    name,
    seatPosition,
    stack: initialStack,
    holeCards: [],
    status: 'waiting',
    currentBet: 0,
    totalBetInHand: 0,
    hasActed: false
  }
}

export function isPlayerActive(player: Player): boolean {
  return player.status === 'active'
}

export function isPlayerInHand(player: Player): boolean {
  return ['active', 'all-in'].includes(player.status)
}

export function hasPlayerFolded(player: Player): boolean {
  return player.status === 'folded'
}

export function canPlayerBet(player: Player, table: TableState): boolean {
  return (
    player.status === 'active' &&
    player.stack > 0 &&
    table.currentBet === 0
  )
}

export function getNextPosition(
  currentPosition: number,
  maxSeats: number = 9
): number {
  // For 1-indexed seats (1-9), wrap around correctly
  return (currentPosition % maxSeats) + 1
}

export function getPreviousPosition(
  currentPosition: number,
  maxSeats: number = 9
): number {
  // For 1-indexed seats (1-9), wrap around correctly
  return ((currentPosition - 2 + maxSeats) % maxSeats) + 1
}

export function getPositionDistance(
  from: number,
  to: number,
  maxSeats: number = 9
): number {
  // For 1-indexed seats, calculate circular distance
  if (to >= from) {
    return to - from
  } else {
    return (maxSeats - from + 1) + to
  }
}

export function getFirstOccupiedPosition(players: Player[]): number | null {
  if (players.length === 0) return null

  // Find player with lowest seat position
  const sortedPlayers = [...players].sort((a, b) => a.seatPosition - b.seatPosition)
  return sortedPlayers[0].seatPosition
}

export function getNextOccupiedPosition(
  currentPosition: number,
  players: Player[],
  maxSeats: number = 9
): number | null {
  if (players.length === 0) return null

  let nextPos = getNextPosition(currentPosition, maxSeats)
  let attempts = 0

  // Keep looking for an occupied seat (max one full circle)
  while (attempts < maxSeats) {
    const playerAtSeat = players.find(p => p.seatPosition === nextPos)
    if (playerAtSeat) {
      return nextPos
    }
    nextPos = getNextPosition(nextPos, maxSeats)
    attempts++
  }

  return null  // No occupied seats found
}

export function getPreviousOccupiedPosition(
  currentPosition: number,
  players: Player[],
  maxSeats: number = 9
): number | null {
  if (players.length === 0) return null

  let prevPos = getPreviousPosition(currentPosition, maxSeats)
  let attempts = 0

  // Keep looking for an occupied seat (max one full circle)
  while (attempts < maxSeats) {
    const playerAtSeat = players.find(p => p.seatPosition === prevPos)
    if (playerAtSeat) {
      return prevPos
    }
    prevPos = getPreviousPosition(prevPos, maxSeats)
    attempts++
  }

  return null  // No occupied seats found
}

export function getNextActivePlayer(
  currentPosition: number,
  table: TableState
): Player | null {
  if (table.players.length === 0) return null

  let nextPos = getNextOccupiedPosition(currentPosition, table.players, 10)
  let attempts = 0

  // Keep searching for a player who can act
  while (nextPos !== null && attempts < table.players.length) {
    const player = table.players.find(p => p.seatPosition === nextPos)

    if (player && player.status === 'active' && player.stack > 0) {
      return player
    }

    nextPos = getNextOccupiedPosition(nextPos, table.players, 10)
    attempts++
  }

  return null  // No active players found
}