"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canPlayerAct = canPlayerAct;
exports.getSeatsInfo = getSeatsInfo;
exports.createInitialTableState = createInitialTableState;
exports.createPlayer = createPlayer;
exports.isPlayerActive = isPlayerActive;
exports.isPlayerInHand = isPlayerInHand;
exports.hasPlayerFolded = hasPlayerFolded;
exports.canPlayerBet = canPlayerBet;
exports.getNextPosition = getNextPosition;
exports.getPreviousPosition = getPreviousPosition;
exports.getPositionDistance = getPositionDistance;
exports.getFirstOccupiedPosition = getFirstOccupiedPosition;
exports.getNextOccupiedPosition = getNextOccupiedPosition;
exports.getPreviousOccupiedPosition = getPreviousOccupiedPosition;
exports.getNextActivePlayer = getNextActivePlayer;
const cards_1 = require("../core/cards");
function canPlayerAct(status) {
    return status === 'active';
}
function getSeatsInfo(table, maxSeats = 9) {
    const seats = [];
    for (let i = 0; i < maxSeats; i++) {
        const player = table.players.find(p => p.seatPosition === i);
        seats.push({
            position: i,
            isOccupied: !!player,
            player
        });
    }
    return seats;
}
function createInitialTableState(tableId, smallBlind, bigBlind) {
    return {
        id: tableId,
        players: [],
        dealerPosition: 0,
        smallBlindPosition: 1,
        bigBlindPosition: 2,
        smallBlind,
        bigBlind,
        currentStreet: 'pre-flop',
        communityCards: [],
        pot: 0,
        currentBet: 0,
        lastRaiseAmount: bigBlind, // Initialize to big blind
        activePlayerPosition: null,
        deck: (0, cards_1.createDeck)(), // From cards.ts
        handStartedAt: new Date(),
        handNumber: 0
    };
}
function createPlayer(id, name, seatPosition, initialStack) {
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
    };
}
function isPlayerActive(player) {
    return player.status === 'active';
}
function isPlayerInHand(player) {
    return ['active', 'all-in'].includes(player.status);
}
function hasPlayerFolded(player) {
    return player.status === 'folded';
}
function canPlayerBet(player, table) {
    return (player.status === 'active' &&
        player.stack > 0 &&
        table.currentBet === 0);
}
function getNextPosition(currentPosition, maxSeats = 9) {
    // For 1-indexed seats (1-9), wrap around correctly
    return (currentPosition % maxSeats) + 1;
}
function getPreviousPosition(currentPosition, maxSeats = 9) {
    // For 1-indexed seats (1-9), wrap around correctly
    return ((currentPosition - 2 + maxSeats) % maxSeats) + 1;
}
function getPositionDistance(from, to, maxSeats = 9) {
    // For 1-indexed seats, calculate circular distance
    if (to >= from) {
        return to - from;
    }
    else {
        return (maxSeats - from + 1) + to;
    }
}
function getFirstOccupiedPosition(players) {
    if (players.length === 0)
        return null;
    // Find player with lowest seat position
    const sortedPlayers = [...players].sort((a, b) => a.seatPosition - b.seatPosition);
    return sortedPlayers[0].seatPosition;
}
function getNextOccupiedPosition(currentPosition, players, maxSeats = 9) {
    if (players.length === 0)
        return null;
    let nextPos = getNextPosition(currentPosition, maxSeats);
    let attempts = 0;
    // Keep looking for an occupied seat (max one full circle)
    while (attempts < maxSeats) {
        const playerAtSeat = players.find(p => p.seatPosition === nextPos);
        if (playerAtSeat) {
            return nextPos;
        }
        nextPos = getNextPosition(nextPos, maxSeats);
        attempts++;
    }
    return null; // No occupied seats found
}
function getPreviousOccupiedPosition(currentPosition, players, maxSeats = 9) {
    if (players.length === 0)
        return null;
    let prevPos = getPreviousPosition(currentPosition, maxSeats);
    let attempts = 0;
    // Keep looking for an occupied seat (max one full circle)
    while (attempts < maxSeats) {
        const playerAtSeat = players.find(p => p.seatPosition === prevPos);
        if (playerAtSeat) {
            return prevPos;
        }
        prevPos = getPreviousPosition(prevPos, maxSeats);
        attempts++;
    }
    return null; // No occupied seats found
}
function getNextActivePlayer(currentPosition, table) {
    if (table.players.length === 0)
        return null;
    let nextPos = getNextOccupiedPosition(currentPosition, table.players, 10);
    let attempts = 0;
    // Keep searching for a player who can act
    while (nextPos !== null && attempts < table.players.length) {
        const player = table.players.find(p => p.seatPosition === nextPos);
        if (player && player.status === 'active' && player.stack > 0) {
            return player;
        }
        nextPos = getNextOccupiedPosition(nextPos, table.players, 10);
        attempts++;
    }
    return null; // No active players found
}
