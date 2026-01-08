import { getServerSession } from "next-auth";
import {authOptions} from "../pages/api/auth/[...nextauth]";
import { redirect } from "next/navigation";

export default async function Home(){
  const session = await getServerSession(authOptions);

  return (
    <main>
      <h1>Welcome, {session?.user?.name || session?.user?.email}</h1>
      <p> This is a protected home page.</p>
    </main>
  )
}
