import { requireAdmin, runtimeEnv } from "../../../../lib/runtime-env";

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Неверный ADMIN_KEY" }, { status: 401 });
  const token = await runtimeEnv("BOT_TOKEN");
  const secret = await runtimeEnv("TELEGRAM_WEBHOOK_SECRET");
  if (!token) return Response.json({ error: "В Render не задан BOT_TOKEN" }, { status: 400 });
  if (!secret) return Response.json({ error: "В Render не задан TELEGRAM_WEBHOOK_SECRET" }, { status: 400 });

  const configuredUrl = await runtimeEnv("PUBLIC_URL");
  const origin = (configuredUrl || new URL(request.url).origin).replace(/\/$/, "");
  const webhook = `${origin}/api/telegram/webhook`;
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: webhook,
      secret_token: secret,
      allowed_updates: ["message", "chat_member"],
      drop_pending_updates: false,
    }),
  });
  const result = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !result.ok) {
    return Response.json({ error: result.description || "Telegram отклонил webhook" }, { status: 502 });
  }
  return Response.json({ ok: true, webhook, description: result.description });
}
