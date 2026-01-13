import { getServerSession } from "next-auth/next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/pages/api/auth/[...nextauth]"  // ← Import it

export default async function Home() {
  const session = await getServerSession(authOptions)  // ← Pass it here

  if (!session) {
    redirect('/api/auth/signin')
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4">Tilted Poker</h1>
          <p className="text-xl text-gray-400">Welcome, {session.user?.name || session.user?.email}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-8 shadow-xl">
          <h2 className="text-2xl font-bold mb-6">Quick Play</h2>

          <div className="space-y-4">
            <Link
              href="/game/test-table-1"
              className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-center text-xl transition-colors"
            >
              Join Table 1
            </Link>

            <Link
              href="/game/test-table-2"
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg text-center text-xl transition-colors"
            >
              Join Table 2
            </Link>

            <Link
              href="/game/test-table-3"
              className="block w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 px-6 rounded-lg text-center text-xl transition-colors"
            >
              Join Table 3
            </Link>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-700">
            <p className="text-sm text-gray-400 text-center">
              More features coming soon: Create custom tables, view table lobby, and more!
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}