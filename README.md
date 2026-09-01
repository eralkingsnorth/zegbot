# Zegbot

AI messaging hub — connect WhatsApp Web and talk to your messages through AI.

## Stack

- **API:** NestJS + Baileys (WhatsApp Web) + OpenAI
- **Web:** Next.js
- **DB (later):** PostgreSQL + Redis via Docker

## Quick start

```bash
# Install
npm install

# Copy env files
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env.local

# Start API (terminal 1)
npm run dev:api

# Start Web (terminal 2)
npm run dev:web
```

Open http://localhost:3000

## WhatsApp connect

1. Click **Connect WhatsApp Web**
2. Scan QR with your phone
3. Ask AI: "what are my new messages today?"
4. Send: "send hello to 1234567890"

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/whatsapp/status` | Connection status + QR |
| POST | `/whatsapp/connect` | Start WhatsApp session |
| POST | `/whatsapp/send` | Send message `{ to, message }` |
| GET | `/messages/today` | Today's messages |
| POST | `/ai/chat` | AI chat `{ message }` |

## Roadmap

- [ ] Telegram connector
- [ ] Email (Gmail) connector
- [ ] PostgreSQL persistence
- [ ] React Native mobile app
- [ ] Android SMS

## Note

WhatsApp Web connection is unofficial. Use at your own risk.
