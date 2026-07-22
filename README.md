# Telegram Alert

Telegram bot + browser overlay for showing the latest channel subscriber in OBS.

## Local development

Requires Node.js 22.13 or newer.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The test button works without Telegram credentials in development.

## Telegram setup

1. Create a bot with `@BotFather` and add it to the channel as an administrator.
2. Add `BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_KEY` and `PUBLIC_URL` to Render.
3. Deploy the service.
4. Open the dashboard, enter `ADMIN_KEY`, and click **Подключить webhook**.
5. Add `https://YOUR-SERVICE.onrender.com/overlay` to OBS as a Browser Source.

The bot explicitly subscribes to `chat_member` updates. Existing subscribers are not available retroactively; the overlay starts tracking after the webhook is connected.

## Storage

Local development uses D1. Render uses PostgreSQL when `DATABASE_URL` is set. Without either backend, the app falls back to in-memory storage for previews only.
