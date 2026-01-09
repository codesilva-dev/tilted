# Instructions: NextAuth.js + Prisma + Supabase Authentication

## Goal

Set up authentication in the Poker App using NextAuth.js, Prisma, and Supabase (PostgreSQL). Users should be able to log in with Google, GitHub, or email, and user/session data should be stored in Supabase via Prisma.

---

## Steps

### 1. Install Dependencies []

```bash
npm install next-auth @next-auth/prisma-adapter @prisma/client
```

---

### 2. Configure Prisma

- Ensure your `prisma/schema.prisma` is set up for NextAuth.js models (User, Account, Session, VerificationToken).
- Run:
  ```bash
  npx prisma generate
  npx prisma migrate dev --name add_auth_tables
  ```

---

### 3. Set Up Environment Variables

Add the following to your `.env.local`:

```
DATABASE_URL=your_supabase_postgres_connection_string
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

---

### 4. Configure NextAuth.js

Create or update `src/pages/api/auth/[...nextauth].ts`:

```typescript
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "../../../lib/prisma"; // adjust path as needed

export default NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    // Add EmailProvider if needed
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async session({ session, token, user }) {
      // Optionally attach user info to session
      return session;
    },
  },
});
```

---

### 5. Protect Routes

- Use `useSession` in React components to check authentication.
- Use `getServerSession` in API routes or server components.

---

### 6. Test Authentication

- Start your app and test login, logout, and session persistence.
- Check that user and session data is stored in Supabase.

---

## References

- [NextAuth.js Docs](https://next-auth.js.org/)
- [Prisma Adapter](https://authjs.dev/reference/adapter/prisma)
- [Supabase Docs](https://supabase.com/docs)