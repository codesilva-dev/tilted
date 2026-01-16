import { TableState, Player, Pot, HandResult, PotResult, isPlayerInHand } from "../types/game-state";
import { findBestHand, compareHands, type HandRank } from "../core/hand-evaluator";
import { Card } from "../core/cards";


export function calculatePots(table: TableState): Pot[] {
  const pots: Pot[] = [];

  console.log('[PotManager] calculatePots called');
  console.log('[PotManager] All players:', table.players.map(p => ({
    name: p.name,
    id: p.id,
    status: p.status,
    totalBetInHand: p.totalBetInHand,
    stack: p.stack
  })));

  // Include ALL players who contributed chips (including folded players)
  // This ensures folded players' chips are included in pot calculations
  const playersWhoContributed = table.players.filter(p => p.totalBetInHand > 0);

  if (playersWhoContributed.length === 0) {
    console.log('[PotManager] No players contributed chips, returning empty pots');
    return pots;
  }

  console.log('[PotManager] Players who contributed:', playersWhoContributed.map(p => ({
    name: p.name,
    totalBetInHand: p.totalBetInHand,
    status: p.status
  })));

  // Sort players by total bet amount (ascending)
  const sortedPlayers = [...playersWhoContributed].sort((a, b) => a.totalBetInHand - b.totalBetInHand);

  let remainingPlayers = [...sortedPlayers];
  let previousBetLevel = 0;

  for (let i = 0; i < sortedPlayers.length; i++) {
    const currentPlayer = sortedPlayers[i];
    const currentBetLevel = currentPlayer.totalBetInHand;

    console.log(`[PotManager] Processing player ${currentPlayer.name}: betLevel=${currentBetLevel}, previousLevel=${previousBetLevel}`);

    // Skip if this player bet the same as previous (no new pot needed)
    if (currentBetLevel === previousBetLevel) {
      // Still need to remove this player from remaining
      remainingPlayers = remainingPlayers.filter(p => p.id !== currentPlayer.id);
      console.log(`[PotManager] Same bet level, skipping ${currentPlayer.name}`);
      continue;
    }

    const betIncrement = currentBetLevel - previousBetLevel;
    const potAmount = betIncrement * remainingPlayers.length;

    console.log(`[PotManager] Bet increment: ${betIncrement}, remaining players: ${remainingPlayers.length}, pot amount: ${potAmount}`);

    if (potAmount > 0) {
      // Only include players still in the hand as eligible winners
      // Folded players contribute to the pot but can't win it
      const eligiblePlayerIds = remainingPlayers
        .filter(p => isPlayerInHand(p))
        .map(p => p.id);

      const potType = pots.length === 0 ? 'main' : 'side';
      console.log(`[PotManager] Creating ${potType} pot: amount=${potAmount}, eligible=${eligiblePlayerIds.length} players`);

      pots.push({
        amount: potAmount,
        eligiblePlayers: eligiblePlayerIds,
        type: potType
      });
    }

    // Remove current player from remaining (they're all-in at this level or folded)
    remainingPlayers = remainingPlayers.filter(p => p.id !== currentPlayer.id);
    previousBetLevel = currentBetLevel;

    // If no players remain, we're done
    if (remainingPlayers.length === 0) {
      break;
    }
  }

  console.log('[PotManager] Final pots:', pots.map((p, i) => ({
    index: i,
    type: p.type,
    amount: p.amount,
    eligiblePlayers: p.eligiblePlayers
  })));

  return pots;
}

export function determineWinnersForPot(
  pot: Pot,
  players: Player[],
  communityCards: Card[]
): PotResult {
  console.log(`[PotManager] determineWinnersForPot: pot amount=${pot.amount}, type=${pot.type}`);
  console.log(`[PotManager] Community cards:`, communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' '));

  const eligiblePlayers = players.filter(p => pot.eligiblePlayers.includes(p.id));

  console.log(`[PotManager] Eligible players for this pot:`, eligiblePlayers.map(p => ({
    name: p.name,
    holeCards: p.holeCards.map(c => `${c.rank}${c.suit[0]}`).join(' ')
  })));

  if (eligiblePlayers.length === 0) {
    console.log('[PotManager] ERROR: No eligible players for pot!');
    throw new Error('No eligible players for pot');
  }

  // If only one eligible player, they win by default
  if (eligiblePlayers.length === 1) {
    const handRank = findBestHand([...eligiblePlayers[0].holeCards, ...communityCards]);
    console.log(`[PotManager] Single winner by default: ${eligiblePlayers[0].name} wins ${pot.amount} with ${handRank.description}`);
    return {
      pot,
      winners: [{
        playerId: eligiblePlayers[0].id,
        handRank,
        amountWon: pot.amount
      }],
      wasSplit: false
    };
  }

  // Evaluate all hands
  const evaluatedPlayers = eligiblePlayers.map(player => {
    const allCards = [...player.holeCards, ...communityCards];
    const handRank = findBestHand(allCards);
    // Log detailed info including the actual cards used in the hand
    const cardsUsed = handRank.cards.map(c => `${c.rank}${c.suit[0]}`).join(' ');
    const holeCardsStr = player.holeCards.map(c => `${c.rank}${c.suit[0]}`).join(' ');
    console.log(`[PotManager] ${player.name}:`);
    console.log(`[PotManager]   Hole cards: ${holeCardsStr}`);
    console.log(`[PotManager]   Best hand: ${handRank.description}`);
    console.log(`[PotManager]   Cards used: ${cardsUsed}`);
    console.log(`[PotManager]   Value: ${handRank.value}`);
    return {
      player,
      handRank
    };
  });

  // Find the best hand
  let bestHand = evaluatedPlayers[0].handRank;
  for (const evaluated of evaluatedPlayers) {
    const comparison = compareHands(evaluated.handRank, bestHand);
    console.log(`[PotManager] Comparing ${evaluated.player.name} (${evaluated.handRank.value}) vs best (${bestHand.value}): diff=${comparison}`);
    if (comparison > 0) {
      bestHand = evaluated.handRank;
      console.log(`[PotManager] New best hand: ${evaluated.player.name}`);
    }
  }

  console.log(`[PotManager] Best hand: ${bestHand.description} (value: ${bestHand.value})`);

  // Find all players with the best hand (for split pots)
  const winners = evaluatedPlayers.filter(evaluated => {
    const comparison = compareHands(evaluated.handRank, bestHand);
    console.log(`[PotManager] Winner check - ${evaluated.player.name}: value=${evaluated.handRank.value}, bestValue=${bestHand.value}, diff=${comparison}, isWinner=${comparison === 0}`);
    return comparison === 0;
  });

  console.log(`[PotManager] Winners:`, winners.map(w => w.player.name));

  // Calculate amount each winner gets
  const amountPerWinner = Math.floor(pot.amount / winners.length);
  const remainder = pot.amount % winners.length;

  const result = {
    pot,
    winners: winners.map((winner, index) => ({
      playerId: winner.player.id,
      handRank: winner.handRank,
      // First winner gets any odd chips
      amountWon: amountPerWinner + (index === 0 ? remainder : 0)
    })),
    wasSplit: winners.length > 1
  };

  console.log(`[PotManager] Pot result: wasSplit=${result.wasSplit}, winners get ${amountPerWinner} each${remainder > 0 ? ` (+${remainder} odd chips to first)` : ''}`);

  return result;
}

export function distributePots(table: TableState): { table: TableState; result: HandResult } {
  console.log('[PotManager] ========== DISTRIBUTE POTS ==========');
  console.log(`[PotManager] Current pot: ${table.pot}, street: ${table.currentStreet}`);

  const pots = calculatePots(table);
  const potResults: PotResult[] = [];

  let totalDistributed = 0;
  const winnerIds = new Set<string>();

  // First, evaluate hands for all players who went to showdown
  const playersInShowdown = table.players.filter(p => isPlayerInHand(p) && p.holeCards.length > 0);
  console.log(`[PotManager] Players in showdown: ${playersInShowdown.map(p => p.name).join(', ')}`);

  for (const player of playersInShowdown) {
    const allCards = [...player.holeCards, ...table.communityCards];
    player.handRank = findBestHand(allCards);
    console.log(`[PotManager] Evaluated ${player.name}: ${player.handRank.description}`);
  }

  // Determine winners for each pot
  console.log(`[PotManager] Processing ${pots.length} pot(s)...`);
  for (const pot of pots) {
    const potResult = determineWinnersForPot(pot, table.players, table.communityCards);
    potResults.push(potResult);

    // Award winnings and mark winners
    for (const winner of potResult.winners) {
      const player = table.players.find(p => p.id === winner.playerId);
      if (player) {
        console.log(`[PotManager] Awarding ${winner.amountWon} to ${player.name} (stack: ${player.stack} -> ${player.stack + winner.amountWon})`);
        player.stack += winner.amountWon;
        totalDistributed += winner.amountWon;
        winnerIds.add(winner.playerId);
      }
    }
  }

  // Mark winners
  for (const player of table.players) {
    player.isWinner = winnerIds.has(player.id);
  }

  const handResult: HandResult = {
    potResults,
    totalDistributed,
    completedAt: new Date()
  };

  console.log(`[PotManager] Total distributed: ${totalDistributed}`);
  console.log(`[PotManager] Winners: ${Array.from(winnerIds).join(', ')}`);
  console.log('[PotManager] ========== END DISTRIBUTE POTS ==========');

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
  console.log('[PotManager] ========== END HAND BY FOLD ==========');
  console.log(`[PotManager] Current pot: ${table.pot}, street: ${table.currentStreet}`);

  const playersInHand = table.players.filter(p => isPlayerInHand(p));
  console.log(`[PotManager] Players still in hand: ${playersInHand.map(p => p.name).join(', ')}`);

  if (playersInHand.length !== 1) {
    console.log(`[PotManager] ERROR: Expected 1 player, found ${playersInHand.length}`);
    throw new Error(`Expected 1 player in hand, found ${playersInHand.length}`);
  }

  const winner = playersInHand[0];
  console.log(`[PotManager] Winner by fold: ${winner.name}`);
  console.log(`[PotManager] Awarding ${table.pot} to ${winner.name} (stack: ${winner.stack} -> ${winner.stack + table.pot})`);

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

  // Mark winner
  winner.isWinner = true;

  console.log('[PotManager] ========== END HAND BY FOLD COMPLETE ==========');

  return {
    table: {
      ...table,
      currentStreet: 'showdown',
      pot: 0,
      activePlayerPosition: null,
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
