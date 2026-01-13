import { getServerSession } from "next-auth/next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/pages/api/auth/[...nextauth]"

export default async function LobbyPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/api/auth/signin')
  }

  // Mock table data (will be replaced with real-time data from Socket.IO)
  const tables = [
    {
      id: 'table-1',
      name: 'Beginner Table',
      players: 3,
      maxPlayers: 9,
      smallBlind: 10,
      bigBlind: 20,
      status: 'active' as const,
      minBuyIn: 1000,
      maxBuyIn: 5000
    },
    {
      id: 'table-2',
      name: 'High Stakes',
      players: 2,
      maxPlayers: 6,
      smallBlind: 50,
      bigBlind: 100,
      status: 'waiting' as const,
      minBuyIn: 5000,
      maxBuyIn: 20000
    },
    {
      id: 'table-3',
      name: 'Quick Play',
      players: 6,
      maxPlayers: 9,
      smallBlind: 5,
      bigBlind: 10,
      status: 'active' as const,
      minBuyIn: 500,
      maxBuyIn: 2000
    },
    {
      id: 'table-4',
      name: 'VIP Room',
      players: 1,
      maxPlayers: 6,
      smallBlind: 100,
      bigBlind: 200,
      status: 'waiting' as const,
      minBuyIn: 10000,
      maxBuyIn: 50000
    }
  ];

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
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center font-bold">
                {(session.user?.name || session.user?.email || 'U')[0].toUpperCase()}
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
            <p className="text-xl text-gray-400">{tables.length} tables available</p>
          </div>
          <button className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors">
            + Create Table
          </button>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 mb-8 flex gap-4">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">
            All Tables
          </button>
          <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
            Active
          </button>
          <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
            Waiting
          </button>
          <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
            Full
          </button>
        </div>

        {/* Tables List */}
        <div className="space-y-4">
          {tables.map((table) => (
            <div
              key={table.id}
              className="bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all border border-gray-700 hover:border-gray-600"
            >
              <div className="flex items-center justify-between">
                {/* Table Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-3">
                    <h3 className="text-2xl font-bold">{table.name}</h3>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      table.status === 'active'
                        ? 'bg-green-600 text-white'
                        : 'bg-yellow-600 text-white'
                    }`}>
                      {table.status === 'active' ? '🟢 Active' : '🟡 Waiting'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400">Players</div>
                      <div className="text-lg font-bold">
                        {table.players}/{table.maxPlayers}
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
                  {table.players < table.maxPlayers ? (
                    <Link
                      href={`/game/${table.id}`}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-colors inline-block"
                    >
                      Join Table
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="bg-gray-600 text-gray-400 font-bold py-3 px-8 rounded-lg cursor-not-allowed"
                    >
                      Table Full
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State (hidden when tables exist) */}
        {tables.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🎲</div>
            <h3 className="text-2xl font-bold mb-2">No tables available</h3>
            <p className="text-gray-400 mb-6">Be the first to create a table!</p>
            <button className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors">
              + Create Table
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
