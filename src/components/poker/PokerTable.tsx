'use client';

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

  const handleSeatClick = (seatPosition: number) => {
    if (!availableSeats.includes(seatPosition)) return;

    const buyIn = prompt(`Enter buy-in amount (min: 1000, max: 5000):`);
    if (buyIn && !isNaN(+buyIn)) {
      onTakeSeat(seatPosition, +buyIn);
    }
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
            {player.holeCards.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {isCurrentPlayer || gameState.currentStreet === 'showdown'
                    ? (
                        // Show actual cards for current player or at showdown (but not if folded)
                        (gameState.currentStreet === 'showdown' && player.status === 'folded')
                          ? player.holeCards.map((_, i) => (
                              <div
                                key={i}
                                className="bg-gradient-to-br from-blue-600 to-blue-800 rounded p-1 w-10 h-14 flex items-center justify-center text-xs font-bold shadow border border-blue-400"
                              >
                                <div className="text-white opacity-50">🂠</div>
                              </div>
                            ))
                          : player.holeCards.map((card, i) => (
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
                      )
                    : (
                        // Hide all cards if not showdown and not current player
                        player.holeCards.map((_, i) => (
                          <div
                            key={i}
                            className="bg-gradient-to-br from-blue-600 to-blue-800 rounded p-1 w-10 h-14 flex items-center justify-center text-xs font-bold shadow border border-blue-400"
                          >
                            <div className="text-white opacity-50">🂠</div>
                          </div>
                        ))
                      )}
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

                {/* Show hand ranking at showdown */}
                {gameState.currentStreet === 'showdown' && player.handRank && (
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
            )}
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
  );
}
