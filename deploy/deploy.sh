#!/usr/bin/env bash
set -euo pipefail

# Zegbot production deploy — run on Ubuntu server as ubuntu user
# Usage: bash deploy/deploy.sh

APP_DIR="${APP_DIR:-/var/www/zegbot}"
REPO="${REPO:-https://github.com/eralkingsnorth/zegbot.git}"
BRANCH="${BRANCH:-main}"

echo "==> Deploying Zegbot to $APP_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown "$USER:$USER" "$APP_DIR"
  git clone "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "==> Node dependencies"
npm ci

echo "==> API env"
if [ ! -f apps/api/.env ]; then
  cp deploy/server.env.example apps/api/.env
  echo "!! Created apps/api/.env — edit secrets before first boot"
fi

echo "==> Web env"
if [ ! -f apps/web/.env.local ]; then
  cat > apps/web/.env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://api.zegbot.wachatpilot.com
EOF
fi

echo "==> MySQL database (if needed)"
if ! mysql -u root -e "USE zegbot" 2>/dev/null; then
  mysql -u root -e "CREATE DATABASE IF NOT EXISTS zegbot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  mysql -u root -e "CREATE USER IF NOT EXISTS 'zegbot'@'localhost' IDENTIFIED BY 'zegbot_prod';"
  mysql -u root -e "GRANT ALL PRIVILEGES ON zegbot.* TO 'zegbot'@'localhost'; FLUSH PRIVILEGES;"
fi

echo "==> Prisma + build"
npm run build --workspace=@zegbot/api
cd apps/api && npx prisma db push && cd ../..
npm run build --workspace=@zegbot/web

echo "==> Data + sessions dirs"
mkdir -p data sessions data/uploads

echo "==> PM2"
if ! command -v pm2 >/dev/null; then
  sudo npm install -g pm2
fi
pm2 startOrReload deploy/ecosystem.config.cjs
pm2 save

echo "==> Apache (this server uses Apache, not nginx)"
if [ -f deploy/apache-zegbot-web.conf ]; then
  sudo cp deploy/apache-zegbot-web.conf /etc/apache2/sites-available/zegbot-web.conf
  sudo cp deploy/apache-zegbot-api.conf /etc/apache2/sites-available/zegbot-api.conf
  sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers 2>/dev/null || true
  sudo a2ensite zegbot-web.conf zegbot-api.conf 2>/dev/null || true
  sudo apache2ctl configtest && sudo systemctl reload apache2
fi

echo "==> Health check"
sleep 3
curl -sf http://127.0.0.1:3001/health && echo " API OK"
curl -sf -o /dev/null http://127.0.0.1:3002 && echo " Web OK"

echo "==> Done. Add DNS A records -> $(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo "    zegbot.wachatpilot.com"
echo "    api.zegbot.wachatpilot.com"
