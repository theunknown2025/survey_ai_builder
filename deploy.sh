#!/bin/bash

# Deployment script for Survey App
# Run on server: ./deploy.sh
# Requires: git repo cloned, PM2 for backend

set -e

echo "🚀 Starting deployment..."

# Project directory
APP_DIR="/home/ubuntu/survey-app"
cd "$APP_DIR" || { echo "❌ Project directory not found!"; exit 1; }

# 0. Validate environment file and required keys
ENV_FILE=""
if [ -f ".env.production" ]; then
    ENV_FILE=".env.production"
elif [ -f ".env" ]; then
    ENV_FILE=".env"
else
    echo "❌ No .env.production or .env file found in $APP_DIR"
    echo "   Create one before deploying."
    exit 1
fi

echo "🔐 Using environment file: $ENV_FILE"
if ! grep -q "^VITE_OPENAI_API_KEY=" "$ENV_FILE"; then
    echo "❌ VITE_OPENAI_API_KEY is missing in $ENV_FILE"
    echo "   Add your new API key, then run deploy again."
    exit 1
fi

if ! grep -q "^VITE_SUPABASE_URL=" "$ENV_FILE"; then
    echo "⚠️  VITE_SUPABASE_URL is missing in $ENV_FILE (continuing)"
fi

if ! grep -q "^VITE_SUPABASE_ANON_KEY=" "$ENV_FILE"; then
    echo "⚠️  VITE_SUPABASE_ANON_KEY is missing in $ENV_FILE (continuing)"
fi

# 1. Pull latest from GitHub
echo "📥 Pulling latest from GitHub..."
git pull origin main

# 2. Frontend: install & build
echo "📦 Installing frontend dependencies..."
npm install

echo "🔨 Building frontend..."
npm run build

if [ ! -d "dist" ]; then
    echo "❌ Build failed! dist folder not found."
    exit 1
fi

# 3. Backend: install & restart
echo "📦 Installing backend dependencies..."
cd server
npm install
cd ..

echo "🔄 Restarting backend (PM2)..."
pm2 restart survey-api 2>/dev/null || pm2 start server/index.js --name survey-api

# 4. Apply nginx config (fix 502: serve dist + proxy /api to 3001)
echo "⚙️  Updating nginx config..."
if [ -f "nginx-survey-app.conf" ]; then
    sudo cp nginx-survey-app.conf /etc/nginx/sites-available/survey-app
    sudo ln -sf /etc/nginx/sites-available/survey-app /etc/nginx/sites-enabled/survey-app

    # Disable configs that proxy root to port 3000 (causes 502)
    for f in /etc/nginx/sites-enabled/*; do
        if [ -L "$f" ] && grep -q "127.0.0.1:3000" "$f" 2>/dev/null; then
            echo "   Disabling $(basename "$f") (proxies to 3000, conflicts with survey-app)"
            sudo rm -f "$f"
        fi
    done

    sudo nginx -t
    echo "🔄 Reloading nginx..."
    sudo systemctl reload nginx
else
    echo "⚠️  nginx-survey-app.conf not found, skipping nginx update"
fi

# 5. Permissions
echo "🔐 Setting permissions..."
sudo chown -R ubuntu:ubuntu "$APP_DIR"
chmod -R 755 "$APP_DIR"

# 6. Status
if sudo systemctl is-active --quiet nginx; then
    echo "✅ Nginx is running"
else
    echo "⚠️  Nginx might not be running: sudo systemctl status nginx"
fi

echo ""
echo "✅ Deployment complete!"
echo "🌐 App: http://20.90.145.42"
echo "🔗 Health: http://20.90.145.42/health"
