# Deploy Zegbot on wachatpilot.com

## DNS (add A records at your domain registrar)

| Subdomain | Points to |
|-----------|-----------|
| `zegbot.wachatpilot.com` | `37.59.126.13` |
| `api.zegbot.wachatpilot.com` | `37.59.126.13` |

## First deploy on server

```bash
ssh ubuntu@37.59.126.13
git clone https://github.com/eralkingsnorth/zegbot.git /var/www/zegbot
cd /var/www/zegbot
cp deploy/server.env.example apps/api/.env
# Edit apps/api/.env — set DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD, OPENAI_API_KEY
bash deploy/deploy.sh
```

## Updates

```bash
ssh ubuntu@37.59.126.13
cd /var/www/zegbot && git pull && bash deploy/deploy.sh
```

## URLs

- Web: http://zegbot.wachatpilot.com
- API: http://api.zegbot.wachatpilot.com/health
- Mobile APK uses `EXPO_PUBLIC_API_URL=http://api.zegbot.wachatpilot.com`
