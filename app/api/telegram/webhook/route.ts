import { runtimeEnv } from "../../../../lib/runtime-env";
import { recordSubscriber } from "../../../../lib/subscribers";

type TelegramUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TelegramMember = { status: string; is_member?: boolean; user: TelegramUser };
type TelegramUpdate = {
  update_id: number;
  message?: { text?: string; chat: { id: number }; from?: TelegramUser };
  chat_member?: {
    chat: { id: number; title?: string };
    old_chat_member: TelegramMember;
    new_chat_member: TelegramMember;
    date: number;
  };
};

function isMember(member: TelegramMember) {
  return ["creator", "administrator", "member"].includes(member.status) || (member.status === "restricted" && member.is_member === true);
}

function displayName(user: TelegramUser) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username || `Пользователь ${user.id}`;
}

async function sendMessage(chatId: string | number, text: string) {
  const token = await runtimeEnv("BOT_TOKEN");
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function POST(request: Request) {
  const expectedSecret = await runtimeEnv("TELEGRAM_WEBHOOK_SECRET");
  if (expectedSecret && request.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;

  if (update.message?.text?.startsWith("/start")) {
    const source = await runtimeEnv("SUBSCRIBER_SOURCE");
    if (source === "bot" && update.message.from) {
      const user = update.message.from;
      await recordSubscriber({
        eventKey: `telegram-start:${user.id}`,
        id: String(user.id),
        name: displayName(user),
        username: user.username ?? null,
        avatarUrl: null,
        joinedAt: new Date().toISOString(),
        source: "telegram-bot",
      });
    }
    await sendMessage(update.message.chat.id, "Бот подключён. Новые подписчики появятся в оверлее автоматически ✦");
    return Response.json({ ok: true });
  }

  const change = update.chat_member;
  if (!change || isMember(change.old_chat_member) || !isMember(change.new_chat_member)) {
    return Response.json({ ok: true, ignored: true });
  }

  const expectedChannelId = await runtimeEnv("TELEGRAM_CHANNEL_ID");
  if (expectedChannelId && String(change.chat.id) !== expectedChannelId) {
    return Response.json({ ok: true, ignored: true });
  }

  const user = change.new_chat_member.user;
  const subscriber = await recordSubscriber({
    eventKey: `telegram-update:${update.update_id}`,
    id: String(user.id),
    name: displayName(user),
    username: user.username ?? null,
    avatarUrl: null,
    joinedAt: new Date(change.date * 1000).toISOString(),
    source: "telegram-channel",
  });

  const adminChatId = await runtimeEnv("ADMIN_CHAT_ID");
  if (adminChatId) {
    await sendMessage(adminChatId, `Новый подписчик: ${subscriber.name}${subscriber.username ? ` (@${subscriber.username})` : ""}`);
  }

  return Response.json({ ok: true });
}
