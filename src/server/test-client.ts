/**
 * Simple test client for Socket.IO server
 *
 * Usage:
 *   ts-node src/server/test-client.ts
 *
 * This simulates a player connecting to a table and taking actions.
 */

import { log } from '../util/log';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';
const TABLE_ID = 'test-table-1';

// Player configurations
const players = [
  { id: 'player-1', name: 'Alice', buyIn: 1000 },
  { id: 'player-2', name: 'Bob', buyIn: 1000 },
  { id: 'player-3', name: 'Charlie', buyIn: 1000 }
];

// Store socket connections
const sockets: Socket[] = [];

/**
 * Setup a player connection
 */
function setupPlayer(playerId: string, playerName: string, buyIn: number): Socket {
  const socket = io(SERVER_URL);

  socket.on('connect', () => {
    log(`\n[${playerName}] Connected to server`);

    // Join table
    socket.emit('join-table', {
      tableId: TABLE_ID,
      playerId,
      playerName,
      buyIn
    });
  });

  socket.on('game-state', (data) => {
    log(`\n[${playerName}] Received game state`);
    log(`  Players: ${data.table.players.map((p: any) => p.name).join(', ')}`);
    log(`  Pot: ${data.table.pot}`);
    log(`  Street: ${data.table.currentStreet}`);
    log(`  Active player: ${data.table.activePlayerPosition}`);
  });

  socket.on('player-joined', (data) => {
    log(`\n[${playerName}] Player joined: ${data.playerName} at seat ${data.seatPosition}`);
  });

  socket.on('hand-started', () => {
    log(`\n[${playerName}] Hand started!`);
  });

  socket.on('blinds-posted', (data) => {
    log(`\n[${playerName}] Blinds posted`);
    const sb = data.table.players.find((p: any) => p.seatPosition === data.table.smallBlindPosition);
    const bb = data.table.players.find((p: any) => p.seatPosition === data.table.bigBlindPosition);
    log(`  SB: ${sb?.name} (${data.table.smallBlind})`);
    log(`  BB: ${bb?.name} (${data.table.bigBlind})`);
  });

  socket.on('cards-dealt', (data) => {
    log(`\n[${playerName}] Cards dealt`);
    const player = data.table.players.find((p: any) => p.id === playerId);
    if (player && player.holeCards.length > 0) {
      log(`  My cards: ${player.holeCards.map((c: any) => `${c.rank}${c.suit[0]}`).join(' ')}`);
    }
  });

  socket.on('action-processed', (data) => {
    log(`\n[${playerName}] Action: ${data.action.playerId} ${data.action.type}${data.action.amount ? ` ${data.action.amount}` : ''}`);
  });

  socket.on('street-changed', (data) => {
    log(`\n[${playerName}] Street changed to: ${data.street}`);
    if (data.table.communityCards.length > 0) {
      log(`  Board: ${data.table.communityCards.map((c: any) => `${c.rank}${c.suit[0]}`).join(' ')}`);
    }
  });

  socket.on('hand-completed', (data) => {
    log(`\n[${playerName}] Hand completed!`);
    log(`  Total distributed: ${data.result.totalDistributed}`);
    data.result.potResults.forEach((potResult: any, i: number) => {
      log(`  Pot ${i + 1} (${potResult.pot.amount} chips):`);
      potResult.winners.forEach((winner: any) => {
        log(`    Winner: ${winner.playerId} (${winner.amountWon} chips) - ${winner.handRank.type}`);
      });
    });
  });

  socket.on('join-error', (data) => {
    console.error(`\n[${playerName}] Join error: ${data.message}`);
  });

  socket.on('action-error', (data) => {
    console.error(`\n[${playerName}] Action error: ${data.message}`);
  });

  socket.on('game-error', (data) => {
    console.error(`\n[${playerName}] Game error: ${data.message}`);
  });

  socket.on('disconnect', () => {
    log(`\n[${playerName}] Disconnected from server`);
  });

  return socket;
}

/**
 * Main test flow
 */
async function runTest() {
  log('╔═══════════════════════════════════════════════════════╗');
  log('║     Poker Socket.IO Test Client                      ║');
  log(`║     Testing server at: ${SERVER_URL.padEnd(29)} ║`);
  log('╚═══════════════════════════════════════════════════════╝\n');

  // Connect all players
  log('>>> Connecting players...');
  for (const player of players) {
    const socket = setupPlayer(player.id, player.name, player.buyIn);
    sockets.push(socket);
    await sleep(500); // Stagger connections
  }

  // Wait for all players to join
  await sleep(2000);

  log('\n>>> Starting hand...');
  sockets[0].emit('start-hand', { tableId: TABLE_ID });

  // Wait for hand to start
  await sleep(2000);

  log('\n>>> Simulating actions...');

  // Simulate some basic actions
  // Note: This is a simple test - actual actions depend on game state
  await sleep(1000);
  sockets[0].emit('player-action', {
    tableId: TABLE_ID,
    action: {
      type: 'call',
      playerId: 'player-1',
      timestamp: new Date()
    }
  });

  await sleep(1000);
  sockets[1].emit('player-action', {
    tableId: TABLE_ID,
    action: {
      type: 'call',
      playerId: 'player-2',
      timestamp: new Date()
    }
  });

  await sleep(1000);
  sockets[2].emit('player-action', {
    tableId: TABLE_ID,
    action: {
      type: 'check',
      playerId: 'player-3',
      timestamp: new Date()
    }
  });

  // Keep alive for a while to see results
  log('\n>>> Waiting for game events... (Press Ctrl+C to exit)');
}

/**
 * Helper: sleep for ms milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Cleanup on exit
 */
process.on('SIGINT', () => {
  log('\n\n>>> Cleaning up...');
  sockets.forEach(socket => socket.close());
  log('>>> Disconnected all players');
  process.exit(0);
});

// Run the test
runTest().catch(console.error);
