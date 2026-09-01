# Zegbot

AI messaging hub — connect WhatsApp Web and talk to your messages through AI.

## Stack

- **API:** NestJS + Prisma + MySQL (WAMP) + Baileys + OpenAI
- **Web:** Next.js (dark glass UI)
- **Mobile:** Expo React Native (iOS & Android — login, register, pricing; **no admin**)
- **Theme:** `@zegbot/theme` shared design tokens

## Quick start

```bash
# Install
npm install

# Copy env files
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env.local
copy apps\mobile\.env.example apps\mobile\.env

# Create MySQL database (WAMP) then push schema
mysql -u root -e "CREATE DATABASE IF NOT EXISTS zegbot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
cd apps\api
npx prisma db push
cd ..\..

# Start API (terminal 1)
npm run dev:api

# Start Web (terminal 2)
npm run dev:web

# Start Mobile (terminal 3)
npm run dev:mobile
```

Open http://localhost:3002 (web). API is http://localhost:3001.

If email is not configured, verification and reset **links are printed in the API logs**.

## Auth flow

1. Register at `/register` (web) or the Register screen (mobile)
2. Check email (or API logs) for `{WEB_URL}/verify-email?token=...`
3. After verify, you are signed in on web; on mobile tap **I've verified — log in**
4. Login is rejected until the email is verified
5. Forgot password sends `{WEB_URL}/reset-password?token=...` (web page is used for v1, including mobile)

## Admin (web only)

Admin is **not** in the mobile app and **not** in the user nav.

1. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `apps\api\.env`
2. Open http://localhost:3002/admin/login
3. Dashboard: user count, MRR, plans breakdown
4. **Users:** upgrade / downgrade any customer plan
5. **Plans:** create plans → **Sync Stripe** for paid plans

Default plans: Free, Starter ($4.99), Pro ($9.99), Annual Pro ($79). Seeded into MySQL on first boot if the plans table is empty (also migrates `data/plans.json` if present).

## Stripe setup

1. Add `STRIPE_SECRET_KEY` to `apps\api\.env`
2. In admin → Plans → click **Sync Stripe** on each paid plan
3. For webhooks (production): point Stripe to `POST /billing/webhook` and set `STRIPE_WEBHOOK_SECRET`
4. Customers: register → verify email → Pricing → **Subscribe** → Stripe Checkout
5. Mobile subscribe opens the Stripe URL in the system browser

## Env (API)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | MySQL, e.g. `mysql://root:@localhost:3306/zegbot` |
| `WEB_URL` | Web origin for verify/reset links and Stripe return URLs |
| `RESEND_API_KEY` | Optional. Send mail via Resend |
| `EMAIL_FROM` | From header (`Zegbot <noreply@zegbot.local>`) |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` | Optional SMTP fallback |
| `ADMIN_EMAIL` `ADMIN_PASSWORD` | Web admin login |
| `JWT_SECRET` | Auth tokens |
| `STRIPE_SECRET_KEY` `STRIPE_WEBHOOK_SECRET` | Billing |

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
| GET | `/plans` | Public pricing plans |
| POST | `/auth/register` | Customer register (sends verify email, no auto-login) |
| POST | `/auth/login` | Customer login (requires verified email) |
| POST | `/auth/verify-email` | `{ token }` → JWT |
| POST | `/auth/forgot-password` | `{ email }` generic success |
| POST | `/auth/reset-password` | `{ token, password }` |
| GET | `/auth/me` | Current user + plan (Bearer) |
| POST | `/auth/admin/login` | Admin login (web only) |
| POST | `/billing/checkout` | Stripe checkout (Bearer user token) |
| POST | `/billing/webhook` | Stripe webhooks |
| GET | `/admin/dashboard` | Stats (admin Bearer token) |
| GET | `/admin/users` | All users + plans |
| PATCH | `/admin/users/:id/plan` | Upgrade / downgrade user |
| GET | `/admin/plans` | All plans (admin) |
| POST | `/admin/plans` | Create plan |
| PATCH | `/admin/plans/:id` | Update plan |
| DELETE | `/admin/plans/:id` | Delete plan |
| POST | `/admin/plans/:id/sync-stripe` | Sync plan to Stripe |

## Prisma

```bash
cd apps\api
npx prisma generate
npx prisma db push
```

`db push` is enough for local WAMP. Use `npx prisma migrate dev` later if you want migration files.

## Roadmap

- [ ] Telegram connector
- [ ] Email (Gmail) connector
- [ ] Android SMS

## Note

WhatsApp Web connection is unofficial. Use at your own risk.
