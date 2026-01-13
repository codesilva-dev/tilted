import { getServerSession } from "next-auth/next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/pages/api/auth/[...nextauth]"

export default async function Home() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/api/auth/signin')
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-3xl">♠</span>
            <h1 className="text-2xl font-bold">Tilted</h1>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/lobby" className="text-gray-300 hover:text-white transition-colors">
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
        {/* Welcome Section */}
        <div className="mb-12">
          <h2 className="text-4xl font-bold mb-2">Welcome back, {session.user?.name || 'Player'}!</h2>
          <p className="text-xl text-gray-400">Ready to play some poker?</p>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {/* Quick Play Card */}
          <Link
            href="/lobby"
            className="bg-gradient-to-br from-green-600 to-green-700 rounded-xl p-8 shadow-xl hover:shadow-2xl transition-all hover:scale-105 group"
          >
            <div className="text-4xl mb-4">🎲</div>
            <h3 className="text-2xl font-bold mb-2 group-hover:text-white transition-colors">Quick Play</h3>
            <p className="text-green-100">Join a table and start playing instantly</p>
          </Link>

          {/* Browse Lobby Card */}
          <Link
            href="/lobby"
            className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-8 shadow-xl hover:shadow-2xl transition-all hover:scale-105 group"
          >
            <div className="text-4xl mb-4">🏛️</div>
            <h3 className="text-2xl font-bold mb-2 group-hover:text-white transition-colors">Browse Lobby</h3>
            <p className="text-blue-100">View all active tables and choose your game</p>
          </Link>
        </div>

        {/* Stats Section */}
        <div className="bg-gray-800 rounded-xl p-8 shadow-xl mb-12">
          <h3 className="text-2xl font-bold mb-6">Your Stats</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-3xl font-bold text-green-400">$10,000</div>
              <div className="text-sm text-gray-400 mt-1">Total Chips</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-blue-400">0</div>
              <div className="text-sm text-gray-400 mt-1">Hands Played</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-purple-400">0%</div>
              <div className="text-sm text-gray-400 mt-1">Win Rate</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-yellow-400">-</div>
              <div className="text-sm text-gray-400 mt-1">Best Hand</div>
            </div>
          </div>
        </div>

        {/* Test Tables (for development) */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4 text-gray-400">Developer Test Tables</h3>
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
        </div>
      </div>
    </main>
  )
}