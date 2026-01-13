#!/bin/bash

# Railway Deployment Script for Tilted Poker Socket.IO Server
# Prerequisites: Railway CLI installed (npm i -g @railway/cli)

echo "🚂 Tilted Poker - Railway Deployment"
echo "===================================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null
then
    echo "❌ Railway CLI not found!"
    echo "Install it with: npm i -g @railway/cli"
    exit 1
fi

echo "✅ Railway CLI found"
echo ""

# Login check
echo "Checking Railway login status..."
if ! railway whoami &> /dev/null
then
    echo "🔐 Please login to Railway"
    railway login
fi

echo "✅ Logged in to Railway"
echo ""

# Initialize project if not exists
if [ ! -f ".railway" ]; then
    echo "📦 Initializing Railway project..."
    railway init
else
    echo "✅ Railway project already initialized"
fi

echo ""
echo "⚙️  Configure these environment variables in Railway dashboard:"
echo "   1. SOCKET_PORT=3001"
echo "   2. CLIENT_URL=https://your-vercel-app.vercel.app"
echo "   3. DATABASE_URL=your_supabase_connection_string"
echo "   4. NODE_ENV=production"
echo ""
read -p "Have you set the environment variables? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Please set environment variables in Railway dashboard first:"
    echo "https://railway.app/dashboard"
    exit 1
fi

echo ""
echo "🚀 Deploying to Railway..."
railway up

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Get your Railway URL from the dashboard"
echo "   2. Set NEXT_PUBLIC_SOCKET_URL in Vercel to your Railway URL"
echo "   3. Update CLIENT_URL in Railway to your Vercel URL"
echo "   4. Test your deployment!"
echo ""
