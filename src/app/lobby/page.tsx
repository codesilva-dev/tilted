'use client';

import { useEffect, useState } from 'react';
import { getServerSession } from "next-auth/next"
import { redirect, useRouter } from "next/navigation"
import Link from "next/link"
import { io, Socket } from 'socket.io-client';
import CreateTableModal, { TableConfig } from '@/components/poker/CreateTableModal';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

interface TableInfo {
  tableId: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;
  seatedPlayers: number;
  spectators: number;
  isQuickplay: boolean;
  status: 'active' | 'waiting';
}

export default function LobbyPage() {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'waiting' | 'quickplay'>('all');

  useEffect(() => {
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true
    });

    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log('[Lobby] Connected to server');
      setIsConnected(true);
      // Request tables list
      socketInstance.emit('get-tables');
    });

    socketInstance.on('disconnect', () => {
      console.log('[Lobby] Disconnected');
      setIsConnected(false);
    });

    socketInstance.on('tables-list', (data: { tables: TableInfo[] }) => {
      console.log('[Lobby] Received tables:', data.tables);
      setTables(data.tables);
    });

    socketInstance.on('table-created', (data: { table: TableInfo }) => {
      console.log('[Lobby] New table created:', data.table);
      setTables(prev => [...prev, data.table]);
    });

    socketInstance.on('table-deleted', (data: { tableId: string }) => {
      console.log('[Lobby] Table deleted:', data.tableId);
      setTables(prev => prev.filter(t => t.tableId !== data.tableId));
    });

    socketInstance.on('create-table-error', (data: { message: string }) => {
      console.error('[Lobby] Create table error:', data.message);
      alert(`Failed to create table: ${data.message}`);
    });

    socketInstance.on('table-created-success', (data: { tableId: string }) => {
      console.log('[Lobby] Table created successfully:', data.tableId);
      // Navigate to the new table
      router.push(`/game/${data.tableId}`);
    });

    // Poll for table updates every 5 seconds
    const interval = setInterval(() => {
      if (socketInstance.connected) {
        socketInstance.emit('get-tables');
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      socketInstance.disconnect();
    };
  }, [router]);

  const handleCreateTable = (config: TableConfig) => {
    if (socket) {
      socket.emit('create-table', config);
    }
  };

  const filteredTables = tables.filter(table => {
    if (filter === 'all') return true;
    if (filter === 'quickplay') return table.isQuickplay;
    if (filter === 'active') return table.status === 'active';
    if (filter === 'waiting') return table.status === 'waiting';
    return true;
  });

  // Sort: quickplay first, then by status (active > waiting), then by name
  const sortedTables = [...filteredTables].sort((a, b) => {
    if (a.isQuickplay !== b.isQuickplay) return a.isQuickplay ? -1 : 1;
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
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
            <Link href="/lobby" className="text-white font-semibold">
              Lobby
            </Link>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm text-gray-400">Chips</div>
                <div className="text-xl font-bold text-green-400">$10,000</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-8 py-12">
        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-4xl font-bold mb-2">Game Lobby</h2>
            <div className="flex items-center gap-4">
              <p className="text-xl text-gray-400">{tables.length} tables available</p>
              {isConnected ? (
                <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm">
                  🟢 Live
                </span>
              ) : (
                <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm">
                  🔴 Connecting...
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            + Create Table
          </button>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 mb-8 flex gap-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            All Tables ({tables.length})
          </button>
          <button
            onClick={() => setFilter('quickplay')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'quickplay' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            Quickplay
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'active' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilter('waiting')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'waiting' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            Waiting
          </button>
        </div>

        {/* Tables List */}
        <div className="space-y-4">
          {sortedTables.map((table) => (
            <div
              key={table.tableId}
              className={`bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all border ${
                table.isQuickplay
                  ? 'border-yellow-500 ring-2 ring-yellow-500/50'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between">
                {/* Table Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-3">
                    <h3 className="text-2xl font-bold">{table.name}</h3>
                    {table.isQuickplay && (
                      <span className="bg-yellow-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                        ⚡ QUICKPLAY
                      </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      table.status === 'active'
                        ? 'bg-green-600 text-white'
                        : 'bg-yellow-600 text-white'
                    }`}>
                      {table.status === 'active' ? '🟢 Active' : '🟡 Waiting'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400">Seated</div>
                      <div className="text-lg font-bold">
                        {table.seatedPlayers}/{table.maxSeats}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">Spectators</div>
                      <div className="text-lg font-bold">
                        {table.spectators}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">Blinds</div>
                      <div className="text-lg font-bold">
                        ${table.smallBlind}/${table.bigBlind}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">Min Buy-in</div>
                      <div className="text-lg font-bold text-green-400">
                        ${table.minBuyIn.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">Max Buy-in</div>
                      <div className="text-lg font-bold text-blue-400">
                        ${table.maxBuyIn.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Join Button */}
                <div className="ml-8">
                  {table.seatedPlayers < table.maxSeats || table.spectators >= 0 ? (
                    <Link
                      href={`/game/${table.tableId}`}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-colors inline-block"
                    >
                      Join Table
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="bg-gray-600 text-gray-400 font-bold py-3 px-8 rounded-lg cursor-not-allowed"
                    >
                      Full
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {sortedTables.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🎲</div>
            <h3 className="text-2xl font-bold mb-2">No tables available</h3>
            <p className="text-gray-400 mb-6">
              {filter === 'all'
                ? 'Be the first to create a table!'
                : `No ${filter} tables found. Try a different filter.`}
            </p>
            {filter === 'all' && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                + Create Table
              </button>
            )}
          </div>
        )}

        {/* Dev Test Tables */}
        <div className="mt-12 bg-gray-800/50 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4 text-gray-400">Developer Test Tables (Old System)</h3>
          <div className="grid grid-cols-3 gap-3">
            <Link
              href="/game/test-table-1"
              className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-center text-sm transition-colors"
            >
              Test Table 1
            </Link>
            <Link
              href="/game/test-table-2"
              className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-center text-sm transition-colors"
            >
              Test Table 2
            </Link>
            <Link
              href="/game/test-table-3"
              className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-center text-sm transition-colors"
            >
              Test Table 3
            </Link>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            These use the old system (auto-sit). The new tables above support seat selection.
          </p>
        </div>
      </div>

      {/* Create Table Modal */}
      <CreateTableModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateTable}
      />
    </main>
  );
}
