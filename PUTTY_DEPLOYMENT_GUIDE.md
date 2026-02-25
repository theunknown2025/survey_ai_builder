# PuTTY SSH Deployment Guide — Survey AI Builder

Step-by-step guide to deploy [survey_ai_builder](https://github.com/theunknown2025/survey_ai_builder) to an Ubuntu server using PuTTY SSH and GitHub.

---

## Prerequisites

- **PuTTY** installed on Windows ([download](https://www.putty.org/))
- **Ubuntu server** (e.g. Azure VM) with SSH enabled
- **GitHub repo:** `https://github.com/theunknown2025/survey_ai_builder.git`
- Server access: IP, SSH username (e.g. `ubuntu`), password or SSH key

---

## Part 1: Connect via PuTTY

1. **Open PuTTY**
2. **Enter connection details:**
   - **Host Name:** `YOUR_SERVER_IP` (e.g. `20.90.145.42`)
   - **Port:** `22`
   - **Connection type:** SSH
3. Click **Open**
4. **Log in** with your username (e.g. `ubuntu`) and password when prompted

---

## Part 2: Prepare the Server

Run these commands on the server (one block at a time):

### 2.1 Update system and install base tools

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl
```

### 2.2 Install Node.js (v20 LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version   # v20.x.x
npm --version   # 10.x.x
```

### 2.3 Install Nginx

```bash
sudo apt install -y nginx
```

### 2.4 Install PM2 (for backend)

```bash
sudo npm install -g pm2
```

---

## Part 3: Clone and Set Up the Project

### 3.1 Clone from GitHub

```bash
cd /home/ubuntu
git clone https://github.com/theunknown2025/survey_ai_builder.git survey-app
cd survey-app
```

### 3.2 Create frontend environment file

```bash
nano .env.production
```

Add (replace placeholders with real values):

```env
# OpenAI (required for AI features)
VITE_OPENAI_API_KEY=your-openai-api-key-here

# Supabase (for image upload)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_SUPABASE_IMAGE_BUCKET=survey-images

# API URL — use your server IP or domain
VITE_API_URL=http://YOUR_SERVER_IP

# Nfield (optional)
VITE_NFIELD_DOMAIN=your-domain
VITE_NFIELD_USER=your-username
VITE_NFIELD_PASSWORD=your-password
VITE_NFIELD_API_URL=https://api.nfieldmr.com
```

Save: `Ctrl+O`, `Enter`, then `Ctrl+X`.

### 3.3 Create backend environment file

```bash
nano server/.env.local
```

Add:

```env
CORS_ORIGINS=http://YOUR_SERVER_IP,http://localhost
PORT=3001
NODE_ENV=production
```

Replace `YOUR_SERVER_IP` with your server IP. Survey history uses in-memory storage (data lost on server restart).

Save: `Ctrl+O`, `Enter`, then `Ctrl+X`.

---

## Part 4: Install Dependencies and Build

### 4.1 Frontend

```bash
cd /home/ubuntu/survey-app
npm install
npm run build
```

Check that `dist/` exists:

```bash
ls -la dist/
```

### 4.2 Backend

```bash
cd /home/ubuntu/survey-app/server
npm install
```

---

## Part 5: Start Backend with PM2

```bash
cd /home/ubuntu/survey-app/server
pm2 start index.js --name survey-api
pm2 save
pm2 startup
```

Copy and run the command that `pm2 startup` outputs so PM2 runs on boot.

Check status:

```bash
pm2 status
pm2 logs survey-api
```

---

## Part 6: Configure Nginx

### 6.1 Create site config

```bash
sudo nano /etc/nginx/sites-available/survey-app
```

Add (replace `YOUR_SERVER_IP`):

```nginx
server {
    listen 80;
    server_name YOUR_SERVER_IP;

    # Frontend static files
    root /home/ubuntu/survey-app/dist;
    index index.html;

    # API proxy to backend
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3001/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # SPA routing
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

Save: `Ctrl+O`, `Enter`, `Ctrl+X`.

### 6.2 Enable site and restart Nginx

```bash
sudo ln -sf /etc/nginx/sites-available/survey-app /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## Part 7: Firewall (if enabled)

```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow 22/tcp
sudo ufw enable
sudo ufw status
```

---

## Part 8: Permissions

```bash
sudo chown -R ubuntu:ubuntu /home/ubuntu/survey-app
chmod -R 755 /home/ubuntu/survey-app
```

---

## Part 9: Verify Deployment

1. In a browser: `http://YOUR_SERVER_IP`
2. Check API: `http://YOUR_SERVER_IP/health` — should return JSON
3. Test survey creation and image upload

---

## Part 10: Deploy Updates (Git pull)

After changing code and pushing to GitHub:

```bash
cd /home/ubuntu/survey-app
git pull origin main

# Frontend
npm install
npm run build

# Backend
cd server
npm install
pm2 restart survey-api

# Reload Nginx
cd ..
sudo systemctl reload nginx

echo "Deployment complete!"
```

---

## Quick Reference

| Action            | Command                                      |
|-------------------|----------------------------------------------|
| Restart backend   | `pm2 restart survey-api`                     |
| View backend logs | `pm2 logs survey-api`                        |
| Rebuild frontend  | `cd /home/ubuntu/survey-app && npm run build`|
| Reload Nginx      | `sudo systemctl reload nginx`                |
| Nginx status      | `sudo systemctl status nginx`                |
| PM2 status        | `pm2 status`                                 |

---

## Troubleshooting

### 502 Bad Gateway
- Ensure backend is running: `pm2 status`
- Check backend logs: `pm2 logs survey-api`
- Confirm `server/.env.local` has correct `CORS_ORIGINS`

### Blank page
- Check browser dev tools (Console / Network)
- Verify `dist/` exists and `.env.production` has correct `VITE_*` vars
- Rebuild: `npm run build`

### API calls fail
- Verify `VITE_API_URL` uses your server IP (e.g. `http://20.90.145.42`)
- Ensure Nginx `/api` location is present and points to `http://127.0.0.1:3001`

---

## Security Notes

1. **Credentials:** Never commit `.env.production` or `server/.env.local` (they are in `.gitignore`).
2. **HTTPS:** Use Let’s Encrypt for production: `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d your-domain.com`
3. **SSH key:** Prefer SSH keys over passwords for server access.
