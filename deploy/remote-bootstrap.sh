#!/usr/bin/env bash
set -euo pipefail
cd /var/www/zegbot
git pull origin main

JWT=$(openssl rand -hex 32)
DBPASS=$(openssl rand -hex 16)

sudo mysql -e "CREATE DATABASE IF NOT EXISTS zegbot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER IF NOT EXISTS 'zegbot'@'localhost' IDENTIFIED BY '${DBPASS}';"
sudo mysql -e "GRANT ALL PRIVILEGES ON zegbot.* TO 'zegbot'@'localhost'; FLUSH PRIVILEGES;"

if [ ! -f apps/api/.env ]; then
  cp deploy/server.env.example apps/api/.env
fi
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" apps/api/.env
sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=ZegbotAdmin2026!|" apps/api/.env
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"mysql://zegbot:${DBPASS}@localhost:3306/zegbot\"|" apps/api/.env

echo 'NEXT_PUBLIC_API_URL=http://api.zegbot.wachatpilot.com' > apps/web/.env.local
mkdir -p data sessions data/uploads

npm ci
npm run build --workspace=@zegbot/api
cd apps/api && npx prisma db push && cd ../..
npm run build --workspace=@zegbot/web

if ! command -v pm2 >/dev/null; then
  sudo npm install -g pm2
fi
pm2 delete zegbot-api zegbot-web 2>/dev/null || true
pm2 start deploy/ecosystem.config.cjs
pm2 save

sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers 2>/dev/null || true
sudo cp deploy/apache-zegbot-web.conf /etc/apache2/sites-available/zegbot-web.conf
sudo cp deploy/apache-zegbot-api.conf /etc/apache2/sites-available/zegbot-api.conf
sudo a2ensite zegbot-web.conf zegbot-api.conf 2>/dev/null || true
sudo apache2ctl configtest
sudo systemctl reload apache2

sleep 4
curl -sf http://127.0.0.1:3001/health && echo " API OK"
curl -sf -o /dev/null -w "Web HTTP %{http_code}\n" http://127.0.0.1:3002
