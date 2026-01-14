'use client';

import { use, useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGameSocketV2 } from './use-game-socket';
import { useActionTimer } from './use-action-timer';
import PokerTable from '@/components/poker/PokerTable';

// Generate unique player ID for this browser tab
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
  const { tableId } = use(params);
  const router = useRouter();

  const [playerId, setPlayerId] = useState<string>('temp-id');
  const [playerName, setPlayerName] = useState<string>('Player');
  const [isClient, setIsClient] = useState(false);
  const [isLeavingSeat, setIsLeavingSeat] = useState(false);

  useEffect(() => {
    setPlayerId(getOrCreatePlayerId());
    setPlayerName(getOrCreatePlayerName());
    setIsClient(true);
  }, []);

  const {
    gameState,
    isConnected,
    isSeated,
    availableSeats,
    error,
    takeSeat,
    leaveSeat,
    leaveRoom,
    startHand,
    takeAction
  } = useGameSocketV2({
    tableId,
    playerId,
    playerName
  });

  // Calculate derived state (safe with optional chaining)
  const currentPlayer = gameState?.players.find(p => p.id === playerId);
  const activePlayer = gameState?.players.find(p => p.seatPosition === gameState.activePlayerPosition);
  const isMyTurn = activePlayer?.id === playerId;

  // Auto-action when timer runs out
  const handleTimeout = useCallback(() => {
    if (!gameState || !currentPlayer || !isMyTurn || currentPlayer.status !== 'active') return;

    const amountToCall = gameState.currentBet - (currentPlayer.currentBet || 0);
    const canCheck = amountToCall === 0;

    // Auto-check if possible, otherwise auto-fold
    if (canCheck) {
      takeAction({ type: 'check', playerId });
    } else {
      takeAction({ type: 'fold', playerId });
    }
  }, [gameState, currentPlayer, isMyTurn, takeAction, playerId]);

  // Action timer - 30 seconds to act
  const { timeRemaining } = useActionTimer({
    isMyTurn: isMyTurn || false,
    isActive: (currentPlayer?.status === 'active' && gameState?.currentStreet !== 'showdown') || false,
    onTimeout: handleTimeout,
    timeLimit: 30
  });

  // Handle standing up (leave seat)
  const handleLeaveSeat = useCallback(() => {
    if (isLeavingSeat) return; // Prevent double-clicks
    setIsLeavingSeat(true);
    leaveSeat();
  }, [leaveSeat, isLeavingSeat]);

  // Reset leaving seat state when player becomes unseated
  useEffect(() => {
    if (!isSeated && isLeavingSeat) {
      setIsLeavingSeat(false);
    }
  }, [isSeated, isLeavingSeat]);

  // Handle leaving the table
  const handleLeaveTable = useCallback(() => {
    leaveRoom();
    router.push('/lobby');
  }, [leaveRoom, router]);

  // Auto-advance after showdown (10 second countdown)
  // Only non-leaving players run the countdown to avoid duplicate startHand calls
  const [showdownCountdown, setShowdownCountdown] = useState<number | null>(null);
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing timer
    if (autoAdvanceTimerRef.current) {
      clearInterval(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }

    // Start countdown if at showdown, seated, and NOT leaving
    // Players marked as leaving shouldn't trigger startHand
    const isLeaving = currentPlayer?.isLeaving ?? false;
    if (gameState?.currentStreet === 'showdown' && isSeated && !isLeaving) {
      setShowdownCountdown(10);

      autoAdvanceTimerRef.current = setInterval(() => {
        setShowdownCountdown((prev) => {
          if (prev === null || prev <= 1) {
            // Time's up - try to start next hand (removes leaving players)
            if (autoAdvanceTimerRef.current) {
              clearInterval(autoAdvanceTimerRef.current);
              autoAdvanceTimerRef.current = null;
            }
            startHand();
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (autoAdvanceTimerRef.current) {
          clearInterval(autoAdvanceTimerRef.current);
        }
      };
    } else {
      setShowdownCountdown(null);
    }
  }, [gameState?.currentStreet, isSeated, currentPlayer?.isLeaving, startHand]);

  // Early returns AFTER all hooks
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
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-400">
                Playing as: <span className="text-white font-semibold">{playerName}</span>
                {isSeated && <span className="ml-2 text-green-400">• Seated</span>}
                {!isSeated && <span className="ml-2 text-yellow-400">• Spectating</span>}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-8">
        {/* Table Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h2 className="text-4xl font-bold mb-2">Table {tableId}</h2>
            <div className="flex gap-4 text-sm">
              <span className="bg-green-600 px-3 py-1 rounded">Connected</span>
              <span className="text-gray-400">
                {gameState.players.length} players seated
              </span>
              <span className="text-gray-400">
                Street: <span className="capitalize">{gameState.currentStreet}</span>
              </span>
            </div>
          </div>

          {/* Leave Seat / Leave Room buttons */}
          <div className="flex gap-3">
            {isSeated && !currentPlayer?.isLeaving && (
              <button
                onClick={handleLeaveSeat}
                disabled={isLeavingSeat}
                className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                {isLeavingSeat ? 'Standing Up...' : 'Stand Up'}
              </button>
            )}
            {isSeated && currentPlayer?.isLeaving && (
              <div className="bg-orange-600 text-white font-bold py-2 px-4 rounded-lg">
                Leaving after hand...
              </div>
            )}
            <button
              onClick={handleLeaveTable}
              disabled={currentPlayer?.isLeaving}
              className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Leave Table
            </button>
          </div>
        </div>

        {/* Spectator Notice */}
        {!isSeated && (
          <div className="bg-blue-900/50 border border-blue-500 rounded-lg p-4 mb-8">
            <h3 className="text-blue-400 font-bold mb-2">👀 Spectating</h3>
            <p className="text-gray-300">
              You're currently watching the game. Click on an empty seat to join the action!
            </p>
          </div>
        )}

        {/* Poker Table */}
        <div className="mb-8">
          <PokerTable
            gameState={gameState}
            currentPlayerId={playerId}
            onTakeSeat={takeSeat}
            availableSeats={availableSeats}
            isSpectator={!isSeated}
          />
        </div>

        {/* Actions Panel */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Actions</h2>

          {/* Not seated - show info */}
          {!isSeated && (
            <div className="text-gray-400 text-center py-4">
              Take a seat to start playing!
            </div>
          )}

          {/* Seated but waiting for players */}
          {isSeated && gameState.players.length < 2 && (
            <div className="text-gray-400 mb-4">
              Waiting for more players to join...
            </div>
          )}

          {/* Hand completed - show countdown */}
          {isSeated && gameState.currentStreet === 'showdown' && (
            <div className="space-y-4">
              <div className="bg-green-900/50 border border-green-500 rounded-lg p-4 mb-4">
                <h3 className="text-green-400 font-bold text-xl mb-3">🎉 Hand Complete!</h3>

                {/* Show winners */}
                {gameState.players
                  .filter(p => p.isWinner)
                  .map(player => (
                    <div key={player.id} className="text-lg mb-2">
                      <span className="text-yellow-400">👑 </span>
                      <span className="font-bold text-white">{player.name}</span>
                      <span className="text-green-400"> wins!</span>
                      {player.handRank && (
                        <span className="ml-2 text-sm text-gray-300">
                          ({player.handRank.description})
                        </span>
                      )}
                    </div>
                  ))}

                <p className="text-gray-300 text-sm mt-3">Check the table to see all hands and updated stacks.</p>
              </div>

              {/* Countdown - always shown at showdown */}
              {showdownCountdown !== null && (
                <div className="bg-blue-900/50 border border-blue-500 rounded-lg p-4 text-center">
                  <div className="text-blue-400 text-sm mb-1">
                    {gameState.players.filter(p => !p.isLeaving).length >= 2
                      ? 'Next hand starting in'
                      : 'Cleaning up in'}
                  </div>
                  <div className="text-4xl font-bold text-white">{showdownCountdown}s</div>
                  {gameState.players.filter(p => !p.isLeaving).length < 2 && (
                    <p className="text-gray-400 text-sm mt-2">Waiting for another player after cleanup...</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Initial state - start first hand */}
          {isSeated &&
           gameState.currentStreet === 'pre-flop' &&
           gameState.communityCards.length === 0 &&
           gameState.activePlayerPosition === null && (
            <>
              {gameState.players.length === 1 && (
                <div className="bg-yellow-900/50 border border-yellow-500 rounded-lg p-4 mb-4 text-center">
                  <p className="text-yellow-400 font-bold">⏳ Waiting for another player to join...</p>
                  <p className="text-gray-300 text-sm mt-2">You need at least 2 players to start the game.</p>
                </div>
              )}
              <button
                onClick={startHand}
                disabled={gameState.players.length < 2}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg mb-4 w-full"
              >
                {gameState.handNumber === 0 ? 'Start Game' : 'Start Hand'}
              </button>
            </>
          )}

          {/* Player's turn - show action buttons */}
          {isSeated && isMyTurn && currentPlayer?.status === 'active' && gameState.currentStreet !== 'showdown' && (() => {
            const amountToCall = gameState.currentBet - (currentPlayer?.currentBet || 0);
            const canCheck = amountToCall === 0;
            const minRaise = gameState.currentBet === 0 ? 20 : gameState.currentBet * 2;

            return (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-yellow-400 font-bold">
                    Your turn!
                  </div>
                  <div className={`
                    text-2xl font-bold px-4 py-2 rounded-lg
                    ${timeRemaining > 15 ? 'bg-green-600 text-white' :
                      timeRemaining > 5 ? 'bg-yellow-600 text-white' :
                      'bg-red-600 text-white animate-pulse'}
                  `}>
                    {timeRemaining}s
                  </div>
                </div>

                {/* Timer progress bar */}
                <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-1000 ${
                      timeRemaining > 15 ? 'bg-green-500' :
                      timeRemaining > 5 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${(timeRemaining / 30) * 100}%` }}
                  />
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

          {/* Waiting for other player */}
          {isSeated && !isMyTurn && gameState.communityCards.length > 0 && gameState.currentStreet !== 'showdown' && (
            <div className="text-gray-400 text-center py-4">
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                <span>Waiting for {activePlayer?.name || 'other player'} to act...</span>
              </div>
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
