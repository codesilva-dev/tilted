import { getServerSession } from "next-auth/next"
import { redirect } from "next/navigation"
import { authOptions } from "@/pages/api/auth/[...nextauth]"  // ← Import it

export default async function Home() {
  const session = await getServerSession(authOptions)  // ← Pass it here

  if (!session) {
    redirect('/api/auth/signin')
  }

  return (
    <main>
      <h1>Welcome, {session.user?.name || session.user?.email}</h1>
      <p>This is a protected home page.</p>
    </main>
  )
}