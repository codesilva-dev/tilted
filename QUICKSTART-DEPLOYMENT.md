# Quick Deployment Guide

## TL;DR - Deploy in 10 Minutes

### Step 1: Deploy Socket.IO Server to Railway (5 min)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize & deploy
railway init
railway up
```

**Set these environment variables in Railway dashboard:**
- `SOCKET_PORT` = `3001`
- `CLIENT_URL` = `https://your-app.vercel.app` (update after Vercel deploy)
- `DATABASE_URL` = Your Supabase connection string

**Copy your Railway URL** (looks like: `https://tilted-production.up.railway.app`)

---

### Step 2: Deploy Frontend to Vercel (5 min)

1. Go to [vercel.com](https://vercel.com) and import your GitHub repo

2. **Add these environment variables in Vercel:**
   - `NEXT_PUBLIC_SOCKET_URL` = Your Railway URL from Step 1
   - `DATABASE_URL` = Your Supabase connection string
   - `GOOGLE_CLIENT_ID` = Your Google OAuth client ID
   - `GOOGLE_CLIENT_SECRET` = Your Google OAuth secret
   - `NEXTAUTH_URL` = Will be your Vercel URL (e.g., `https://tilted.vercel.app`)
   - `NEXTAUTH_SECRET` = Generate with: `openssl rand -base64 32`

3. Click Deploy

4. **After deployment completes:**
   - Copy your Vercel URL
   - Go back to Railway dashboard
   - Update `CLIENT_URL` to your Vercel URL
   - Redeploy Railway service

---

## That's It!

Your app is now live:
- Frontend: `https://your-app.vercel.app`
- Socket Server: `https://your-app.railway.app`

---

## Testing Your Deployment

1. Visit your Vercel URL
2. Sign in with Google
3. Go to Lobby
4. Join a table
5. Open browser console (F12)
6. Look for: `[Socket] Connected!`

If you see that, everything is working! 🎉

---

## Common Issues & Fixes

### WebSocket not connecting
- **Fix**: Check `NEXT_PUBLIC_SOCKET_URL` in Vercel settings
- Make sure it starts with `https://` (Railway handles SSL automatically)

### CORS errors
- **Fix**: Update `CLIENT_URL` in Railway to match your exact Vercel URL
- No trailing slash!

### Auth not working
- **Fix**:
  1. Add Vercel URL to Google OAuth redirect URIs
  2. Verify `NEXTAUTH_URL` in Vercel matches your deployment URL

---

## Environment Variable Checklist

### ✅ Vercel (Frontend)
- [ ] `NEXT_PUBLIC_SOCKET_URL`
- [ ] `DATABASE_URL`
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `NEXTAUTH_URL`
- [ ] `NEXTAUTH_SECRET`

### ✅ Railway (Backend)
- [ ] `SOCKET_PORT`
- [ ] `CLIENT_URL`
- [ ] `DATABASE_URL`

---

## Cost

Both Railway and Vercel have generous free tiers:
- **Railway**: $5 credit/month free
- **Vercel**: Unlimited hobby projects
- **Total**: $0/month for a small project

---

## Need Help?

See full deployment guide: [DEPLOYMENT.md](./DEPLOYMENT.md)
