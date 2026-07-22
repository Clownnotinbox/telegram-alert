import { normalizeTelegramWebhookSecret, requireAdmin, runtimeEnv } from "../../../../lib/runtime-env";

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Неверный ADMIN_KEY" }, { status: 401 });
  const token = await runtimeEnv("BOT_TOKEN");
  const secret = normalizeTelegramWebhookSecret(await runtimeEnv("TELEGRAM_WEBHOOK_SECRET"));
  if (!token) return Response.json({ error: "В Render не задан BOT_TOKEN" }, { status: 400 });
  if (!secret) return Response.json({ error: "В Render не задан TELEGRAM_WEBHOOK_SECRET" }, { status: 400 });

  const configuredUrl = await runtimeEnv("PUBLIC_URL");
  const renderUrl = await runtimeEnv("RENDER_EXTERNAL_URL");
  const origin = (configuredUrl || renderUrl || new URL(request.url).origin).replace(/\/$/, "");
  const webhook = `${origin}/api/telegram/webhook`;
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: webhook,
      secret_token: secret,
      allowed_updates: ["message", "chat_member", "my_chat_member", "callback_query"],
      drop_pending_updates: false,
    }),
  });
  const result = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !result.ok) {
    return Response.json({ error: result.description || "Telegram отклонил webhook" }, { status: 502 });
  }
  const telegramMethod = (method: string, body: Record<string, unknown>) => fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  await Promise.allSettled([
    telegramMethod("setMyName", { name: "Telegram Alert" }),
    telegramMethod("setMyCommands", {
      commands: [
        { command: "start", description: "Настроить оверлей" },
        { command: "panel", description: "Мои каналы и OBS-ссылки" },
        { command: "style", description: "Выбрать оформление" },
        { command: "help", description: "Короткая инструкция" },
      ],
    }),
    telegramMethod("setMyDescription", {
      description: "Подключает Telegram-канал к OBS: показывает последнего подписчика и уведомляет о новых. Настройка полностью внутри бота.",
    }),
    telegramMethod("setMyShortDescription", {
      short_description: "Уведомления о подписчиках Telegram в OBS",
    }),
    telegramMethod("setMyDefaultAdministratorRights", {
      for_channels: true,
      rights: {
        is_anonymous: false,
        can_manage_chat: true,
        can_delete_messages: false,
        can_manage_video_chats: false,
        can_restrict_members: false,
        can_promote_members: false,
        can_change_info: false,
        can_invite_users: true,
        can_post_messages: false,
        can_edit_messages: false,
        can_post_stories: false,
        can_edit_stories: false,
        can_delete_stories: false,
      },
    }),
  ]);
  return Response.json({ ok: true, webhook, description: result.description });
}
