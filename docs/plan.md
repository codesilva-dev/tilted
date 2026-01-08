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
- [ ] Integrate NextAuth.js (Google, GitHub, or email login)
- [ ] Protect game routes

### 2.3. Database
- [ ] Set up PostgreSQL (Supabase/Neon/PlanetScale)
- [ ] Create tables: users, games, hands, moves

### 2.4. Real-time Backend
- [ ] Create Node.js server with Socket.IO
- [ ] Connect backend to database
- [ ] Implement game logic (join table, deal cards, betting, etc.)

### 2.5. Frontend Game UI
- [ ] Lobby: list/join/create games
- [ ] Game table: show cards, players, actions
- [ ] Real-time updates via Socket.IO client

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