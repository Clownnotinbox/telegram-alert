import { runtimeEnv } from "../../../../lib/runtime-env";
import {
  getOverlaySettings,
  isOverlayStyle,
  recordSubscriber,
  setOverlayStyle,
  type OverlayStyle,
} from "../../../../lib/subscribers";

type TelegramUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TelegramMember = { status: string; is_member?: boolean; user: TelegramUser };
type TelegramUpdate = {
  update_id: number;
  message?: { message_id: number; text?: string; chat: { id: number }; from?: TelegramUser };
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
  chat_member?: {
    chat: { id: number; title?: string };
    old_chat_member: TelegramMember;
    new_chat_member: TelegramMember;
    date: number;
  };
};

const STYLE_LABELS: Record<OverlayStyle, string> = {
  graphite: "Графит",
  paper: "Светлый",
  mono: "Только текст",
};

function isMember(member: TelegramMember) {
  return ["creator", "administrator", "member"].includes(member.status) || (member.status === "restricted" && member.is_member === true);
}

function displayName(user: TelegramUser) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username || `Пользователь ${user.id}`;
}

async function telegramCall(method: string, payload: Record<string, unknown>) {
  const token = await runtimeEnv("BOT_TOKEN");
  if (!token) return null;
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function styleKeyboard(current: OverlayStyle) {
  return {
    inline_keyboard: [[
      { text: `${current === "graphite" ? "✓ " : ""}Графит`, callback_data: "style:graphite" },
      { text: `${current === "paper" ? "✓ " : ""}Светлый`, callback_data: "style:paper" },
    ], [
      { text: `${current === "mono" ? "✓ " : ""}Только текст`, callback_data: "style:mono" },
    ]],
  };
}

function styleMessage(current: OverlayStyle) {
  return `Оформление оверлея\n\nСейчас: ${STYLE_LABELS[current]}\nИзменение появится в OBS автоматически.`;
}

async function canManageStyle(chatId: number | undefined, userId: number) {
  const adminChatId = await runtimeEnv("ADMIN_CHAT_ID");
  return !adminChatId || adminChatId === String(chatId) || adminChatId === String(userId);
}

async function sendStyleMenu(chatId: number) {
  const settings = await getOverlaySettings();
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text: styleMessage(settings.style),
    reply_markup: styleKeyboard(settings.style),
  });
}

export async function POST(request: Request) {
  const expectedSecret = await runtimeEnv("TELEGRAM_WEBHOOK_SECRET");
  if (expectedSecret && request.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;

  const callback = update.callback_query;
  if (callback?.data?.startsWith("style:")) {
    const requestedStyle = callback.data.slice("style:".length);
    if (!isOverlayStyle(requestedStyle)) {
      await telegramCall("answerCallbackQuery", { callback_query_id: callback.id, text: "Неизвестный стиль" });
      return Response.json({ ok: true, ignored: true });
    }

    if (!(await canManageStyle(callback.message?.chat.id, callback.from.id))) {
      await telegramCall("answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Менять стиль может только владелец бота",
        show_alert: true,
      });
      return Response.json({ ok: true, forbidden: true });
    }

    const settings = await setOverlayStyle(requestedStyle);
    await telegramCall("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: `Выбран стиль «${STYLE_LABELS[settings.style]}»`,
    });
    if (callback.message) {
      await telegramCall("editMessageText", {
        chat_id: callback.message.chat.id,
        message_id: callback.message.message_id,
        text: styleMessage(settings.style),
        reply_markup: styleKeyboard(settings.style),
      });
    }
    return Response.json({ ok: true, settings });
  }

  if (update.message?.text?.startsWith("/style")) {
    if (!(await canManageStyle(update.message.chat.id, update.message.from?.id ?? update.message.chat.id))) {
      await telegramCall("sendMessage", { chat_id: update.message.chat.id, text: "Менять стиль может только владелец бота." });
      return Response.json({ ok: true, forbidden: true });
    }
    await sendStyleMenu(update.message.chat.id);
    return Response.json({ ok: true });
  }

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
    const settings = await getOverlaySettings();
    await telegramCall("sendMessage", {
      chat_id: update.message.chat.id,
      text: `Бот подключён. Новые подписчики появятся в оверлее автоматически.\n\nСтиль: ${STYLE_LABELS[settings.style]}`,
      reply_markup: styleKeyboard(settings.style),
    });
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
    await telegramCall("sendMessage", {
      chat_id: adminChatId,
      text: `Новый подписчик: ${subscriber.name}${subscriber.username ? ` (@${subscriber.username})` : ""}`,
    });
  }

  return Response.json({ ok: true });
}
