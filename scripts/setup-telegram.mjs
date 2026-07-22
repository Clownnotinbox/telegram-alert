const token = process.env.BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  ?.replace(/[^A-Za-z0-9_-]/g, "_")
  .slice(0, 256);
const baseUrl = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");

if (!token || !secret || !baseUrl) {
  throw new Error("BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and RENDER_EXTERNAL_URL are required");
}

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(`${method}: ${body.description || response.status}`);
  return body.result;
}

await telegram("setWebhook", {
  url: `${baseUrl}/api/telegram/webhook`,
  secret_token: secret,
  allowed_updates: ["message", "chat_member", "my_chat_member", "callback_query"],
  drop_pending_updates: false,
});

const bot = await telegram("getMe", {});
console.log(`Telegram self-service configured for @${bot.username}`);
