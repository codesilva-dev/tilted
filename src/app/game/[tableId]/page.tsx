'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useGameSocket } from './use-game-socket';

// Generate unique player ID for this browser tab
// Uses sessionStorage so each tab gets its own ID (important for incognito testing)
function getOrCreatePlayerId(): string {
  if (typeof window === 'undefined') return 'temp-id';

  const key = 'poker-player-id';
  let playerId = sessionStorage.getItem(key);

  if (!playerId) {
    playerId = `player-${crypto.randomUUID()}`;
    sessionStorage.setItem(key, playerId);
  }

  return playerId;
}

// Generate random player name
// Uses sessionStorage so each tab gets its own name (important for incognito testing)
function getOrCreatePlayerName(): string {
  if (typeof window === 'undefined') return 'Player';

  const key = 'poker-player-name';
  let playerName = sessionStorage.getItem(key);

  if (!playerName) {
    const adjectives = ['Lucky', 'Bold', 'Clever', 'Sharp', 'Cool', 'Wild', 'Smooth', 'Quick'];
    const nouns = ['Shark', 'Ace', 'King', 'Joker', 'Maverick', 'Bluffer', 'Pro', 'Dealer'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    playerName = `${adj} ${noun}`;
    sessionStorage.setItem(key, playerName);
  }

  return playerName;
}

export default function GamePage({ params }: { params: Promise<{ tableId: string }> }) {
  // Unwrap the params promise (Next.js 15+ requirement)
  const { tableId } = use(params);

  // Generate stable player identity for this tab
  const [playerId, setPlayerId] = useState<string>('temp-id');
  const [playerName, setPlayerName] = useState<string>('Player');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setPlayerId(getOrCreatePlayerId());
    setPlayerName(getOrCreatePlayerName());
    setIsClient(true);
  }, []);

  const { gameState, isConnected, error, startHand, takeAction } = useGameSocket({
    tableId,
    playerId,
    playerName,
    buyIn: 1000
  });

  // Don't connect until we have a valid player ID from localStorage
  if (!isClient || !isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl">Connecting to server...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-2">Connection Error</h1>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-pulse text-4xl mb-4">🎰</div>
          <p className="text-xl">Loading game...</p>
        </div>
      </div>
    );
  }

  const currentPlayer = gameState.players.find(p => p.id === playerId);
  const activePlayer = gameState.players.find(p => p.seatPosition === gameState.activePlayerPosition);
  const isMyTurn = activePlayer?.id === playerId;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-8 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <span className="text-3xl">♠</span>
            <h1 className="text-2xl font-bold">Tilted</h1>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/" className="text-gray-300 hover:text-white transition-colors">
              Home
            </Link>
            <Link href="/lobby" className="text-gray-300 hover:text-white transition-colors">
              Lobby
            </Link>
            <div className="text-sm text-gray-400">
              Playing as: <span className="text-white font-semibold">{playerName}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-8">
        {/* Table Header */}
        <div className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-4xl font-bold mb-2">Table {tableId}</h2>
              <div className="flex gap-4 text-sm">
                <span className="bg-green-600 px-3 py-1 rounded">Connected</span>
                <span className="text-gray-400">
                  {gameState.players.length} players
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Game Info */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-1">Pot</div>
            <div className="text-3xl font-bold">${gameState.pot}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-1">Street</div>
            <div className="text-3xl font-bold capitalize">{gameState.currentStreet}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-1">Current Bet</div>
            <div className="text-3xl font-bold">${gameState.currentBet}</div>
          </div>
        </div>

        {/* Community Cards */}
        {gameState.communityCards.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Community Cards</h2>
            <div className="flex gap-3">
              {gameState.communityCards.map((card, i) => (
                <div
                  key={i}
                  className="bg-white text-black rounded-lg p-4 w-20 h-28 flex flex-col items-center justify-center text-2xl font-bold shadow-lg"
                >
                  <div className={card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-red-600' : 'text-black'}>
                    {card.rank}
                  </div>
                  <div className="text-sm mt-1">
                    {card.suit === 'hearts' && '♥'}
                    {card.suit === 'diamonds' && '♦'}
                    {card.suit === 'clubs' && '♣'}
                    {card.suit === 'spades' && '♠'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Players */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">Players</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {gameState.players.map((player) => {
              const isDealer = player.seatPosition === gameState.dealerPosition;
              const isSB = player.seatPosition === gameState.smallBlindPosition;
              const isBB = player.seatPosition === gameState.bigBlindPosition;
              const isActive = player.seatPosition === gameState.activePlayerPosition;

              const isYou = player.id === playerId;

              return (
                <div
                  key={player.id}
                  className={`bg-gray-800 rounded-lg p-4 ${isActive ? 'ring-2 ring-yellow-500' : ''} ${isYou ? 'ring-2 ring-cyan-500' : ''}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-bold">
                        {player.name}
                        {isYou && <span className="ml-2 text-cyan-400 text-sm">(YOU)</span>}
                      </div>
                      <div className="text-xs text-gray-400">Seat {player.seatPosition}</div>
                    </div>
                    <div className="flex gap-1">
                      {isDealer && <span className="bg-blue-600 px-2 py-1 rounded text-xs">D</span>}
                      {isSB && <span className="bg-green-600 px-2 py-1 rounded text-xs">SB</span>}
                      {isBB && <span className="bg-red-600 px-2 py-1 rounded text-xs">BB</span>}
                    </div>
                  </div>

                  <div className="text-2xl font-bold text-green-400 mb-2">
                    ${player.stack}
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className={`px-2 py-1 rounded ${
                      player.status === 'active' ? 'bg-green-600' :
                      player.status === 'folded' ? 'bg-red-600' :
                      player.status === 'all-in' ? 'bg-yellow-600' :
                      'bg-gray-600'
                    }`}>
                      {player.status}
                    </span>
                    <span className="text-gray-400">
                      Bet: ${player.currentBet}
                    </span>
                  </div>

                  {/* Show hole cards for current player */}
                  {player.id === playerId && player.holeCards.length > 0 && (
                    <div className="mt-3 flex gap-2">
                      {player.holeCards.map((card, i) => (
                        <div
                          key={i}
                          className="bg-white text-black rounded p-2 w-14 h-20 flex flex-col items-center justify-center text-lg font-bold shadow"
                        >
                          <div className={card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-red-600' : 'text-black'}>
                            {card.rank}
                          </div>
                          <div className="text-xs mt-1">
                            {card.suit === 'hearts' && '♥'}
                            {card.suit === 'diamonds' && '♦'}
                            {card.suit === 'clubs' && '♣'}
                            {card.suit === 'spades' && '♠'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Actions</h2>

          {gameState.players.length < 2 && (
            <div className="text-gray-400 mb-4">
              Waiting for more players to join...
            </div>
          )}

          {/* Hand completed - show start next hand button */}
          {gameState.currentStreet === 'showdown' && (
            <div className="space-y-4">
              <div className="bg-green-900/50 border border-green-500 rounded-lg p-4 mb-4">
                <h3 className="text-green-400 font-bold text-xl mb-3">🎉 Hand Complete!</h3>

                {/* Show all players' hole cards during showdown */}
                <div className="space-y-2 mb-4">
                  {gameState.players
                    .filter(p => p.holeCards.length > 0)
                    .map(player => (
                      <div key={player.id} className="text-sm">
                        <span className="font-semibold text-white">{player.name}:</span>
                        <span className="ml-2 text-gray-300">
                          {player.holeCards.map(card => `${card.rank}${
                            card.suit === 'hearts' ? '♥' :
                            card.suit === 'diamonds' ? '♦' :
                            card.suit === 'clubs' ? '♣' : '♠'
                          }`).join(' ')}
                        </span>
                      </div>
                    ))}
                </div>

                <p className="text-gray-300 text-sm">Check player stacks to see who won. Winners have been paid out.</p>
              </div>
              <button
                onClick={startHand}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg w-full"
              >
                Start Next Hand
              </button>
            </div>
          )}

          {/* Initial state - start first hand */}
          {gameState.currentStreet === 'pre-flop' && gameState.communityCards.length === 0 && (
            <button
              onClick={startHand}
              disabled={gameState.players.length < 2}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg mb-4 w-full"
            >
              Start Hand
            </button>
          )}

          {isMyTurn && currentPlayer?.status === 'active' && gameState.currentStreet !== 'showdown' && (() => {
            const amountToCall = gameState.currentBet - (currentPlayer?.currentBet || 0);
            const canCheck = amountToCall === 0;
            const minRaise = gameState.currentBet === 0 ? 20 : gameState.currentBet * 2; // Minimum raise is 2x current bet

            return (
              <div className="space-y-4">
                <div className="text-yellow-400 font-bold mb-2">
                  Your turn!
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => takeAction({ type: 'fold', playerId })}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg"
                  >
                    Fold
                  </button>

                  {canCheck ? (
                    <button
                      onClick={() => takeAction({ type: 'check', playerId })}
                      className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg"
                    >
                      Check
                    </button>
                  ) : (
                    <button
                      onClick={() => takeAction({ type: 'call', playerId })}
                      className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg"
                    >
                      Call ${amountToCall}
                    </button>
                  )}

                  <button
                    onClick={() => {
                      const promptText = gameState.currentBet === 0
                        ? `Enter bet amount (min $${minRaise}):`
                        : `Enter raise amount (min $${minRaise}, current bet is $${gameState.currentBet}):`;
                      const amount = prompt(promptText);
                      if (amount && !isNaN(+amount)) {
                        const numAmount = +amount;
                        if (numAmount < minRaise) {
                          alert(`Minimum ${gameState.currentBet === 0 ? 'bet' : 'raise'} is $${minRaise}`);
                          return;
                        }
                        takeAction({
                          type: gameState.currentBet === 0 ? 'bet' : 'raise',
                          playerId,
                          amount: numAmount
                        });
                      }
                    }}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-6 rounded-lg col-span-2"
                  >
                    {gameState.currentBet === 0 ? 'Bet' : 'Raise'}
                  </button>
                </div>
              </div>
            );
          })()}

          {!isMyTurn && gameState.communityCards.length > 0 && gameState.currentStreet !== 'showdown' && (
            <div className="text-gray-400 text-center py-4">
              Waiting for {activePlayer?.name || 'other player'} to act...
            </div>
          )}
        </div>

        {/* Debug Info */}
        <div className="mt-8 text-xs text-gray-500">
          <details>
            <summary className="cursor-pointer hover:text-gray-300">Debug Info</summary>
            <pre className="mt-2 bg-gray-900 p-4 rounded overflow-auto max-h-96">
              {JSON.stringify(gameState, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
