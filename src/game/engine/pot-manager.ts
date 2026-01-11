import { TableState, Player, Pot, HandResult, PotResult, isPlayerInHand } from "../types/game-state";
import { findBestHand, compareHands, type HandRank } from "../core/hand-evaluator";
import { Card } from "../core/cards";


export function calculatePots(table: TableState): Pot[] {
  const pots: Pot[] = [];
  const playersInHand = table.players.filter(p => isPlayerInHand(p));

  if (playersInHand.length === 0) {
    return pots;
  }

  // Sort players by total bet amount (ascending)
  const sortedPlayers = [...playersInHand].sort((a, b) => a.totalBetInHand - b.totalBetInHand);

  let remainingPlayers = [...sortedPlayers];
  let previousBetLevel = 0;

  for (let i = 0; i < sortedPlayers.length; i++) {
    const currentPlayer = sortedPlayers[i];
    const currentBetLevel = currentPlayer.totalBetInHand;

    // Skip if this player bet the same as previous (no new pot needed)
    if (currentBetLevel === previousBetLevel) {
      continue;
    }

    const betIncrement = currentBetLevel - previousBetLevel;
    const potAmount = betIncrement * remainingPlayers.length;

    if (potAmount > 0) {
      pots.push({
        amount: potAmount,
        eligiblePlayers: remainingPlayers.map(p => p.id),
        type: pots.length === 0 ? 'main' : 'side'
      });
    }

    // Remove current player from remaining (they're all-in at this level)
    remainingPlayers = remainingPlayers.filter(p => p.id !== currentPlayer.id);
    previousBetLevel = currentBetLevel;

    // If no players remain, we're done
    if (remainingPlayers.length === 0) {
      break;
    }
  }

  return pots;
}

export function determineWinnersForPot(
  pot: Pot,
  players: Player[],
  communityCards: Card[]
): PotResult {
  const eligiblePlayers = players.filter(p => pot.eligiblePlayers.includes(p.id));

  if (eligiblePlayers.length === 0) {
    throw new Error('No eligible players for pot');
  }

  // If only one eligible player, they win by default
  if (eligiblePlayers.length === 1) {
    return {
      pot,
      winners: [{
        playerId: eligiblePlayers[0].id,
        handRank: findBestHand([...eligiblePlayers[0].holeCards, ...communityCards]),
        amountWon: pot.amount
      }],
      wasSplit: false
    };
  }

  // Evaluate all hands
  const evaluatedPlayers = eligiblePlayers.map(player => {
    const allCards = [...player.holeCards, ...communityCards];
    const handRank = findBestHand(allCards);
    return {
      player,
      handRank
    };
  });

  // Find the best hand
  let bestHand = evaluatedPlayers[0].handRank;
  for (const evaluated of evaluatedPlayers) {
    if (compareHands(evaluated.handRank, bestHand) > 0) {
      bestHand = evaluated.handRank;
    }
  }

  // Find all players with the best hand (for split pots)
  const winners = evaluatedPlayers.filter(
    evaluated => compareHands(evaluated.handRank, bestHand) === 0
  );

  // Calculate amount each winner gets
  const amountPerWinner = Math.floor(pot.amount / winners.length);
  const remainder = pot.amount % winners.length;

  return {
    pot,
    winners: winners.map((winner, index) => ({
      playerId: winner.player.id,
      handRank: winner.handRank,
      // First winner gets any odd chips
      amountWon: amountPerWinner + (index === 0 ? remainder : 0)
    })),
    wasSplit: winners.length > 1
  };
}

export function distributePots(table: TableState): { table: TableState; result: HandResult } {
  const pots = calculatePots(table);
  const potResults: PotResult[] = [];

  let totalDistributed = 0;

  // Determine winners for each pot
  for (const pot of pots) {
    const potResult = determineWinnersForPot(pot, table.players, table.communityCards);
    potResults.push(potResult);

    // Award winnings
    for (const winner of potResult.winners) {
      const player = table.players.find(p => p.id === winner.playerId);
      if (player) {
        player.stack += winner.amountWon;
        totalDistributed += winner.amountWon;
      }
    }
  }

  const handResult: HandResult = {
    potResults,
    totalDistributed,
    completedAt: new Date()
  };

  return {
    table: {
      ...table,
      pot: 0, // Clear pot after distribution
      players: [...table.players] // Return updated players
    },
    result: handResult
  };
}

export function endHandByFold(table: TableState): { table: TableState; result: HandResult } {
  const playersInHand = table.players.filter(p => isPlayerInHand(p));

  if (playersInHand.length !== 1) {
    throw new Error(`Expected 1 player in hand, found ${playersInHand.length}`);
  }

  const winner = playersInHand[0];

  // Create a single pot with the winner
  const pot: Pot = {
    amount: table.pot,
    eligiblePlayers: [winner.id],
    type: 'main'
  };

  // Award the pot (no hand evaluation needed)
  winner.stack += table.pot;

  const potResult: PotResult = {
    pot,
    winners: [{
      playerId: winner.id,
      // No hand rank since we didn't go to showdown
      handRank: {
        type: 'high-card',
        cards: [
          { rank: '2', suit: 'hearts' },
          { rank: '3', suit: 'hearts' },
          { rank: '4', suit: 'hearts' },
          { rank: '5', suit: 'hearts' },
          { rank: '7', suit: 'hearts' }
        ],
        value: 0,
        description: 'Won by fold'
      },
      amountWon: table.pot
    }],
    wasSplit: false
  };

  const handResult: HandResult = {
    potResults: [potResult],
    totalDistributed: table.pot,
    completedAt: new Date()
  };

  return {
    table: {
      ...table,
      pot: 0,
      players: [...table.players]
    },
    result: handResult
  };
}

export function shouldEndHandByFold(table: TableState): boolean {
  const playersInHand = table.players.filter(p => isPlayerInHand(p));
  return playersInHand.length === 1;
}

export function shouldGoToShowdown(table: TableState): boolean {
  const playersInHand = table.players.filter(p => isPlayerInHand(p));
  return playersInHand.length > 1 && table.currentStreet === 'river';
}
