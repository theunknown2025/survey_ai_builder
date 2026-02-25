# Deployment Guide for Survey Web App

This guide will help you deploy your Vite + React application to your Ubuntu server.

## Prerequisites
- PuTTY installed on your Windows machine
- Your server credentials:
  - IP: `20.90.145.42`
  - User: `ubuntu`
  - Password: `w17*RS{Y:r?4`

---

## Step 1: Connect to Server via PuTTY

1. **Open PuTTY**
2. **Enter connection details:**
   - Host Name (or IP address): `20.90.145.42`
   - Port: `22`
   - Connection type: `SSH`
3. **Click "Open"**
4. **When prompted, enter:**
   - Username: `ubuntu`
   - Password: `w17*RS{Y:r?4` (note: password won't show as you type)

---

## Step 2: Update System and Install Dependencies

Once connected, run these commands:

```bash
# Update package list
sudo apt update

# Upgrade existing packages
sudo apt upgrade -y

# Install Node.js (using NodeSource repository for latest LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
node --version
npm --version

# Install nginx (web server)
sudo apt install -y nginx

# Install PM2 (process manager for Node.js - optional but recommended)
sudo npm install -g pm2

# Install Git (if not already installed)
sudo apt install -y git
```

---

## Step 3: Transfer Your Project Files

You have two options:

### Option A: Using SCP (WinSCP or command line)

**Using WinSCP (GUI - Recommended):**
1. Download and install WinSCP
2. Create new session:
   - Host name: `20.90.145.42`
   - Username: `ubuntu`
   - Password: `w17*RS{Y:r?4`
   - Protocol: `SFTP`
3. Connect and navigate to `/home/ubuntu`
4. Create folder: `survey-app`
5. Upload all project files (except `node_modules` and `.env`)

**Using PowerShell/Command Line:**
```powershell
# From your local machine (Windows PowerShell)
scp -r "C:\Users\Dell\Desktop\Sora_digital\projects\integrate marketing\Survey\*" ubuntu@20.90.145.42:/home/ubuntu/survey-app/
```

### Option B: Using Git (if your code is in a repository)

```bash
# On the server
cd /home/ubuntu
git clone <your-repo-url> survey-app
cd survey-app
```

---

## Step 4: Set Up the Application on Server

```bash
# Navigate to project directory
cd /home/ubuntu/survey-app

# Install dependencies
npm install

# Create production environment file
nano .env.production
```

**Add your environment variables to `.env.production`:**
```env
VITE_OPENAI_API_KEY=your_openai_api_key_here
VITE_NFIELD_TEST_LINK=your_nfield_test_link_here
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

**Save and exit:** Press `Ctrl+X`, then `Y`, then `Enter`

---

## Step 5: Build the Application

```bash
# Build for production
npm run build

# This creates a 'dist' folder with your production files
```

---

## Step 6: Configure Nginx

```bash
# Create nginx configuration file
sudo nano /etc/nginx/sites-available/survey-app
```

**Add this configuration:**
```nginx
server {
    listen 80;
    server_name 20.90.145.42;  # Or your domain name if you have one

    root /home/ubuntu/survey-app/dist;
    index index.html;

    # Serve static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

**Save and exit:** Press `Ctrl+X`, then `Y`, then `Enter`

**Enable the site:**
```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/survey-app /etc/nginx/sites-enabled/

# Remove default nginx site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx

# Enable nginx to start on boot
sudo systemctl enable nginx
```

---

## Step 7: Configure Firewall

```bash
# Allow HTTP traffic
sudo ufw allow 'Nginx Full'

# Or if you only want HTTP (port 80)
sudo ufw allow 80/tcp

# Enable firewall (if not already enabled)
sudo ufw enable

# Check firewall status
sudo ufw status
```

---

## Step 8: Set Proper Permissions

```bash
# Set ownership of project directory
sudo chown -R ubuntu:ubuntu /home/ubuntu/survey-app

# Set proper permissions
chmod -R 755 /home/ubuntu/survey-app
```

---

## Step 9: Access Your Application

Open your browser and navigate to:
```
http://20.90.145.42
```

You should see your application running!

---

## Step 10: Set Up Auto-Deployment Script (Optional)

Create a deployment script for easy updates:

```bash
# Create deployment script
nano /home/ubuntu/survey-app/deploy.sh
```

**Add this content:**
```bash
#!/bin/bash
cd /home/ubuntu/survey-app
git pull  # If using git
npm install
npm run build
sudo systemctl reload nginx
echo "Deployment complete!"
```

**Make it executable:**
```bash
chmod +x /home/ubuntu/survey-app/deploy.sh
```

---

## Troubleshooting

### Check Nginx Status
```bash
sudo systemctl status nginx
```

### Check Nginx Error Logs
```bash
sudo tail -f /var/log/nginx/error.log
```

### Check Nginx Access Logs
```bash
sudo tail -f /var/log/nginx/access.log
```

### If you get "Permission denied" errors:
```bash
sudo chown -R www-data:www-data /home/ubuntu/survey-app/dist
# OR
sudo chown -R ubuntu:ubuntu /home/ubuntu/survey-app/dist
```

### If port 80 is already in use:
```bash
sudo netstat -tulpn | grep :80
# Kill the process if needed
```

### Rebuild after changes:
```bash
cd /home/ubuntu/survey-app
npm run build
sudo systemctl reload nginx
```

---

## Security Recommendations

1. **Set up SSL/HTTPS** (using Let's Encrypt):
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

2. **Change default SSH port** (optional but recommended)

3. **Set up firewall rules** properly

4. **Keep system updated:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

---

## Quick Reference Commands

```bash
# Rebuild and restart
cd /home/ubuntu/survey-app && npm run build && sudo systemctl reload nginx

# Check if app is accessible
curl http://localhost

# View nginx configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx

# Check nginx status
sudo systemctl status nginx
```

---

## Notes

- Your app will be accessible at `http://20.90.145.42`
- Make sure your `.env.production` file has all required variables
- The `dist` folder contains your built application
- Nginx serves the static files from the `dist` folder
- For production, consider setting up a domain name and SSL certificate

---

## Next Steps

1. **Set up a domain name** (optional) and point it to your server IP
2. **Configure SSL** for HTTPS
3. **Set up automated backups**
4. **Monitor server resources** (CPU, memory, disk)

Good luck with your deployment! 🚀
