# Quick Deployment Checklist

Use this checklist to ensure you complete all deployment steps.

## Pre-Deployment
- [ ] Backup your local project
- [ ] Note down all environment variables needed
- [ ] Ensure your code is working locally (`npm run build` should succeed)

## Server Setup
- [ ] Connect to server via PuTTY
- [ ] Update system packages (`sudo apt update && sudo apt upgrade -y`)
- [ ] Install Node.js (v20.x)
- [ ] Install nginx
- [ ] Install PM2 (optional)
- [ ] Install Git (if using Git deployment)

## File Transfer
- [ ] Transfer project files to server (via SCP/WinSCP or Git)
- [ ] Verify all files are transferred (except `node_modules` and `.env`)

## Application Setup
- [ ] Navigate to project directory (`cd /home/ubuntu/survey-app`)
- [ ] Install dependencies (`npm install`)
- [ ] Create `.env.production` file with all required variables:
  - [ ] `VITE_OPENAI_API_KEY`
  - [ ] `VITE_NFIELD_TEST_LINK`
  - [ ] Any other VITE_* variables your app needs
- [ ] Build the application (`npm run build`)
- [ ] Verify `dist` folder was created

## Nginx Configuration
- [ ] Create nginx config file (`/etc/nginx/sites-available/survey-app`)
- [ ] Enable the site (create symlink)
- [ ] Test nginx configuration (`sudo nginx -t`)
- [ ] Restart nginx (`sudo systemctl restart nginx`)
- [ ] Enable nginx on boot (`sudo systemctl enable nginx`)

## Firewall
- [ ] Allow HTTP traffic (`sudo ufw allow 'Nginx Full'`)
- [ ] Enable firewall (`sudo ufw enable`)
- [ ] Verify firewall status

## Permissions
- [ ] Set proper ownership (`sudo chown -R ubuntu:ubuntu /home/ubuntu/survey-app`)
- [ ] Set proper permissions (`chmod -R 755 /home/ubuntu/survey-app`)

## Testing
- [ ] Access application in browser: `http://20.90.145.42`
- [ ] Test all major features
- [ ] Check browser console for errors
- [ ] Verify API calls are working

## Post-Deployment
- [ ] Document any issues encountered
- [ ] Set up monitoring (optional)
- [ ] Plan for SSL/HTTPS setup (recommended)
- [ ] Set up automated backups (recommended)

## Environment Variables Reference

Make sure these are in your `.env.production` file:

```env
VITE_OPENAI_API_KEY=your_key_here
VITE_NFIELD_TEST_LINK=your_link_here
```

Add any other `VITE_*` variables your application uses.
