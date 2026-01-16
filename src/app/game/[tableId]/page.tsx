'use client';

import { use, useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
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

// Generate random fallback player name
function generateRandomName(): string {
  const adjectives = ['Lucky', 'Bold', 'Clever', 'Sharp', 'Cool', 'Wild', 'Smooth', 'Quick'];
  const nouns = ['Shark', 'Ace', 'King', 'Joker', 'Maverick', 'Bluffer', 'Pro', 'Dealer'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
}

// Get player name - prefer auth name, fallback to random
function getOrCreatePlayerName(authName?: string | null): string {
  if (typeof window === 'undefined') return 'Player';

  // If we have an auth name, extract first name and use it
  if (authName) {
    const firstName = authName.split(' ')[0];
    return firstName;
  }

  // Fallback to cached random name
  const key = 'poker-player-name';
  let playerName = sessionStorage.getItem(key);
  if (!playerName) {
    playerName = generateRandomName();
    sessionStorage.setItem(key, playerName);
  }
  return playerName;
}

export default function GamePage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = use(params);
  const router = useRouter();
  const { data: session } = useSession();

  const [playerId, setPlayerId] = useState<string>('temp-id');
  const [playerName, setPlayerName] = useState<string>('Player');
  const [isClient, setIsClient] = useState(false);
  const [isLeavingSeat, setIsLeavingSeat] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState<number>(0);

  // Game log for live feed
  interface GameLogEntry {
    id: string;
    type: 'action' | 'street' | 'winner' | 'system';
    message: string;
    timestamp: Date;
  }
  const [gameLog, setGameLog] = useState<GameLogEntry[]>([]);
  const gameLogRef = useRef<HTMLDivElement>(null);

  const addLogEntry = useCallback((type: GameLogEntry['type'], message: string) => {
    setGameLog(prev => [...prev.slice(-50), { // Keep last 50 entries
      id: crypto.randomUUID(),
      type,
      message,
      timestamp: new Date()
    }]);
  }, []);

  // Get player name from auth session (first name) or fallback to random
  useEffect(() => {
    setPlayerId(getOrCreatePlayerId());
    setPlayerName(getOrCreatePlayerName(session?.user?.name));
    setIsClient(true);
  }, [session?.user?.name]);

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

  // Wrapper for takeAction that also logs the action
  type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';
  const takeActionWithLog = useCallback((action: { type: ActionType; playerId: string; amount?: number }) => {
    const player = gameState?.players.find(p => p.id === action.playerId);
    const name = player?.name || 'Player';

    let logMessage = '';
    switch (action.type) {
      case 'fold':
        logMessage = `${name} folds`;
        break;
      case 'check':
        logMessage = `${name} checks`;
        break;
      case 'call':
        logMessage = `${name} calls`;
        break;
      case 'bet':
        logMessage = `${name} bets $${action.amount}`;
        break;
      case 'raise':
        logMessage = `${name} raises to $${action.amount}`;
        break;
    }

    if (logMessage) {
      addLogEntry('action', logMessage);
    }

    takeAction(action);
  }, [gameState?.players, takeAction, addLogEntry]);

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

  // Action timer - 30 seconds to act (runs for all players to see the countdown)
  const { timeRemaining } = useActionTimer({
    isMyTurn: isMyTurn || false,
    activePlayerPosition: gameState?.activePlayerPosition ?? null,
    onTimeout: handleTimeout,
    timeLimit: 30
  });

  // Calculate betting constraints
  // For raise: amount is the NEW TOTAL BET, so max is stack + currentBet
  const minRaise = gameState?.currentBet === 0 ? (gameState?.bigBlind || 20) : (gameState?.currentBet || 0) * 2;
  const maxRaise = (currentPlayer?.stack || 0) + (currentPlayer?.currentBet || 0);

  // Reset raise amount to minimum when it becomes player's turn
  useEffect(() => {
    if (isMyTurn && currentPlayer?.status === 'active') {
      setRaiseAmount(minRaise);
    }
  }, [isMyTurn, currentPlayer?.status, minRaise]);

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

  // Track game state changes for the log
  const prevStreetRef = useRef<string | null>(null);
  const prevActivePlayerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gameState) return;

    // Track street changes
    if (prevStreetRef.current && prevStreetRef.current !== gameState.currentStreet) {
      if (gameState.currentStreet === 'flop') {
        addLogEntry('street', '--- Flop dealt ---');
      } else if (gameState.currentStreet === 'turn') {
        addLogEntry('street', '--- Turn dealt ---');
      } else if (gameState.currentStreet === 'river') {
        addLogEntry('street', '--- River dealt ---');
      } else if (gameState.currentStreet === 'showdown') {
        // Check if this is a TRUE showdown (2+ non-folded players)
        const nonFoldedPlayers = gameState.players.filter(p =>
          p.status !== 'folded' && p.holeCards.length > 0
        );
        const isTrueShowdown = nonFoldedPlayers.length >= 2;

        if (isTrueShowdown) {
          addLogEntry('street', '--- Showdown ---');
          // Log all non-folded hands (sorted by winner first)
          nonFoldedPlayers
            .sort((a, b) => (b.isWinner ? 1 : 0) - (a.isWinner ? 1 : 0))
            .forEach(player => {
              const cards = player.holeCards.map(c =>
                `${c.rank}${c.suit === 'hearts' ? '♥' : c.suit === 'diamonds' ? '♦' : c.suit === 'clubs' ? '♣' : '♠'}`
              ).join(' ');
              const hand = player.handRank?.description || '';
              const value = player.handRank?.value || 0;

              if (player.isWinner) {
                addLogEntry('winner', `👑 ${player.name}: ${cards} - ${hand} [${value}]`);
              } else {
                addLogEntry('action', `   ${player.name}: ${cards} - ${hand} [${value}]`);
              }
            });
        } else {
          // Win by fold - just show winner, no cards
          const winners = gameState.players.filter(p => p.isWinner);
          winners.forEach(winner => {
            addLogEntry('winner', `👑 ${winner.name} wins by fold!`);
          });
        }
      }
    }
    prevStreetRef.current = gameState.currentStreet;

    // Track when action changes to a new player
    if (gameState.activePlayerPosition !== null &&
        prevActivePlayerRef.current !== gameState.activePlayerPosition) {
      const activePlayer = gameState.players.find(p => p.seatPosition === gameState.activePlayerPosition);
      if (activePlayer && prevActivePlayerRef.current !== null) {
        // Only log if this is a player change, not initial deal
      }
    }
    prevActivePlayerRef.current = gameState.activePlayerPosition;
  }, [gameState, addLogEntry]);

  // Auto-scroll game log
  useEffect(() => {
    if (gameLogRef.current) {
      gameLogRef.current.scrollTop = gameLogRef.current.scrollHeight;
    }
  }, [gameLog]);

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
            <h2 className="text-4xl font-bold mb-2">{gameState.name || tableId}</h2>
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
            activePlayerId={gameState.activePlayerPosition != null ? (gameState.players.find(p => p.seatPosition === gameState.activePlayerPosition)?.id ?? null) : null}
            timeRemaining={timeRemaining}
          />
        </div>

        {/* Bottom Panel - Game Log + Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Game Log - Left Side */}
          <div className="lg:col-span-1 bg-gray-800/80 backdrop-blur rounded-xl border border-gray-700/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700/50 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <h3 className="text-sm font-semibold text-gray-300">Live Feed</h3>
            </div>
            <div
              ref={gameLogRef}
              className="h-48 lg:h-64 overflow-y-auto p-3 space-y-1 text-sm scrollbar-thin scrollbar-thumb-gray-600"
            >
              {gameLog.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  Game events will appear here...
                </div>
              ) : (
                gameLog.map(entry => (
                  <div
                    key={entry.id}
                    className={`py-1 px-2 rounded ${
                      entry.type === 'winner' ? 'bg-yellow-900/30 text-yellow-400' :
                      entry.type === 'street' ? 'text-blue-400 font-medium' :
                      entry.type === 'system' ? 'text-gray-500 italic' :
                      'text-gray-300'
                    }`}
                  >
                    {entry.message}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Actions Panel - Right Side */}
          <div className="lg:col-span-2 bg-gray-800/80 backdrop-blur rounded-xl border border-gray-700/50 p-4">
            {/* Not seated */}
            {!isSeated && (
              <div className="text-gray-400 text-center py-8">
                <span className="text-2xl mb-2 block">🎯</span>
                Take a seat to start playing!
              </div>
            )}

            {/* Waiting for players */}
            {isSeated && gameState.players.length < 2 && gameState.currentStreet !== 'showdown' && (
              <div className="text-center py-6">
                <div className="animate-pulse text-yellow-400 text-lg font-medium">
                  ⏳ Waiting for players...
                </div>
                <p className="text-gray-500 text-sm mt-2">Need at least 2 players</p>
              </div>
            )}

            {/* Hand complete - show different UI for true showdown vs win by fold */}
            {isSeated && gameState.currentStreet === 'showdown' && (() => {
              // Check if this is a TRUE showdown (2+ non-folded players)
              const nonFoldedPlayers = gameState.players.filter(p =>
                p.status !== 'folded' && p.holeCards.length > 0
              );
              const isTrueShowdown = nonFoldedPlayers.length >= 2;
              const winners = gameState.players.filter(p => p.isWinner);

              if (!isTrueShowdown) {
                // Win by fold - simple display, no cards revealed
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {winners.map(winner => (
                          <div key={winner.id} className="flex items-center gap-2 bg-green-900/40 px-4 py-3 rounded-lg border border-green-600/50">
                            <span className="text-yellow-400 text-xl">👑</span>
                            <span className="font-bold text-white text-lg">{winner.name}</span>
                            <span className="text-green-400">wins by fold!</span>
                          </div>
                        ))}
                      </div>
                      {showdownCountdown !== null && (
                        <div className="flex items-center gap-2 text-blue-400">
                          <span className="text-sm">Next hand in</span>
                          <span className="text-2xl font-bold">{showdownCountdown}s</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // True showdown - detailed hand results
              return (
                <div className="space-y-3">
                  {/* Header with countdown */}
                  <div className="flex items-center justify-between border-b border-gray-700 pb-2">
                    <h3 className="text-lg font-bold text-white">Showdown Results</h3>
                    {showdownCountdown !== null && (
                      <div className="flex items-center gap-2 text-blue-400">
                        <span className="text-sm">Next hand in</span>
                        <span className="text-2xl font-bold">{showdownCountdown}s</span>
                      </div>
                    )}
                  </div>

                  {/* All players' hands - only show non-folded players' cards */}
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {gameState.players
                      .filter(p => p.holeCards.length > 0)
                      .sort((a, b) => (b.isWinner ? 1 : 0) - (a.isWinner ? 1 : 0))
                      .map(player => {
                        const isWinner = player.isWinner;
                        const isFolded = player.status === 'folded';
                        const showCards = !isFolded; // Only show cards for non-folded players

                        return (
                          <div
                            key={player.id}
                            className={`flex items-center justify-between p-2 rounded-lg ${
                              isWinner ? 'bg-green-900/40 border border-green-600/50' :
                              isFolded ? 'bg-gray-800/40 opacity-60' :
                              'bg-gray-800/40'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Winner indicator */}
                              <span className="w-6 text-center">
                                {isWinner ? '👑' : isFolded ? '🃏' : ''}
                              </span>

                              {/* Player name */}
                              <span className={`font-semibold ${isWinner ? 'text-green-400' : 'text-white'}`}>
                                {player.name}
                                {player.id === playerId && <span className="text-cyan-400 text-xs ml-1">(You)</span>}
                              </span>

                              {/* Hole cards - only for non-folded players */}
                              {showCards ? (
                                <div className="flex gap-1">
                                  {player.holeCards.map((card, i) => (
                                    <span
                                      key={i}
                                      className={`text-sm font-mono px-1 rounded ${
                                        card.suit === 'hearts' || card.suit === 'diamonds'
                                          ? 'text-red-400 bg-gray-700'
                                          : 'text-white bg-gray-700'
                                      }`}
                                    >
                                      {card.rank}{card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠'}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-sm text-gray-500 italic">Folded</span>
                              )}

                              {/* Hand description - only for non-folded */}
                              {player.handRank && showCards && (
                                <span className={`text-sm ${isWinner ? 'text-green-300' : 'text-gray-400'}`}>
                                  {player.handRank.description}
                                </span>
                              )}
                            </div>

                            {/* Stack change indicator */}
                            <div className="text-right">
                              {isWinner && (
                                <span className="text-green-400 font-bold">Won</span>
                              )}
                              {!isWinner && !isFolded && (
                                <span className="text-red-400 text-sm">Lost</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Hand value debug info (collapsible) - only for true showdown */}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-500 hover:text-gray-400">
                      Hand Values (Debug)
                    </summary>
                    <div className="mt-1 bg-gray-900/50 p-2 rounded text-gray-400 font-mono space-y-2">
                      <div className="text-gray-500">
                        Board: {gameState.communityCards.map(c =>
                          `${c.rank}${c.suit === 'hearts' ? '♥' : c.suit === 'diamonds' ? '♦' : c.suit === 'clubs' ? '♣' : '♠'}`
                        ).join(' ')}
                      </div>
                      {gameState.players
                        .filter(p => p.handRank && p.status !== 'folded')
                        .sort((a, b) => (b.handRank?.value || 0) - (a.handRank?.value || 0))
                        .map(p => {
                          const cardsUsed = p.handRank?.cards?.map(c =>
                            `${c.rank}${c.suit === 'hearts' ? '♥' : c.suit === 'diamonds' ? '♦' : c.suit === 'clubs' ? '♣' : '♠'}`
                          ).join(' ') || 'N/A';
                          return (
                            <div key={p.id} className={p.isWinner ? 'text-green-400' : ''}>
                              <div>{p.isWinner ? '👑 ' : '   '}{p.name}:</div>
                              <div className="ml-4">Hole: {p.holeCards.map(c =>
                                `${c.rank}${c.suit === 'hearts' ? '♥' : c.suit === 'diamonds' ? '♦' : c.suit === 'clubs' ? '♣' : '♠'}`
                              ).join(' ')}</div>
                              <div className="ml-4">Best 5: {cardsUsed}</div>
                              <div className="ml-4">Hand: {p.handRank?.description}</div>
                              <div className="ml-4">Value: {p.handRank?.value}</div>
                            </div>
                          );
                        })}
                    </div>
                  </details>
                </div>
              );
            })()}

            {/* Start hand button */}
            {isSeated &&
             gameState.currentStreet === 'pre-flop' &&
             gameState.communityCards.length === 0 &&
             gameState.activePlayerPosition === null &&
             gameState.players.length >= 2 && (
              <div className="text-center py-4">
                <button
                  onClick={startHand}
                  className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-3 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all"
                >
                  {gameState.handNumber === 0 ? '🎮 Start Game' : '▶️ Start Hand'}
                </button>
              </div>
            )}

            {/* Player's turn - compact action buttons */}
            {isSeated && isMyTurn && currentPlayer?.status === 'active' && gameState.currentStreet !== 'showdown' && (() => {
              const amountToCall = gameState.currentBet - (currentPlayer?.currentBet || 0);
              const canCheck = amountToCall === 0;
              const isBet = gameState.currentBet === 0;
              const effectiveMax = Math.max(minRaise, maxRaise);

              return (
                <div className="space-y-3">
                  {/* Action buttons row */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => takeActionWithLog({ type: 'fold', playerId })}
                      className="flex-1 bg-red-600/80 hover:bg-red-600 text-white font-semibold py-3 rounded-lg transition-all"
                    >
                      Fold
                    </button>

                    {canCheck ? (
                      <button
                        onClick={() => takeActionWithLog({ type: 'check', playerId })}
                        className="flex-1 bg-gray-600/80 hover:bg-gray-600 text-white font-semibold py-3 rounded-lg transition-all"
                      >
                        Check
                      </button>
                    ) : (
                      <button
                        onClick={() => takeActionWithLog({ type: 'call', playerId })}
                        className="flex-1 bg-green-600/80 hover:bg-green-600 text-white font-semibold py-3 rounded-lg transition-all"
                      >
                        Call ${amountToCall}
                      </button>
                    )}

                    <button
                      onClick={() => takeActionWithLog({
                        type: isBet ? 'bet' : 'raise',
                        playerId,
                        amount: raiseAmount
                      })}
                      disabled={raiseAmount < minRaise || raiseAmount > maxRaise}
                      className="flex-1 bg-yellow-500/90 hover:bg-yellow-500 disabled:bg-gray-600 text-black font-semibold py-3 rounded-lg transition-all"
                    >
                      {raiseAmount >= maxRaise ? 'All In' : isBet ? 'Bet' : 'Raise'} ${raiseAmount}
                    </button>
                  </div>

                  {/* Slider row */}
                  <div className="flex items-center gap-3 bg-gray-700/30 rounded-lg p-3">
                    <span className="text-xs text-gray-500 w-12">${minRaise}</span>
                    <input
                      type="range"
                      min={minRaise}
                      max={effectiveMax}
                      step={gameState.bigBlind || 20}
                      value={raiseAmount}
                      onChange={(e) => setRaiseAmount(Number(e.target.value))}
                      className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                    />
                    <span className="text-xs text-gray-500 w-16 text-right">${effectiveMax}</span>
                  </div>

                  {/* Quick buttons */}
                  <div className="flex gap-2">
                    {[
                      { label: 'Min', value: minRaise },
                      { label: '½ Pot', value: Math.max(minRaise, Math.min(Math.floor((gameState.pot || 0) * 0.5), effectiveMax)) },
                      { label: 'Pot', value: Math.max(minRaise, Math.min(gameState.pot || minRaise, effectiveMax)) },
                      { label: 'All In', value: effectiveMax, highlight: true }
                    ].map(btn => (
                      <button
                        key={btn.label}
                        onClick={() => setRaiseAmount(btn.value)}
                        className={`flex-1 py-2 text-xs font-medium rounded transition-all ${
                          btn.highlight
                            ? 'bg-yellow-600/80 hover:bg-yellow-600 text-white'
                            : 'bg-gray-700/50 hover:bg-gray-700 text-gray-300'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Waiting for opponent */}
            {isSeated && !isMyTurn && gameState.activePlayerPosition !== null && gameState.currentStreet !== 'showdown' && (
              <div className="flex items-center justify-center gap-3 py-6 text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
                <span>Waiting for {activePlayer?.name || 'opponent'}...</span>
              </div>
            )}
          </div>
        </div>

        {/* Debug Info - collapsed */}
        <details className="mt-4 text-xs text-gray-600">
          <summary className="cursor-pointer hover:text-gray-400">Debug</summary>
          <pre className="mt-2 bg-gray-900/50 p-3 rounded-lg overflow-auto max-h-48 text-[10px]">
            {JSON.stringify(gameState, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
