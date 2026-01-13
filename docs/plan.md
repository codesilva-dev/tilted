# Poker App Project Plan

## 1. Stack

- **Frontend:** Next.js (TypeScript), Tailwind CSS
- **Backend (Real-time):** Node.js + Socket.IO
- **Database:** PostgreSQL (Supabase/Neon/PlanetScale)
- **Authentication:** NextAuth.js
- **Hosting:** Vercel (frontend), Render/Railway (backend)
- **State Management:** React Context or Zustand
- **Testing:** Jest, React Testing Library

## 2. Milestones

### 2.1. Project Setup
- [x] Create Next.js app with TypeScript
- [x] Set up Tailwind CSS
- [x] Set up ESLint/Prettier

### 2.2. Authentication
- [x] Integrate NextAuth.js (Google, GitHub, or email login)
- [x] Protect game routes
- [x] Configure Prisma adapter for NextAuth.js
- [x] Connect Prisma to Supabase PostgreSQL
- [x] Store user/session/account data in Supabase via Prisma
- [x] Document environment variables for providers and database connection
- [x] Test login, logout, and session persistence

### 2.3. Database
- [x] Set up PostgreSQL (Supabase/Neon/PlanetScale)
- [x] Create tables: users, games, hands, moves

### 2.4. Real-time Backend (Node.js + Socket.IO)
- [x] Create Node.js server with Socket.IO
- [x] Connect backend to database
- [x] Implement join table & player management (Socket.IO events, DB connection)
- [x] Implement dealing hands logic (deal cards to players, send hand info)
- [x] Implement betting logic (betting rounds, player actions: bet, fold, call, etc.)

### 2.5. Frontend Game UI (Next.js + Socket.IO Client)
- [x] Lobby: list/join/create games (UI + real-time updates)
- [x] Game table: show cards, players, actions (UI)
- [x] Real-time updates via Socket.IO client (integrate backend events, update UI)


### 2.6. Testing & QA
- [ ] Unit tests (Jest)
- [ ] Integration tests (React Testing Library)
- [ ] Manual QA

### 2.7. Deployment
- [ ] Deploy frontend to Vercel
- [ ] Deploy backend to Render/Railway
- [ ] Set up environment variables

## 3. Stretch Goals

- [ ] Mobile responsiveness
- [ ] Spectator mode
- [ ] Chat
- [ ] Leaderboards
- [ ] Social login providers

---

## 4. Useful Links

- [Next.js Docs](https://nextjs.org/docs)
- [Socket.IO Docs](https://socket.io/docs/)
- [NextAuth.js Docs](https://next-auth.js.org/)
- [Supabase Docs](https://supabase.com/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)