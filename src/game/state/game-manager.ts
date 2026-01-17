import { TableState, Player, Street, GameAction, getNextActivePlayer, getNextOccupiedPosition } from "../types/game-state";
import { Card, dealCards } from "../core/cards";


export function postBlinds(table: TableState): TableState {
  const newTable = { ...table };
  newTable.players = [...table.players];

  // Find small blind player
  const sbPlayer = newTable.players.find(p => p.seatPosition === newTable.smallBlindPosition);
  // Find big blind player
  const bbPlayer = newTable.players.find(p => p.seatPosition === newTable.bigBlindPosition);

  if (!sbPlayer || !bbPlayer) {
    throw new Error('Small blind or big blind player not found');
  }

  // Post small blind (may be partial if player is short-stacked)
  const sbAmount = Math.min(sbPlayer.stack, newTable.smallBlind);
  sbPlayer.stack -= sbAmount;
  sbPlayer.currentBet = sbAmount;
  sbPlayer.totalBetInHand = sbAmount;
  // Mark as all-in if they couldn't afford the full blind
  if (sbPlayer.stack === 0) {
    sbPlayer.status = 'all-in';
  }

  // Post big blind (may be partial if player is short-stacked)
  const bbAmount = Math.min(bbPlayer.stack, newTable.bigBlind);
  bbPlayer.stack -= bbAmount;
  bbPlayer.currentBet = bbAmount;
  bbPlayer.totalBetInHand = bbAmount;
  // Mark as all-in if they couldn't afford the full blind
  if (bbPlayer.stack === 0) {
    bbPlayer.status = 'all-in';
  }

  // Update pot and current bet
  newTable.pot = sbAmount + bbAmount;
  newTable.currentBet = bbAmount;

  return newTable;
}

export function dealHoleCards(table: TableState): TableState {
  const newTable = { ...table };
  newTable.players = table.players.map(p => ({ ...p }));

  let deck = [...table.deck];

  // Deal 2 cards to each player
  for (const player of newTable.players) {
    if (player.status === 'waiting' || player.status === 'sitting-out') {
      continue;
    }

    const { dealt, remaining } = dealCards(deck, 2);
    player.holeCards = dealt;
    deck = remaining;
  }

  newTable.deck = deck;
  return newTable;
}

export function dealFlop(table: TableState): TableState {
  if (table.currentStreet !== 'pre-flop') {
    throw new Error('Can only deal flop from pre-flop');
  }

  // Burn one card, then deal 3
  const { dealt, remaining } = dealCards(table.deck, 4); // Burn 1 + deal 3
  const flopCards = dealt.slice(1); // Skip burn card

  return {
    ...table,
    communityCards: flopCards,
    deck: remaining,
    currentStreet: 'flop',
    currentBet: 0, // Reset current bet for new street
    lastRaiseAmount: table.bigBlind, // Reset to big blind for new street
    players: table.players.map(p => ({
      ...p,
      currentBet: 0, // Reset current bet for new street
      hasActed: false // Reset acted flag
    }))
  };
}

export function dealTurn(table: TableState): TableState {
  if (table.currentStreet !== 'flop') {
    throw new Error('Can only deal turn from flop');
  }

  // Burn one card, then deal 1
  const { dealt, remaining } = dealCards(table.deck, 2); // Burn 1 + deal 1
  const turnCard = dealt[1]; // Skip burn card

  return {
    ...table,
    communityCards: [...table.communityCards, turnCard],
    deck: remaining,
    currentStreet: 'turn',
    currentBet: 0,
    lastRaiseAmount: table.bigBlind, // Reset to big blind for new street
    players: table.players.map(p => ({
      ...p,
      currentBet: 0,
      hasActed: false
    }))
  };
}

export function dealRiver(table: TableState): TableState {
  if (table.currentStreet !== 'turn') {
    throw new Error('Can only deal river from turn');
  }

  // Burn one card, then deal 1
  const { dealt, remaining } = dealCards(table.deck, 2); // Burn 1 + deal 1
  const riverCard = dealt[1]; // Skip burn card

  return {
    ...table,
    communityCards: [...table.communityCards, riverCard],
    deck: remaining,
    currentStreet: 'river',
    currentBet: 0,
    lastRaiseAmount: table.bigBlind, // Reset to big blind for new street
    players: table.players.map(p => ({
      ...p,
      currentBet: 0,
      hasActed: false
    }))
  };
}

export function processAction(table: TableState, action: GameAction): TableState {
  const newTable = { ...table };
  newTable.players = table.players.map(p => ({ ...p }));

  const player = newTable.players.find(p => p.id === action.playerId);
  if (!player) {
    throw new Error(`Player ${action.playerId} not found`);
  }

  if (player.seatPosition !== table.activePlayerPosition) {
    throw new Error('It is not this player\'s turn');
  }

  switch (action.type) {
    case 'fold':
      player.status = 'folded';
      player.hasActed = true;
      break;

    case 'check':
      if (newTable.currentBet > player.currentBet) {
        throw new Error('Cannot check when there is a bet to call');
      }
      player.hasActed = true;
      break;

    case 'call': {
      const callAmount = newTable.currentBet - player.currentBet;
      if (callAmount <= 0) {
        throw new Error('Nothing to call');
      }

      const actualAmount = Math.min(callAmount, player.stack);
      player.stack -= actualAmount;
      player.currentBet += actualAmount;
      player.totalBetInHand += actualAmount;
      newTable.pot += actualAmount;
      player.hasActed = true;

      // If player is all-in
      if (player.stack === 0) {
        player.status = 'all-in';
      }
      break;
    }

    case 'bet': {
      if (newTable.currentBet > 0) {
        throw new Error('Cannot bet when there is already a bet (use raise)');
      }
      if (!action.amount) {
        throw new Error('Bet amount is required');
      }

      const betAmount = Math.min(action.amount, player.stack);
      player.stack -= betAmount;
      player.currentBet = betAmount;
      player.totalBetInHand += betAmount;
      newTable.pot += betAmount;
      newTable.currentBet = betAmount;
      newTable.lastRaiseAmount = betAmount; // Track the bet size
      player.hasActed = true;

      // Mark other active players as not acted (they need to respond)
      newTable.players.forEach(p => {
        if (p.id !== player.id && p.status === 'active') {
          p.hasActed = false;
        }
      });

      if (player.stack === 0) {
        player.status = 'all-in';
      }
      break;
    }

    case 'raise': {
      if (newTable.currentBet === 0) {
        throw new Error('Cannot raise when there is no bet (use bet)');
      }
      if (!action.amount) {
        throw new Error('Raise amount is required');
      }

      const previousBet = newTable.currentBet;

      // Amount should be the NEW total bet (not the raise amount)
      const totalBet = Math.min(action.amount, player.stack + player.currentBet);
      const additionalAmount = totalBet - player.currentBet;
      const raiseSize = totalBet - previousBet; // Size of the raise

      player.stack -= additionalAmount;
      player.currentBet = totalBet;
      player.totalBetInHand += additionalAmount;
      newTable.pot += additionalAmount;
      newTable.currentBet = totalBet;
      newTable.lastRaiseAmount = raiseSize; // Track the raise size
      player.hasActed = true;

      // Mark other active players as not acted (they need to respond)
      newTable.players.forEach(p => {
        if (p.id !== player.id && p.status === 'active') {
          p.hasActed = false;
        }
      });

      if (player.stack === 0) {
        player.status = 'all-in';
      }
      break;
    }

    case 'all-in': {
      const allInAmount = player.stack;
      const previousBet = newTable.currentBet;

      player.stack = 0;
      player.currentBet += allInAmount;
      player.totalBetInHand += allInAmount;
      newTable.pot += allInAmount;
      player.status = 'all-in';
      player.hasActed = true;

      // Update current bet if this all-in is higher
      if (player.currentBet > newTable.currentBet) {
        const raiseSize = player.currentBet - previousBet;
        newTable.currentBet = player.currentBet;
        newTable.lastRaiseAmount = raiseSize; // Track the raise size

        // Mark other active players as not acted
        newTable.players.forEach(p => {
          if (p.id !== player.id && p.status === 'active') {
            p.hasActed = false;
          }
        });
      }
      break;
    }
  }

  // Find next active player
  const nextPlayer = getNextActivePlayer(player.seatPosition, newTable);
  newTable.activePlayerPosition = nextPlayer ? nextPlayer.seatPosition : null;

  return newTable;
}

export function isBettingRoundComplete(table: TableState): boolean {
  const activePlayers = table.players.filter(p => p.status === 'active');

  // If no active players, betting is complete
  if (activePlayers.length === 0) {
    return true;
  }

  // If only one player in hand (others folded), betting is complete
  const playersInHand = table.players.filter(p => p.status === 'active' || p.status === 'all-in');
  if (playersInHand.length <= 1) {
    return true;
  }

  // If only one active player and all others are all-in, check if betting is complete
  if (activePlayers.length === 1) {
    const allInPlayers = table.players.filter(p => p.status === 'all-in');
    if (allInPlayers.length > 0 && activePlayers.length + allInPlayers.length === playersInHand.length) {
      const activePlayer = activePlayers[0];
      // Only auto-complete if active player has already matched the current bet
      // (This handles "run out the board" on later streets where currentBet=0)
      // If they haven't matched (e.g., someone just went all-in), they need to respond
      if (activePlayer.currentBet >= table.currentBet) {
        return true;
      }
    }
  }

  // All active players must have acted
  if (activePlayers.some(p => !p.hasActed)) {
    return false;
  }

  // All active players must have matched the current bet
  if (activePlayers.some(p => p.currentBet < table.currentBet)) {
    return false;
  }

  return true;
}

export function advanceToNextStreet(table: TableState): TableState {
  if (!isBettingRoundComplete(table)) {
    throw new Error('betting round not complete');
  }

  // Collect all current bets into pot (already in pot, just reset currentBet)
  const newTable = {
    ...table,
    players: table.players.map(p => ({
      ...p,
      currentBet: 0,
      hasActed: false
    })),
    currentBet: 0,
    lastRaiseAmount: table.bigBlind // Reset to big blind for new street
  };

  // Determine next street
  let nextStreet: Street;
  switch (table.currentStreet) {
    case 'pre-flop':
      nextStreet = 'flop';
      break;
    case 'flop':
      nextStreet = 'turn';
      break;
    case 'turn':
      nextStreet = 'river';
      break;
    case 'river':
      nextStreet = 'showdown';
      break;
    case 'showdown':
      throw new Error('Cannot advance from showdown');
  }

  newTable.currentStreet = nextStreet;

  // Set first active player for new street (small blind position, or next occupied)
  if (nextStreet !== 'showdown') {
    const firstPlayer = getNextActivePlayer(
      table.dealerPosition, // Start from dealer, will wrap to small blind
      newTable
    );
    newTable.activePlayerPosition = firstPlayer ? firstPlayer.seatPosition : null;
  } else {
    newTable.activePlayerPosition = null;
  }

  return newTable;
}

export function resetForNextHand(table: TableState): TableState {
  // Rotate dealer button to next occupied position
  const nextDealer = getNextOccupiedPosition(table.dealerPosition, table.players, 10);
  if (nextDealer === null) {
    throw new Error('Cannot start new hand - no players');
  }

  const newDealerPos = nextDealer;
  const sbPos = getNextOccupiedPosition(newDealerPos, table.players, 10);
  const bbPos = sbPos !== null ? getNextOccupiedPosition(sbPos, table.players, 10) : null;

  if (sbPos === null || bbPos === null) {
    throw new Error('Not enough players for blinds');
  }

  return {
    ...table,
    players: table.players.map(p => ({
      ...p,
      holeCards: [],
      status: 'waiting',
      currentBet: 0,
      totalBetInHand: 0,
      hasActed: false
    })),
    dealerPosition: newDealerPos,
    smallBlindPosition: sbPos,
    bigBlindPosition: bbPos,
    currentStreet: 'pre-flop',
    communityCards: [],
    pot: 0,
    currentBet: 0,
    lastRaiseAmount: table.bigBlind, // Reset to big blind for new hand
    activePlayerPosition: null,
    deck: [], // Will be set when starting hand
    handStartedAt: new Date(),
    handNumber: table.handNumber + 1
  };
}

export function startNewHand(table: TableState, deck: Card[]): TableState {
  // Set all players to active status (if they have chips)
  let newTable: TableState = {
    ...table,
    deck,
    players: table.players.map(p => ({
      ...p,
      status: p.stack > 0 ? 'active' : 'sitting-out'
    }))
  };

  // Post blinds
  newTable = postBlinds(newTable);

  // Deal hole cards
  newTable = dealHoleCards(newTable);

  // Set first player to act (position after big blind)
  const firstPlayer = getNextActivePlayer(newTable.bigBlindPosition, newTable);
  newTable.activePlayerPosition = firstPlayer ? firstPlayer.seatPosition : null;

  return newTable;
}
