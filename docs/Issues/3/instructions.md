## 2.3. Database — Implementation Instructions

### 1. Choose a PostgreSQL Provider
- Recommended options: [Supabase](https://supabase.com/), [Neon](https://neon.tech/), or [PlanetScale](https://planetscale.com/) (PlanetScale is MySQL, so use Supabase or Neon for PostgreSQL).
- Sign up and create a new project/database.

### 2. Get Your Database Connection String
- In your provider’s dashboard, find the connection string (often called `DATABASE_URL`).
- Copy this string for use in your environment variables.

### 3. Add the Connection String to Your Project
- In your project root, open or create a `.env.local` file.
- Add:
  ```
  DATABASE_URL=your-connection-string-here
  ```
- **Never commit your real connection string to version control.**

### 4. Set Up Database Tables
- Use a migration tool (like [Prisma](https://www.prisma.io/), [Drizzle](https://orm.drizzle.team/), or SQL scripts) to define your tables.
- Example Prisma schema for your tables:
  ```prisma
  // schema.prisma
  model User {
    id    String  @id @default(uuid())
    email String  @unique
    name  String?
    games Game[]
  }

  model Game {
    id      String  @id @default(uuid())
    createdAt DateTime @default(now())
    users   User[]
    hands   Hand[]
    moves   Move[]
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
- Run the migration command for your tool (e.g., `npx prisma migrate dev`).

### 5. Verify the Tables
- Connect to your database using your provider’s dashboard or a tool like [TablePlus](https://tableplus.com/) or [pgAdmin](https://www.pgadmin.org/).
- Confirm that the `users`, `games`, `hands`, and `moves` tables exist.

---

**References:**
- [Supabase Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts)
- [Neon Quickstart](https://neon.tech/docs/introduction/quickstart)
- [Prisma Getting Started](https://www.prisma.io/docs/getting-started)

Let me know if you want a specific example for Supabase, Neon, or a different ORM!