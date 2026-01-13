# Deployment Guide

This app requires two separate deployments:
1. **Frontend (Next.js)** → Vercel
2. **Backend (Socket.IO Server)** → Railway/Render/Fly.io

## Why Separate Deployments?

Vercel is serverless and doesn't support persistent WebSocket connections. The Socket.IO server needs to run on a platform that supports long-running processes.

---

## Option 1: Railway.app (Recommended)

### Deploy Socket.IO Server to Railway

1. **Install Railway CLI**
   ```bash
   npm i -g @railway/cli
   ```

2. **Login to Railway**
   ```bash
   railway login
   ```

3. **Initialize Railway Project**
   ```bash
   railway init
   ```

4. **Set Build & Start Commands in Railway Dashboard**
   - Build Command: `npm install && npm run build:socket`
   - Start Command: `npm run start:socket`

5. **Add Environment Variables in Railway**
   ```
   SOCKET_PORT=3001
   CLIENT_URL=https://your-app.vercel.app
   DATABASE_URL=your_supabase_connection_string
   NODE_ENV=production
   ```

6. **Deploy**
   ```bash
   railway up
   ```

7. **Get Your Socket Server URL**
   - Go to Railway dashboard
   - Click on your service
   - Copy the public URL (e.g., `https://your-app.railway.app`)

### Deploy Next.js to Vercel

1. **Connect GitHub Repo to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel auto-detects Next.js

2. **Add Environment Variables in Vercel**
   ```
   NEXT_PUBLIC_SOCKET_URL=https://your-app.railway.app
   DATABASE_URL=your_supabase_connection_string
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   NEXTAUTH_URL=https://your-app.vercel.app
   NEXTAUTH_SECRET=your_nextauth_secret
   ```

3. **Deploy**
   - Click "Deploy"
   - Vercel will build and deploy automatically

4. **Update Railway CLIENT_URL**
   - Once Vercel deployment is done, copy your Vercel URL
   - Update `CLIENT_URL` in Railway to your actual Vercel URL
   - Redeploy Railway service

---

## Option 2: Render.com

### Deploy Socket.IO Server to Render

1. **Create New Web Service**
   - Go to [render.com](https://render.com)
   - Click "New Web Service"
   - Connect your GitHub repo

2. **Configure Service**
   - Name: `tilted-socket-server`
   - Build Command: `npm install && npm run build:socket`
   - Start Command: `npm run start:socket`

3. **Add Environment Variables**
   ```
   SOCKET_PORT=3001
   CLIENT_URL=https://your-app.vercel.app
   DATABASE_URL=your_supabase_connection_string
   NODE_ENV=production
   ```

4. **Deploy**
   - Click "Create Web Service"
   - Get your Render URL (e.g., `https://tilted-socket-server.onrender.com`)

5. **Follow Vercel Steps Above**
   - Use your Render URL for `NEXT_PUBLIC_SOCKET_URL`

---

## Option 3: DigitalOcean App Platform

Similar to Railway/Render:
- Create a new App
- Connect GitHub repo
- Set build command: `npm install && npm run build:socket`
- Set run command: `npm run start:socket`
- Add environment variables

---

## Testing Deployment

### Test Socket.IO Server
```bash
curl https://your-socket-server.railway.app/socket.io/
```
Should return Socket.IO metadata.

### Test Frontend
1. Visit your Vercel URL
2. Open browser console (F12)
3. Navigate to a game table
4. Look for `[Socket] Connected!` in console

---

## Architecture Diagram

```
┌─────────────────┐
│   User Browser  │
└────────┬────────┘
         │
         ├─────────────────┐
         │                 │
         v                 v
┌────────────────┐  ┌──────────────────┐
│  Vercel        │  │  Railway         │
│  (Next.js)     │  │  (Socket.IO)     │
│                │  │                  │
│  • Pages       │  │  • WebSockets    │
│  • API Routes  │  │  • Game Logic    │
│  • Auth        │  │  • Real-time     │
└────────┬───────┘  └────────┬─────────┘
         │                   │
         └─────────┬─────────┘
                   v
         ┌──────────────────┐
         │   Supabase       │
         │   (PostgreSQL)   │
         └──────────────────┘
```

---

## Environment Variables Summary

### Vercel (Frontend)
- `NEXT_PUBLIC_SOCKET_URL` - Socket.IO server URL
- `DATABASE_URL` - Supabase connection string
- `GOOGLE_CLIENT_ID` - Google OAuth
- `GOOGLE_CLIENT_SECRET` - Google OAuth
- `NEXTAUTH_URL` - Your Vercel URL
- `NEXTAUTH_SECRET` - Random secret string

### Railway/Render (Backend)
- `SOCKET_PORT` - Port (usually 3001 or let platform assign)
- `CLIENT_URL` - Your Vercel URL (for CORS)
- `DATABASE_URL` - Supabase connection string
- `NODE_ENV` - production

---

## Troubleshooting

### "WebSocket connection failed"
- Check `NEXT_PUBLIC_SOCKET_URL` in Vercel
- Ensure Socket.IO server is running (check Railway/Render logs)
- Verify CORS settings in `socket-server.ts`

### "Not authenticated"
- Check NextAuth environment variables
- Verify `NEXTAUTH_URL` matches your Vercel URL
- Check Google OAuth redirect URIs include Vercel URL

### "Database connection error"
- Verify `DATABASE_URL` is set in both Vercel and Railway
- Check Supabase connection pooling settings
- Ensure Prisma is generated (`npm run postinstall`)

---

## Cost Estimates

### Free Tier Limits
- **Vercel**: Free hobby plan (100GB bandwidth, unlimited requests)
- **Railway**: $5 credit/month free tier (5GB outbound)
- **Render**: Free tier (750 hours/month, sleeps after inactivity)
- **Supabase**: Free tier (500MB database, 2GB bandwidth)

### Paid Estimates (if needed)
- **Railway**: ~$5-10/month for small app
- **Render**: ~$7/month for always-on service
- **Vercel**: Free for most hobby projects
- **Supabase**: Free tier should be sufficient initially

---

## Next Steps After Deployment

1. Test with multiple users from different devices
2. Monitor Railway/Render logs for errors
3. Set up error tracking (Sentry, LogRocket)
4. Configure custom domain
5. Add SSL certificates (usually automatic)
6. Set up CI/CD for automatic deployments
