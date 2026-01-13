'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TableState, GameAction } from '@/game/types/game-state';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

interface UseGameSocketOptions {
  tableId: string;
  playerId: string;
  playerName: string;
  buyIn: number;
}

interface UseGameSocketReturn {
  gameState: TableState | null;
  isConnected: boolean;
  error: string | null;
  startHand: () => void;
  takeAction: (action: Omit<GameAction, 'timestamp'>) => void;
  disconnect: () => void;
}

export function useGameSocket(options: UseGameSocketOptions): UseGameSocketReturn {
  const { tableId, playerId, playerName, buyIn } = options;

  const [gameState, setGameState] = useState<TableState | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (socketRef.current) return;

    console.log('[Socket] Connecting to', SOCKET_URL);

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      console.log('[Socket] Connected!');
      setIsConnected(true);
      setError(null);

      socket.emit('join-table', {
        tableId,
        playerId,
        playerName,
        buyIn
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);

      if (reason === 'io server disconnect') {
        setError('Disconnected by server');
      }
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
      setIsConnected(false);
      setError(`Connection failed: ${error.message}`);
    });

    // Game event handlers
    socket.on('game-state', (data: { table: TableState }) => {
      console.log('[Socket] Game state received');
      setGameState(data.table);
    });

    socket.on('player-joined', (data: any) => {
      console.log('[Socket] Player joined:', data.playerName);
      // Request updated game state when a player joins
      socket.emit('get-game-state', { tableId });
    });

    socket.on('player-left', (data: { playerId: string }) => {
      console.log('[Socket] Player left:', data.playerId);
      // Request updated game state when a player leaves
      socket.emit('get-game-state', { tableId });
    });

    socket.on('player-disconnected', (data: { playerId: string }) => {
      console.log('[Socket] Player disconnected:', data.playerId);
      // Request updated game state when a player disconnects
      socket.emit('get-game-state', { tableId });
    });

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

    // Error handlers
    socket.on('join-error', (data: { message: string }) => {
      console.error('[Socket] Join error:', data.message);
      setError(`Failed to join: ${data.message}`);
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
      socket.disconnect();
      socketRef.current = null;
    };
  }, [tableId, playerId, playerName, buyIn]);

  const startHand = useCallback(() => {
    if (!socketRef.current?.connected) {
      setError('Not connected to server');
      return;
    }

    console.log('[Socket] Starting hand...');
    socketRef.current.emit('start-hand', { tableId });
  }, [tableId]);

  const takeAction = useCallback((action: Omit<GameAction, 'timestamp'>) => {
    if (!socketRef.current?.connected) {
      setError('Not connected to server');
      return;
    }

    const fullAction: GameAction = {
      ...action,
      timestamp: new Date()
    };

    console.log('[Socket] Taking action:', fullAction.type);
    socketRef.current.emit('player-action', {
      tableId,
      action: fullAction
    });
  }, [tableId]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('[Socket] Manual disconnect');
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  return {
    gameState,
    isConnected,
    error,
    startHand,
    takeAction,
    disconnect
  };
}
