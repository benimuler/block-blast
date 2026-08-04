#!/bin/bash
# Block Blast — Ubuntu/Debian VPS setup (run as root or with sudo)
set -e

echo "=== Block Blast server setup ==="

# Node.js 20
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# PM2
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi

# Nginx
if ! command -v nginx &>/dev/null; then
  apt-get update
  apt-get install -y nginx
fi

APP_DIR="${APP_DIR:-/var/www/blockblast}"
echo "App directory: $APP_DIR"

if [ ! -f "$APP_DIR/package.json" ]; then
  echo "Copy project files to $APP_DIR first (git clone or scp)"
  exit 1
fi

cd "$APP_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Edit $APP_DIR/.env — set JWT_SECRET and PUBLIC_URL"
  openssl rand -hex 32
  echo "^ use this as JWT_SECRET"
  exit 1
fi

npm ci --omit=dev
mkdir -p server/data

pm2 delete blockblast 2>/dev/null || true
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup | tail -1 | bash || true

echo ""
echo "=== Done ==="
echo "1. Copy deploy/nginx.conf to /etc/nginx/sites-available/blockblast"
echo "2. Replace YOUR_DOMAIN with your domain"
echo "3. sudo nginx -t && sudo systemctl reload nginx"
echo "4. Optional HTTPS: sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d YOUR_DOMAIN"
echo "5. Set PUBLIC_URL=https://YOUR_DOMAIN in .env and: pm2 restart blockblast"
