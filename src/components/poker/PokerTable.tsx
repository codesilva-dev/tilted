'use client';

import { useState } from 'react';
import { TableState, Player } from '@/game/types/game-state';

interface PokerTableProps {
  gameState: TableState;
  currentPlayerId: string;
  onTakeSeat: (seatPosition: number, buyIn: number) => void;
  availableSeats: number[];
  isSpectator: boolean;
  activePlayerId?: string | null;
  timeRemaining?: number;
}

// ============================================
// SEAT POSITION CONFIGURATION
// ============================================
// This config makes it easy to adjust seat positions around the table.
// Each seat has x, y coordinates as percentages (0-100) from top-left corner.
// You can fine-tune these values to match the visual table image perfectly.

interface SeatConfig {
  x: number;        // Horizontal position (0-100, where 50 is center)
  y: number;        // Vertical position (0-100, where 50 is center)
  offsetX?: number; // Optional pixel offset for fine-tuning
  offsetY?: number; // Optional pixel offset for fine-tuning
}

// Generate seat positions in a circle mathematically, then you can adjust individual seats
const generateCircularPositions = (
  totalSeats: number,
  centerX: number = 50,
  centerY: number = 50,
  radiusX: number = 40,  // Horizontal radius (%)
  radiusY: number = 45,  // Vertical radius (%)
  startAngle: number = -90 // Start at top (-90 degrees)
): Record<number, SeatConfig> => {
  const positions: Record<number, SeatConfig> = {};
  const angleStep = 360 / totalSeats;

  for (let i = 0; i < totalSeats; i++) {
    const seatNumber = i + 1;
    const angle = (startAngle + angleStep * i) * (Math.PI / 180); // Convert to radians

    positions[seatNumber] = {
      x: centerX + radiusX * Math.cos(angle),
      y: centerY + radiusY * Math.sin(angle),
      offsetX: 0,
      offsetY: 0
    };
  }

  return positions;
};

// Seat configuration - adjust these values to position seats perfectly
const SEAT_CONFIG: Record<number, SeatConfig> = {
  // Auto-generate circular positions, then add manual adjustments
  ...generateCircularPositions(9),

  // Manual adjustments per seat (optional - uncomment to override)
  1: { x: 50, y: 15, offsetX: 0, offsetY: 0 },   // Top
  2: { x: 76, y: 17, offsetX: 0, offsetY: 0 },  // Top-right
  3: { x: 93, y: 42, offsetX: 0, offsetY: 0 },  // Right
  4: { x: 88, y: 75, offsetX: 0, offsetY: 0 },  // Bottom-right
  5: { x: 62, y: 85, offsetX: 0, offsetY: 0 },  // Bottom-right-center
  6: { x: 38, y: 85, offsetX: 0, offsetY: 0 },  // Bottom
  7: { x: 12, y: 75, offsetX: 0, offsetY: 0 },  // Bottom-left-center
  8: { x: 7, y: 42, offsetX: 0, offsetY: 0 },  // Bottom-left
  9: { x: 24, y: 17, offsetX: 0, offsetY: 0 },  // Left
};

// Convert seat config to CSS positioning
const getSeatPosition = (seatNumber: number): React.CSSProperties => {
  const config = SEAT_CONFIG[seatNumber];
  if (!config) return {};

  return {
    left: `${config.x}%`,
    top: `${config.y}%`,
    transform: `translate(-50%, -50%) translate(${config.offsetX || 0}px, ${config.offsetY || 0}px)`,
  };
};

// Buy-in Modal Component
interface BuyInModalProps {
  seatPosition: number;
  onConfirm: (buyIn: number) => void;
  onCancel: () => void;
  minBuyIn?: number;
  maxBuyIn?: number;
}

function BuyInModal({ seatPosition, onConfirm, onCancel, minBuyIn = 1000, maxBuyIn = 10000 }: BuyInModalProps) {
  const [buyInAmount, setBuyInAmount] = useState(Math.floor((minBuyIn + maxBuyIn) / 2));

  const presetAmounts = [
    { label: 'Min', value: minBuyIn },
    { label: '$2,500', value: 2500 },
    { label: '$5,000', value: 5000 },
    { label: 'Max', value: maxBuyIn },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-700">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">💰</div>
          <h2 className="text-2xl font-bold text-white">Take Seat {seatPosition}</h2>
          <p className="text-gray-400 text-sm mt-1">Choose your buy-in amount</p>
        </div>

        {/* Buy-in Amount Display */}
        <div className="bg-gray-900/50 rounded-xl p-4 mb-6">
          <div className="text-center">
            <div className="text-sm text-gray-400 mb-1">Buy-in Amount</div>
            <div className="text-4xl font-bold text-green-400">
              ${buyInAmount.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Slider */}
        <div className="mb-6">
          <input
            type="range"
            min={minBuyIn}
            max={maxBuyIn}
            step={100}
            value={buyInAmount}
            onChange={(e) => setBuyInAmount(Number(e.target.value))}
            className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>${minBuyIn.toLocaleString()}</span>
            <span>${maxBuyIn.toLocaleString()}</span>
          </div>
        </div>

        {/* Preset Buttons */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {presetAmounts.map((preset) => (
            <button
              key={preset.label}
              onClick={() => setBuyInAmount(preset.value)}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                buyInAmount === preset.value
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(buyInAmount)}
            className="flex-1 py-3 px-4 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors"
          >
            Sit Down
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PokerTable({
  gameState,
  currentPlayerId,
  onTakeSeat,
  availableSeats,
  isSpectator,
  activePlayerId,
  timeRemaining
}: PokerTableProps) {
  const TOTAL_SEATS = 9; // Always 9 seats

  // Buy-in modal state
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

  const handleSeatClick = (seatPosition: number) => {
    if (!availableSeats.includes(seatPosition)) return;
    setSelectedSeat(seatPosition);
  };

  const handleBuyInConfirm = (buyIn: number) => {
    if (selectedSeat !== null) {
      onTakeSeat(selectedSeat, buyIn);
      setSelectedSeat(null);
    }
  };

  const handleBuyInCancel = () => {
    setSelectedSeat(null);
  };

  const getSeatPlayer = (seatPosition: number): Player | undefined => {
    return gameState.players.find(p => p.seatPosition === seatPosition);
  };

  const renderSeat = (seatPosition: number) => {
    const player = getSeatPlayer(seatPosition);
    const isAvailable = availableSeats.includes(seatPosition);
    const isCurrentPlayer = player?.id === currentPlayerId;
    const isDealer = player && player.seatPosition === gameState.dealerPosition;
    const isSB = player && player.seatPosition === gameState.smallBlindPosition;
    const isBB = player && player.seatPosition === gameState.bigBlindPosition;
    // Use props.activePlayerId to avoid ReferenceError
    const isActive = player && player.id === (typeof activePlayerId !== 'undefined' ? activePlayerId : null);

    const position = getSeatPosition(seatPosition);

    return (
      <div
        key={seatPosition}
        className="absolute"
        style={position}
      >
        {player ? (
          // Occupied seat
          <div
            className={`
              bg-gray-800 rounded-lg p-3 w-40 shadow-lg
              ${isActive ? 'ring-2 ring-yellow-500' : ''}
              ${isCurrentPlayer ? 'ring-2 ring-cyan-500' : ''}
            `}
          >
            <div className="flex justify-between items-start mb-1">
              <div className="text-xs font-bold">
                <span className="truncate block max-w-[70px]">{player.name}</span>
                {isCurrentPlayer && <span className="text-cyan-400 text-[10px]">(YOU)</span>}
                {player.isWinner && (
                  <span className="ml-1 text-yellow-400">👑</span>
                )}
              </div>
              <div className="flex gap-1">
                {isDealer && <span className="bg-blue-600 px-1 rounded text-xs">D</span>}
                {isSB && <span className="bg-green-600 px-1 rounded text-xs">SB</span>}
                {isBB && <span className="bg-red-600 px-1 rounded text-xs">BB</span>}
              </div>
            </div>

            <div className="text-lg font-bold text-green-400">
              ${player.stack}
            </div>

            <div className="flex justify-between text-xs mt-1">
              <span className={`px-1 rounded ${
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

            {/* Show hole cards */}
            {player.holeCards.length > 0 && (() => {
              // Check if this is a TRUE showdown (2+ non-folded players)
              // Cards are only revealed at true showdowns, not when someone wins by fold
              const nonFoldedPlayers = gameState.players.filter(p =>
                p.status !== 'folded' && p.holeCards.length > 0
              );
              const isTrueShowdown = gameState.currentStreet === 'showdown' && nonFoldedPlayers.length >= 2;

              // Determine if this player's cards should be shown
              // - Current player always sees their own cards
              // - At TRUE showdown: show non-folded players' cards, hide folded players' cards
              // - Win by fold: only winner sees their own cards, no one else's cards revealed
              const shouldShowCards = isCurrentPlayer ||
                (isTrueShowdown && player.status !== 'folded');

              return (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {shouldShowCards
                      ? player.holeCards.map((card, i) => (
                          <div
                            key={i}
                            className="bg-white text-black rounded p-1 w-10 h-14 flex flex-col items-center justify-center font-bold shadow"
                          >
                            <div className={`text-lg leading-tight ${card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-red-600' : 'text-black'}`}>
                              {card.rank}
                            </div>
                            <div className={card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-red-600 text-xl leading-none' : 'text-black text-xl leading-none'}>
                              {card.suit === 'hearts' && '♥'}
                              {card.suit === 'diamonds' && '♦'}
                              {card.suit === 'clubs' && '♣'}
                              {card.suit === 'spades' && '♠'}
                            </div>
                          </div>
                        ))
                      : player.holeCards.map((_, i) => (
                          <div
                            key={i}
                            className="bg-gradient-to-br from-blue-600 to-blue-800 rounded p-1 w-10 h-14 flex items-center justify-center text-xs font-bold shadow border border-blue-400"
                          >
                            <div className="text-white opacity-50">🂠</div>
                          </div>
                        ))
                    }
                  </div>
                {/* Timer bar for active player */}
                {isActive && typeof timeRemaining === 'number' && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 bg-gray-700 rounded-full h-2 w-16">
                      <div
                        className={`h-2 rounded-full transition-all duration-1000 ${
                          timeRemaining > 15 ? 'bg-green-500' :
                          timeRemaining > 5 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${(timeRemaining / 30) * 100}%` }}
                      />
                    </div>
                    <div className={`text-xs font-bold min-w-[24px] text-right ${
                      timeRemaining > 15 ? 'text-green-400' :
                      timeRemaining > 5 ? 'text-yellow-400' :
                      'text-red-400 animate-pulse'
                    }`}>
                      {timeRemaining}s
                    </div>
                  </div>
                )}

                {/* Show hand ranking at true showdown (not win by fold) */}
                {isTrueShowdown && player.handRank && player.status !== 'folded' && (
                  <div className={`mt-1 text-xs font-semibold text-center ${
                    player.isWinner ? 'text-yellow-400' : 'text-gray-400'
                  }`}>
                    {player.handRank.description}
                  </div>
                )}

                {/* Show leaving indicator at showdown */}
                {gameState.currentStreet === 'showdown' && player.isLeaving && (
                  <div className="mt-1 text-xs font-semibold text-center text-orange-400">
                    ⚠️ Leaving
                  </div>
                )}
              </div>
              );
            })()}
          </div>
        ) : isSpectator ? (
          // Empty seat - show only to spectators
          isAvailable ? (
            <button
              onClick={() => handleSeatClick(seatPosition)}
              className="bg-gray-700/80 hover:bg-gray-600 border-2 border-dashed border-gray-500 rounded-lg p-3 w-32 shadow-lg transition-colors cursor-pointer"
            >
              <div className="text-sm text-gray-400 text-center">
                Seat {seatPosition}
              </div>
              <div className="text-xs text-green-400 text-center mt-1">
                Click to Sit
              </div>
            </button>
          ) : (
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 w-32 shadow-lg opacity-50">
              <div className="text-sm text-gray-600 text-center">
                Seat {seatPosition}
              </div>
            </div>
          )
        ) : null /* Hide empty seats when player is seated */}
      </div>
    );
  };

  return (
    <>
      {/* Buy-in Modal */}
      {selectedSeat !== null && (
        <BuyInModal
          seatPosition={selectedSeat}
          onConfirm={handleBuyInConfirm}
          onCancel={handleBuyInCancel}
          minBuyIn={1000}
          maxBuyIn={10000}
        />
      )}

      <div className="relative w-full max-w-[1000px] mx-auto aspect-[16/10] shadow-2xl">
        {/* Table background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/table.jpg)' }}
        >
        {/* Overlay container for seats and cards */}
        <div className="absolute inset-0">
        {/* Center area - Community cards and pot */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
          {/* Pot */}
          <div className="mb-4">
            <div className="text-sm text-gray-300">Pot</div>
            <div className="text-3xl font-bold text-yellow-400">${gameState.pot}</div>
          </div>

          {/* Community Cards */}
          {gameState.communityCards.length > 0 && (
            <div className="flex gap-2 justify-center">
              {gameState.communityCards.map((card, i) => (
                <div
                  key={i}
                  className="bg-white text-black rounded-lg p-2 w-16 h-22 flex flex-col items-center justify-center text-xl font-bold shadow-lg"
                >
                  <div className={card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-red-600' : 'text-black'}>
                    {card.rank}
                  </div>
                  <div className={card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-red-600 text-2xl mt-1 leading-none' : 'text-black text-2xl mt-1 leading-none'}>
                    {card.suit === 'hearts' && '♥'}
                    {card.suit === 'diamonds' && '♦'}
                    {card.suit === 'clubs' && '♣'}
                    {card.suit === 'spades' && '♠'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Street indicator */}
          <div className="mt-2 text-sm text-gray-300 capitalize">
            {gameState.currentStreet}
          </div>
        </div>

        {/* Render all seats (1-9) */}
        {Array.from({ length: TOTAL_SEATS }, (_, i) => renderSeat(i + 1))}
        </div>
      </div>
      </div>
    </>
  );
}
