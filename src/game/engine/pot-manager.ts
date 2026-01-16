import { TableState, Player, Pot, HandResult, PotResult, isPlayerInHand } from "../types/game-state";
import { findBestHand, compareHands, type HandRank } from "../core/hand-evaluator";
import { Card } from "../core/cards";

// Helper to create consistent log prefix with hand number
function logPrefix(table: TableState): string {
  return `[PotManager][Hand #${table.handNumber}][${table.id}]`;
}

// Helper to format player state for logging
function formatPlayerState(p: Player): string {
  return `${p.name}(${p.status}, bet:${p.totalBetInHand}, stack:${p.stack}, cards:${p.holeCards.length})`;
}

export function calculatePots(table: TableState): Pot[] {
  const pots: Pot[] = [];
  const prefix = logPrefix(table);

  console.log(`${prefix} ===== CALCULATE POTS START =====`);
  console.log(`${prefix} Table pot: ${table.pot}, Street: ${table.currentStreet}`);
  console.log(`${prefix} All players state:`);
  table.players.forEach((p, i) => {
    console.log(`${prefix}   [${i}] ${formatPlayerState(p)} | isInHand: ${isPlayerInHand(p)}`);
  });

  // Include ALL players who contributed chips (including folded players)
  // This ensures folded players' chips are included in pot calculations
  const playersWhoContributed = table.players.filter(p => p.totalBetInHand > 0);

  if (playersWhoContributed.length === 0) {
    console.log(`${prefix} No players contributed chips, returning empty pots`);
    return pots;
  }

  const totalContributed = playersWhoContributed.reduce((sum, p) => sum + p.totalBetInHand, 0);
  console.log(`${prefix} Players who contributed (${playersWhoContributed.length} total, ${totalContributed} chips):`);
  playersWhoContributed.forEach(p => {
    console.log(`${prefix}   - ${p.name}: ${p.totalBetInHand} chips (${p.status})`);
  });

  // Sort players by total bet amount (ascending)
  const sortedPlayers = [...playersWhoContributed].sort((a, b) => a.totalBetInHand - b.totalBetInHand);

  let remainingPlayers = [...sortedPlayers];
  let previousBetLevel = 0;

  for (let i = 0; i < sortedPlayers.length; i++) {
    const currentPlayer = sortedPlayers[i];
    const currentBetLevel = currentPlayer.totalBetInHand;

    console.log(`${prefix} Processing [${i}] ${currentPlayer.name}: betLevel=${currentBetLevel}, previousLevel=${previousBetLevel}`);

    // Skip if this player bet the same as previous (no new pot needed)
    if (currentBetLevel === previousBetLevel) {
      // Still need to remove this player from remaining
      remainingPlayers = remainingPlayers.filter(p => p.id !== currentPlayer.id);
      console.log(`${prefix}   -> Same bet level, skipping (remaining: ${remainingPlayers.length})`);
      continue;
    }

    const betIncrement = currentBetLevel - previousBetLevel;
    const potAmount = betIncrement * remainingPlayers.length;

    console.log(`${prefix}   -> Increment: ${betIncrement} x ${remainingPlayers.length} players = ${potAmount}`);

    if (potAmount > 0) {
      // Only include players still in the hand as eligible winners
      // Folded players contribute to the pot but can't win it
      const eligiblePlayerIds = remainingPlayers
        .filter(p => isPlayerInHand(p))
        .map(p => p.id);

      const potType = pots.length === 0 ? 'main' : 'side';
      const eligibleNames = remainingPlayers.filter(p => isPlayerInHand(p)).map(p => p.name);
      console.log(`${prefix}   -> Creating ${potType} pot: ${potAmount} chips, eligible: [${eligibleNames.join(', ')}]`);

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
      console.log(`${prefix}   -> No more players to process`);
      break;
    }
  }

  const totalPotAmount = pots.reduce((sum, p) => sum + p.amount, 0);
  console.log(`${prefix} ===== CALCULATE POTS COMPLETE =====`);
  console.log(`${prefix} Final pots (${pots.length} pots, ${totalPotAmount} total chips):`);
  pots.forEach((p, i) => {
    const eligibleNames = table.players.filter(pl => p.eligiblePlayers.includes(pl.id)).map(pl => pl.name);
    console.log(`${prefix}   [${i}] ${p.type}: ${p.amount} chips -> [${eligibleNames.join(', ')}]`);
  });

  // Sanity check: total pots should equal total contributed
  if (totalPotAmount !== totalContributed) {
    console.error(`${prefix} WARNING: Pot mismatch! Calculated ${totalPotAmount} but players contributed ${totalContributed}`);
  }

  return pots;
}

export function determineWinnersForPot(
  pot: Pot,
  players: Player[],
  communityCards: Card[],
  table: TableState
): PotResult {
  const prefix = logPrefix(table);
  const communityStr = communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' ');

  console.log(`${prefix} --- Determining winners for ${pot.type} pot (${pot.amount} chips) ---`);
  console.log(`${prefix} Community: [${communityStr}]`);

  const eligiblePlayers = players.filter(p => pot.eligiblePlayers.includes(p.id));

  console.log(`${prefix} Eligible players (${eligiblePlayers.length}):`);
  eligiblePlayers.forEach(p => {
    const holeStr = p.holeCards.map(c => `${c.rank}${c.suit[0]}`).join(' ');
    console.log(`${prefix}   - ${p.name}: [${holeStr}] (${p.status})`);
  });

  if (eligiblePlayers.length === 0) {
    console.error(`${prefix} ERROR: No eligible players for pot!`);
    console.error(`${prefix} Pot eligible IDs: [${pot.eligiblePlayers.join(', ')}]`);
    console.error(`${prefix} All player IDs: [${players.map(p => p.id).join(', ')}]`);
    throw new Error('No eligible players for pot');
  }

  // If only one eligible player, they win by default
  if (eligiblePlayers.length === 1) {
    const player = eligiblePlayers[0];
    const allCards = [...player.holeCards, ...communityCards];

    // Handle case where player doesn't have enough cards (shouldn't happen, but defensive)
    if (allCards.length < 7) {
      console.error(`${prefix} ERROR: ${player.name} only has ${allCards.length} cards (need 7)`);
      console.error(`${prefix}   Hole cards: ${player.holeCards.length}, Community: ${communityCards.length}`);
    }

    const handRank = allCards.length === 7 ? findBestHand(allCards) : {
      type: 'high-card' as const,
      cards: allCards.slice(0, 5) as [Card, Card, Card, Card, Card],
      value: 0,
      description: 'Unknown (insufficient cards)'
    };

    console.log(`${prefix} Single winner: ${player.name} wins ${pot.amount} with ${handRank.description}`);
    return {
      pot,
      winners: [{
        playerId: player.id,
        handRank,
        amountWon: pot.amount
      }],
      wasSplit: false
    };
  }

  // Evaluate all hands
  console.log(`${prefix} Evaluating ${eligiblePlayers.length} hands:`);
  const evaluatedPlayers = eligiblePlayers.map(player => {
    const allCards = [...player.holeCards, ...communityCards];
    const holeCardsStr = player.holeCards.map(c => `${c.rank}${c.suit[0]}`).join(' ');

    if (allCards.length !== 7) {
      console.error(`${prefix}   ${player.name}: ERROR - ${allCards.length} cards (expected 7)`);
      console.error(`${prefix}     Hole: [${holeCardsStr}] (${player.holeCards.length}), Community: ${communityCards.length}`);
    }

    const handRank = allCards.length === 7 ? findBestHand(allCards) : {
      type: 'high-card' as const,
      cards: allCards.slice(0, 5) as [Card, Card, Card, Card, Card],
      value: 0,
      description: 'Unknown (insufficient cards)'
    };

    const cardsUsed = handRank.cards.map(c => `${c.rank}${c.suit[0]}`).join(' ');
    console.log(`${prefix}   ${player.name}: ${handRank.description} (value: ${handRank.value})`);
    console.log(`${prefix}     Hole: [${holeCardsStr}] -> Best 5: [${cardsUsed}]`);

    return { player, handRank };
  });

  // Find the best hand
  let bestHand = evaluatedPlayers[0].handRank;
  let bestPlayer = evaluatedPlayers[0].player.name;

  for (const evaluated of evaluatedPlayers) {
    const comparison = compareHands(evaluated.handRank, bestHand);
    if (comparison > 0) {
      bestHand = evaluated.handRank;
      bestPlayer = evaluated.player.name;
    }
  }

  console.log(`${prefix} Best hand: ${bestPlayer} with ${bestHand.description} (value: ${bestHand.value})`);

  // Find all players with the best hand (for split pots)
  const winners = evaluatedPlayers.filter(evaluated => {
    const comparison = compareHands(evaluated.handRank, bestHand);
    return comparison === 0;
  });

  const winnerNames = winners.map(w => w.player.name);
  console.log(`${prefix} Winner(s): [${winnerNames.join(', ')}]${winners.length > 1 ? ' (SPLIT POT)' : ''}`);

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

  if (result.wasSplit) {
    console.log(`${prefix} Split: ${amountPerWinner} each${remainder > 0 ? ` (+${remainder} odd chip to ${winners[0].player.name})` : ''}`);
  }

  return result;
}

export function distributePots(table: TableState): { table: TableState; result: HandResult } {
  const prefix = logPrefix(table);

  console.log(`${prefix} ╔════════════════════════════════════════════════════════════╗`);
  console.log(`${prefix} ║                    DISTRIBUTE POTS                         ║`);
  console.log(`${prefix} ╚════════════════════════════════════════════════════════════╝`);
  console.log(`${prefix} Table pot: ${table.pot}, Street: ${table.currentStreet}`);
  console.log(`${prefix} Community cards: [${table.communityCards.map(c => `${c.rank}${c.suit[0]}`).join(' ')}]`);

  // Log full player state at start of distribution
  console.log(`${prefix} Player states at distribution start:`);
  table.players.forEach((p, i) => {
    const holeStr = p.holeCards.map(c => `${c.rank}${c.suit[0]}`).join(' ');
    console.log(`${prefix}   [${i}] ${p.name}: status=${p.status}, bet=${p.totalBetInHand}, stack=${p.stack}, cards=[${holeStr}]`);
  });

  const pots = calculatePots(table);
  const potResults: PotResult[] = [];

  let totalDistributed = 0;
  const winnerIds = new Set<string>();

  // First, evaluate hands for all players who went to showdown
  const playersInShowdown = table.players.filter(p => isPlayerInHand(p) && p.holeCards.length > 0);

  console.log(`${prefix} Players going to showdown (${playersInShowdown.length}):`);
  playersInShowdown.forEach(p => {
    const holeStr = p.holeCards.map(c => `${c.rank}${c.suit[0]}`).join(' ');
    console.log(`${prefix}   - ${p.name}: [${holeStr}] (${p.status})`);
  });

  // Verify we have community cards
  if (table.communityCards.length !== 5) {
    console.error(`${prefix} ERROR: Expected 5 community cards, got ${table.communityCards.length}`);
  }

  for (const player of playersInShowdown) {
    const allCards = [...player.holeCards, ...table.communityCards];
    if (allCards.length === 7) {
      player.handRank = findBestHand(allCards);
      console.log(`${prefix} Evaluated ${player.name}: ${player.handRank.description}`);
    } else {
      console.error(`${prefix} ERROR: ${player.name} has ${allCards.length} cards (expected 7)`);
    }
  }

  // Determine winners for each pot
  console.log(`${prefix} Processing ${pots.length} pot(s)...`);
  for (let i = 0; i < pots.length; i++) {
    const pot = pots[i];
    console.log(`${prefix} === Pot ${i + 1}/${pots.length}: ${pot.type} (${pot.amount} chips) ===`);

    const potResult = determineWinnersForPot(pot, table.players, table.communityCards, table);
    potResults.push(potResult);

    // Award winnings and mark winners
    for (const winner of potResult.winners) {
      const player = table.players.find(p => p.id === winner.playerId);
      if (player) {
        const oldStack = player.stack;
        player.stack += winner.amountWon;
        console.log(`${prefix} AWARD: ${player.name} +${winner.amountWon} (${oldStack} -> ${player.stack})`);
        totalDistributed += winner.amountWon;
        winnerIds.add(winner.playerId);
      } else {
        console.error(`${prefix} ERROR: Winner ${winner.playerId} not found in players!`);
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

  // Final summary
  console.log(`${prefix} ════════════════════════════════════════════════════════════`);
  console.log(`${prefix} DISTRIBUTION SUMMARY:`);
  console.log(`${prefix}   Total distributed: ${totalDistributed} chips`);
  console.log(`${prefix}   Winners: [${Array.from(winnerIds).map(id => {
    const p = table.players.find(pl => pl.id === id);
    return p ? p.name : id;
  }).join(', ')}]`);
  console.log(`${prefix} Final stacks:`);
  table.players.forEach(p => {
    const marker = p.isWinner ? ' ★ WINNER' : '';
    console.log(`${prefix}   - ${p.name}: ${p.stack}${marker}`);
  });

  // Sanity check
  if (totalDistributed !== table.pot && pots.length > 0) {
    console.error(`${prefix} WARNING: Distributed ${totalDistributed} but table pot was ${table.pot}`);
  }

  console.log(`${prefix} ╔════════════════════════════════════════════════════════════╗`);
  console.log(`${prefix} ║                  END DISTRIBUTE POTS                       ║`);
  console.log(`${prefix} ╚════════════════════════════════════════════════════════════╝`);

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
  const prefix = logPrefix(table);

  console.log(`${prefix} ╔════════════════════════════════════════════════════════════╗`);
  console.log(`${prefix} ║                    END HAND BY FOLD                        ║`);
  console.log(`${prefix} ╚════════════════════════════════════════════════════════════╝`);
  console.log(`${prefix} Pot: ${table.pot}, Street: ${table.currentStreet}`);

  // Log all player states
  console.log(`${prefix} All players:`);
  table.players.forEach((p, i) => {
    console.log(`${prefix}   [${i}] ${formatPlayerState(p)} | isInHand: ${isPlayerInHand(p)}`);
  });

  const playersInHand = table.players.filter(p => isPlayerInHand(p));
  console.log(`${prefix} Players still in hand: [${playersInHand.map(p => p.name).join(', ')}] (${playersInHand.length})`);

  if (playersInHand.length !== 1) {
    console.error(`${prefix} ERROR: Expected 1 player in hand, found ${playersInHand.length}`);
    throw new Error(`Expected 1 player in hand, found ${playersInHand.length}`);
  }

  const winner = playersInHand[0];
  const oldStack = winner.stack;
  console.log(`${prefix} Winner by fold: ${winner.name}`);
  console.log(`${prefix} AWARD: ${winner.name} +${table.pot} (${oldStack} -> ${oldStack + table.pot})`);

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

  console.log(`${prefix} ╔════════════════════════════════════════════════════════════╗`);
  console.log(`${prefix} ║                END HAND BY FOLD COMPLETE                   ║`);
  console.log(`${prefix} ╚════════════════════════════════════════════════════════════╝`);

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
