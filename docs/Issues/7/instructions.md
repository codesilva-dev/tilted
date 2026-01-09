# Implementation Instructions for Real-time Backend & Game UI

## Overview
We will implement steps 2.4 (Real-time Backend) and 2.5 (Frontend Game UI) in a modular, incremental fashion, using multiple focused branches and issues. This will allow for parallel development, easier code review, and more manageable testing.

## Branching & Issue Strategy
- Use separate branches for backend and frontend work.
- Break down each major feature into smaller, practical issues/branches.
- Each branch should focus on a single logical feature or step.
- Merge only after review and testing.

## Implementation Steps

### Backend (Node.js + Socket.IO)
1. **Join Table & Player Management**
	- Create a branch: `feature/backend-join-table`
	- Implement Socket.IO events for joining/leaving tables
	- Connect to the database for player/game state
	- Add basic player management logic
2. **Dealing Hands Logic**
	- Create a branch: `feature/backend-deal-hands` (branch from previous step)
	- Implement logic for dealing cards to players
	- Add events for sending hand info to clients
3. **Betting Logic**
	- Create a branch: `feature/backend-betting` (branch from previous step)
	- Implement betting round logic and state updates
	- Add events for player actions (bet, fold, call, etc.)

### Frontend (Next.js + Socket.IO Client)
4. **Lobby UI**
	- Create a branch: `feature/frontend-lobby`
	- Implement lobby page: list, join, and create games
	- Connect to backend for real-time updates
5. **Game Table UI**
	- Create a branch: `feature/frontend-table`
	- Implement table UI: show cards, players, actions
	- Display real-time game state
6. **Real-time Updates Integration**
	- Create a branch: `feature/frontend-realtime`
	- Integrate Socket.IO client for live updates
	- Ensure UI responds to backend events

## General Guidelines
- Keep PRs small and focused
- Write tests for each feature
- Document new endpoints/events and UI components
- Coordinate merges to avoid conflicts

---

Follow this plan for efficient, maintainable progress on the real-time backend and game UI features.
