## 2.3. Database — Implementation Instructions (Supabase)

### 1. Create a Supabase Project
- Go to [Supabase](https://supabase.com/) and sign up or log in.
- Click "New project" and fill in the project name, password, and select a region.
- Wait for your project to be created.

### 2. Get Your Database Connection String
- In your Supabase project dashboard, go to "Project Settings" → "Database".
- Find the "Connection string" (URI) under "Connection info".
- Copy the `postgresql://...` string.

### 3. Add the Connection String to Your Project
- In your project root, open or create a `.env.local` file.
- Add:
  ```
  DATABASE_URL=your-supabase-connection-string-here
  ```
- **Never commit your real connection string to version control.**

### 4. Set Up Database Tables with Prisma
- If you haven't already, install Prisma:
  ```
  npm install prisma --save-dev
  npx prisma init
  ```
- In `prisma/schema.prisma`, replace the datasource block with:
  ```prisma
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  ```
- Add your models (example below):

  ```prisma
  model User {
    id    String  @id @default(uuid())
    email String  @unique
    name  String?
    games Game[]
  }

  model Game {
    id        String   @id @default(uuid())
    createdAt DateTime @default(now())
    users     User[]
    hands     Hand[]
    moves     Move[]
  }

  model Hand {
    id      String  @id @default(uuid())
    game    Game    @relation(fields: [gameId], references: [id])
    gameId  String
    // Add hand-specific fields here
  }

  model Move {
    id      String  @id @default(uuid())
    game    Game    @relation(fields: [gameId], references: [id])
    gameId  String
    user    User    @relation(fields: [userId], references: [id])
    userId  String
    // Add move-specific fields here
  }
  ```

- Run the migration to create your tables:
  ```
  npx prisma migrate dev --name init
  ```

### 5. Verify the Tables in Supabase
- In the Supabase dashboard, go to "Table Editor" to see your new tables: `users`, `games`, `hands`, and `moves`.
- You can also use the SQL editor to run queries and verify your schema.

---

**References:**
- [Supabase Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts)
- [Prisma Getting Started](https://www.prisma.io/docs/getting-started)
- [Prisma + Supabase Guide](https://supabase.com/docs/guides/integrations/prisma)

Let me know if you want help with SQL-only setup or using Supabase's dashboard to create tables!