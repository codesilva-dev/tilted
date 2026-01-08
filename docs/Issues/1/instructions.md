### 2.2. Authentication — Implementation Instructions

#### 1. Install NextAuth.js and Dependencies
- Open your terminal in the project root.
- Run:
  ```
  npm install next-auth
  ```
- If you plan to use providers like Google or GitHub, register OAuth apps with those services and obtain client IDs and secrets.

#### 2. Configure NextAuth.js API Route
- In your project, create the file: `src/pages/api/auth/[...nextauth].ts`
- Add the following starter code:
  ```ts
  import NextAuth from "next-auth";
  import GoogleProvider from "next-auth/providers/google";
  import GitHubProvider from "next-auth/providers/github";
  import EmailProvider from "next-auth/providers/email";

  export default NextAuth({
    providers: [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      }),
      // Optional: EmailProvider({ ... })
    ],
    // Add more NextAuth config here as needed
  });
  ```
- Add the required environment variables to your `.env.local` file:
  ```
  GOOGLE_CLIENT_ID=your-google-client-id
  GOOGLE_CLIENT_SECRET=your-google-client-secret
  GITHUB_CLIENT_ID=your-github-client-id
  GITHUB_CLIENT_SECRET=your-github-client-secret
  ```

#### 3. Add Authentication UI
- In your main layout or header (e.g., `src/app/layout.tsx`), add sign-in and sign-out buttons.
- Example using `next-auth/react`:
  ```tsx
  "use client";
  import { useSession, signIn, signOut } from "next-auth/react";

  export function AuthButtons() {
    const { data: session } = useSession();

    if (session) {
      return (
        <div>
          <span>Signed in as {session.user?.email}</span>
          <button onClick={() => signOut()}>Sign out</button>
        </div>
      );
    }
    return <button onClick={() => signIn()}>Sign in</button>;
  }
  ```
- Place `<AuthButtons />` in your layout or navigation.

#### 4. Protect Game Routes
- For server components/pages, use `getServerSession` to check authentication:
  ```ts
  import { getServerSession } from "next-auth";
  import { authOptions } from "../api/auth/[...nextauth]";

  export default async function ProtectedPage() {
    const session = await getServerSession(authOptions);
    if (!session) {
      // Redirect to sign-in or show an error
    }
    // ...rest of your page
  }
  ```
- For client components, use `useSession` and redirect if not authenticated.

#### 5. Test Authentication Flow
- Start your dev server: `npm run dev`
- Visit `/api/auth/signin` to test sign-in with each provider.
- Try accessing protected routes while signed out to confirm redirection or access denial.
- Sign in and verify user info is displayed and protected routes are accessible.

---

**References:**
- [NextAuth.js Documentation](https://next-auth.js.org/getting-started/introduction)
- [Next.js API Routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes)