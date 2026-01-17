'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { TableState, GameAction } from '@/game/types/game-state';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

// Ping the server's HTTP health endpoint every 5 minutes to prevent Render spin-down
// Render free tier spins down after 15 mins of no HTTP activity (WebSocket doesn't count)
function startHttpKeepAlive(url: string): () => void {
  const healthUrl = url.replace(/\/$/, '') + '/health';

  const ping = () => {
    fetch(healthUrl, { method: 'GET', mode: 'cors' })
      .then(res => console.log('[KeepAlive] Health ping:', res.status))
      .catch(err => console.log('[KeepAlive] Health ping failed:', err.message));
  };

  // Ping immediately, then every 5 minutes
  ping();
  const interval = setInterval(ping, 5 * 60 * 1000);

  return () => clearInterval(interval);
}

interface UseGameSocketOptions {
  tableId: string;
  playerId: string;
  playerName: string;
}

interface UseGameSocketReturn {
  gameState: TableState | null;
  isConnected: boolean;
  isSeated: boolean;
  availableSeats: number[];
  error: string | null;
  tableNotFound: boolean; // True when server restarted and table is gone
  joinRoom: () => void;
  takeSeat: (seatPosition: number, buyIn: number) => void;
  leaveSeat: () => void;
  leaveRoom: () => void;
  startHand: () => void;
  takeAction: (action: Omit<GameAction, 'timestamp'>) => void;
  disconnect: () => void;
}

export function useGameSocketV2(options: UseGameSocketOptions): UseGameSocketReturn {
  const { tableId, playerId, playerName } = options;

  const [gameState, setGameState] = useState<TableState | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isSeated, setIsSeated] = useState<boolean>(false);
  const [availableSeats, setAvailableSeats] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tableNotFound, setTableNotFound] = useState<boolean>(false);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    console.log('[Socket] Connecting to', SOCKET_URL);

    // Start HTTP keep-alive to prevent Render from spinning down
    const stopKeepAlive = startHttpKeepAlive(SOCKET_URL);

    const socket = io(SOCKET_URL, {
      // Allow both transports with websocket preferred - polling is fallback if websocket fails
      transports: ['websocket', 'polling'],
      // Reconnection settings - more aggressive for cloud hosting
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      // Timeout for connection attempts
      timeout: 20000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected!', socket.recovered ? '(recovered)' : '(fresh)');
      setIsConnected(true);
      setError(null);

      // Auto-join room when connected (works for both fresh and recovered connections)
      socket.emit('join-room', { tableId, playerId, playerName });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected, reason:', reason);
      setIsConnected(false);

      // If the server forcefully disconnected us, try to reconnect
      if (reason === 'io server disconnect') {
        socket.connect();
      }
      // For other reasons (transport close, ping timeout), Socket.IO auto-reconnects
    });

    // Manager-level reconnection events
    socket.io.on('reconnect', (attemptNumber) => {
      console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
    });

    socket.io.on('reconnect_attempt', (attemptNumber) => {
      console.log('[Socket] Reconnection attempt', attemptNumber);
    });

    socket.io.on('reconnect_error', (error) => {
      console.error('[Socket] Reconnection error:', error.message);
    });

    socket.io.on('reconnect_failed', () => {
      console.error('[Socket] Failed to reconnect after all attempts');
      setError('Lost connection to server. Please refresh the page.');
    });

    socket.on('connect_error', (err: Error) => {
      console.error('[Socket] Connection error:', err.message);
      setError(`Connection failed: ${err.message}`);
      setIsConnected(false);
    });

    // Game state events
    socket.on('game-state', (data: { table: TableState }) => {
      console.log('[Socket] Game state received');
      setGameState(data.table);

      // Check if we're seated
      const seated = data.table.players.some(p => p.id === playerId);
      setIsSeated(seated);
    });

    socket.on('seats-available', (data: { availableSeats: number[]; occupiedSeats: number[] }) => {
      console.log('[Socket] Seats available:', data.availableSeats);
      setAvailableSeats(data.availableSeats);
    });

    socket.on('spectator-joined', (data: { playerId: string; playerName: string; spectatorCount: number }) => {
      console.log('[Socket] Spectator joined:', data.playerName);
    });

    socket.on('player-seated', (data: { playerId: string; playerName: string; seatPosition: number; stack: number }) => {
      console.log('[Socket] Player seated:', data.playerName, 'at seat', data.seatPosition);
      // Game state is already broadcast by server, no need to request it again
    });

    socket.on('player-left-seat', (data: { playerId: string; seatPosition: number }) => {
      console.log('[Socket] Player left seat:', data.seatPosition);
      // Game state is already broadcast by server, no need to request it again
    });

    socket.on('player-left-room', (data: { playerId: string }) => {
      console.log('[Socket] Player left room:', data.playerId);
      // Game state is already broadcast by server, no need to request it again
    });

    socket.on('player-disconnected', (data: { playerId: string }) => {
      console.log('[Socket] Player disconnected:', data.playerId);
      // Game state is already broadcast by server, no need to request it again
    });

    // Hand events
    socket.on('hand-started', (data: { table: TableState }) => {
      console.log('[Socket] Hand started!');
      setGameState(data.table);
    });

    socket.on('blinds-posted', (data: { table: TableState }) => {
      console.log('[Socket] Blinds posted');
      setGameState(data.table);
    });

    socket.on('cards-dealt', (data: { table: TableState }) => {
      console.log('[Socket] Cards dealt');
      setGameState(data.table);
    });

    socket.on('action-processed', (data: { table: TableState; action: GameAction }) => {
      console.log('[Socket] Action:', data.action.type);
      setGameState(data.table);
    });

    socket.on('street-changed', (data: { table: TableState; street: string }) => {
      console.log('[Socket] Street changed to:', data.street);
      setGameState(data.table);
    });

    socket.on('hand-completed', (data: { table: TableState; result: any }) => {
      console.log('[Socket] Hand completed!');
      setGameState(data.table);
    });

    socket.on('players-removed', (data: { playerIds: string[] }) => {
      console.log('[Socket] Players removed:', data.playerIds);
      // Game state will be updated in the game-state event that follows
    });

    // Error handlers
    socket.on('join-room-error', (data: { message: string }) => {
      console.error('[Socket] Join room error:', data.message);
      // If table not found after reconnect, server may have restarted
      if (data.message.includes('Table not found')) {
        setTableNotFound(true);
        setError('Table no longer exists. The server may have restarted.');
      } else {
        setError(`Failed to join: ${data.message}`);
      }
    });

    socket.on('take-seat-error', (data: { message: string }) => {
      console.error('[Socket] Take seat error:', data.message);
      setError(`Cannot sit: ${data.message}`);
      setTimeout(() => setError(null), 5000);
    });

    socket.on('leave-seat-error', (data: { message: string }) => {
      console.error('[Socket] Leave seat error:', data.message);
      setError(`Cannot stand: ${data.message}`);
      setTimeout(() => setError(null), 3000);
    });

    socket.on('action-error', (data: { message: string }) => {
      console.error('[Socket] Action error:', data.message);
      setError(`Invalid action: ${data.message}`);
      setTimeout(() => setError(null), 3000);
    });

    socket.on('game-error', (data: { message: string }) => {
      console.error('[Socket] Game error:', data.message);
      setError(`Game error: ${data.message}`);
    });

    return () => {
      console.log('[Socket] Cleaning up...');
      stopKeepAlive();
      socket.disconnect();
    };
  }, [tableId, playerId, playerName]);

  const joinRoom = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('join-room', { tableId, playerId, playerName });
    }
  }, [tableId, playerId, playerName]);

  const takeSeat = useCallback((seatPosition: number, buyIn: number) => {
    if (socketRef.current) {
      socketRef.current.emit('take-seat', { tableId, playerId, seatPosition, buyIn });
    }
  }, [tableId, playerId]);

  const leaveSeat = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('leave-seat', { tableId, playerId });
    }
  }, [tableId, playerId]);

  const leaveRoom = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('leave-room', { tableId, playerId });
    }
  }, [tableId, playerId]);

  const startHand = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('start-hand', { tableId });
    }
  }, [tableId]);

  const takeAction = useCallback((action: Omit<GameAction, 'timestamp'>) => {
    if (socketRef.current) {
      const fullAction: GameAction = {
        ...action,
        timestamp: new Date()
      };
      socketRef.current.emit('player-action', { tableId, action: fullAction });
    }
  }, [tableId]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  }, []);

  return {
    gameState,
    isConnected,
    isSeated,
    availableSeats,
    error,
    tableNotFound,
    joinRoom,
    takeSeat,
    leaveSeat,
    leaveRoom,
    startHand,
    takeAction,
    disconnect
  };
}
