#!/bin/bash

# Deployment script for Survey App
# Run this script on your server after transferring updated files

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Navigate to project directory
cd /home/ubuntu/survey-app || {
    echo "❌ Error: Project directory not found!"
    exit 1
}

# Install/update dependencies
echo "📦 Installing dependencies..."
npm install

# Build the application
echo "🔨 Building application..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo "❌ Error: Build failed! dist folder not found."
    exit 1
fi

# Set proper permissions
echo "🔐 Setting permissions..."
sudo chown -R ubuntu:ubuntu /home/ubuntu/survey-app
chmod -R 755 /home/ubuntu/survey-app

# Reload nginx
echo "🔄 Reloading nginx..."
sudo systemctl reload nginx

# Check nginx status
if sudo systemctl is-active --quiet nginx; then
    echo "✅ Nginx is running"
else
    echo "⚠️  Warning: Nginx might not be running properly"
    sudo systemctl status nginx
fi

echo "✅ Deployment complete!"
echo "🌐 Your app should be available at: http://20.90.145.42"
