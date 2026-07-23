import { normalizeTelegramWebhookSecret, runtimeEnv } from "../../../../lib/runtime-env";
import {
  getInstallationByChannelId,
  getInstallationById,
  isOverlayStyle,
  listInstallationsByOwner,
  recordSubscriber,
  setInstallationActive,
  setOverlayStyle,
  upsertStreamerInstallation,
  type OverlayStyle,
  type StreamerInstallation,
} from "../../../../lib/subscribers";

type TelegramUser = { id: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string };
type TelegramMember = { status: string; is_member?: boolean; user: TelegramUser };
type TelegramChat = { id: number; type?: string; title?: string; username?: string };
type MemberUpdate = {
  chat: TelegramChat;
  from: TelegramUser;
  old_chat_member: TelegramMember;
  new_chat_member: TelegramMember;
  date: number;
};
type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date?: number;
    text?: string;
    chat: TelegramChat;
    from?: TelegramUser;
    chat_shared?: { request_id: number; chat_id: number; title?: string; username?: string };
    new_chat_members?: TelegramUser[];
  };
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: { message_id: number; chat: TelegramChat; photo?: unknown[] };
  };
  my_chat_member?: MemberUpdate;
  chat_member?: MemberUpdate;
};

const STYLE_LABELS: Record<OverlayStyle, string> = {
  graphite: "Графит",
  paper: "Светлый",
  mono: "Только текст",
  anime: "Аниме",
};

const BOT_USERNAME = "xedat1va_bot";

function isMember(member: TelegramMember) {
  return ["creator", "administrator", "member"].includes(member.status)
    || (member.status === "restricted" && member.is_member === true);
}

function isAdministrator(member: TelegramMember) {
  return member.status === "creator" || member.status === "administrator";
}

function displayName(user: TelegramUser) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim()
    || user.username
    || `Пользователь ${user.id}`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function telegramCall<T>(method: string, payload: Record<string, unknown>): Promise<T | null> {
  const token = await runtimeEnv("BOT_TOKEN");
  if (!token) return null;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || !body.ok) throw new Error(body.description || `Telegram ${method} failed`);
  return body.result ?? null;
}

async function publicBaseUrl(request: Request) {
  const configured = await runtimeEnv("PUBLIC_URL");
  const renderUrl = await runtimeEnv("RENDER_EXTERNAL_URL");
  return (configured || renderUrl || new URL(request.url).origin).replace(/\/$/, "");
}

function overlayUrl(baseUrl: string, installation: StreamerInstallation) {
  return `${baseUrl}/overlay?key=${installation.overlayKey}`;
}

function subscriberAvatarUrl(baseUrl: string, installation: StreamerInstallation, userId: number) {
  const query = new URLSearchParams({ key: installation.overlayKey, user: String(userId) });
  return `${baseUrl}/api/telegram/avatar?${query}`;
}

function installationPanelText(installation: StreamerInstallation, baseUrl: string) {
  const status = installation.active ? "работает" : "отключён";
  return [
    `<b>${escapeHtml(installation.channelTitle)}</b>`,
    `Статус: ${status}`,
    `Стиль: ${STYLE_LABELS[installation.style]}`,
    "",
    "Ссылка для OBS:",
    `<code>${overlayUrl(baseUrl, installation)}</code>`,
    "",
    "Размер Browser Source: <code>420 × 420</code>",
    installation.channelUsername
      ? "QR-код публичной ссылки включён."
      : "QR-код появится, когда у чата будет публичная @ссылка.",
    "Изменения применяются автоматически.",
  ].join("\n");
}

function installationKeyboard(installation: StreamerInstallation, baseUrl: string) {
  return {
    inline_keyboard: [
      [
        { text: "🎨 Изменить оформление", callback_data: `style-menu:${installation.id}` },
        { text: "Проверить в OBS", callback_data: `test:${installation.id}` },
      ],
      [{ text: "Скопировать OBS-ссылку", copy_text: { text: overlayUrl(baseUrl, installation) } }],
      [
        { text: "Подключить ещё группу или канал", callback_data: "connect" },
        { text: "Отключить", callback_data: `disable:${installation.id}` },
      ],
    ],
  };
}

function styleCaption(installation: StreamerInstallation) {
  return [
    `<b>Оформление · ${escapeHtml(installation.channelTitle)}</b>`,
    `Сейчас: <b>${STYLE_LABELS[installation.style]}</b>`,
    "",
    "Выберите вариант ниже. OBS обновится сразу — ссылку менять не нужно.",
  ].join("\n");
}

function styleKeyboard(installation: StreamerInstallation) {
  return {
    inline_keyboard: [
      [
        { text: `${installation.style === "anime" ? "✓ " : ""}Аниме`, callback_data: `style:${installation.id}:anime` },
        { text: `${installation.style === "graphite" ? "✓ " : ""}Графит`, callback_data: `style:${installation.id}:graphite` },
      ],
      [
        { text: `${installation.style === "paper" ? "✓ " : ""}Светлый`, callback_data: `style:${installation.id}:paper` },
        { text: `${installation.style === "mono" ? "✓ " : ""}Только текст`, callback_data: `style:${installation.id}:mono` },
      ],
      [
        { text: "Проверить в OBS", callback_data: `test:${installation.id}` },
        { text: "← Вернуться к панели", callback_data: `channel:${installation.id}` },
      ],
    ],
  };
}

async function sendInstallationPanel(chatId: number | string, installation: StreamerInstallation, baseUrl: string) {
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text: installationPanelText(installation, baseUrl),
    parse_mode: "HTML",
    reply_markup: installationKeyboard(installation, baseUrl),
  });
}

async function sendStylePanel(chatId: number | string, installation: StreamerInstallation, baseUrl: string) {
  await telegramCall("sendPhoto", {
    chat_id: chatId,
    photo: `${baseUrl}/style-preview.png?v=6`,
    caption: styleCaption(installation),
    parse_mode: "HTML",
    reply_markup: styleKeyboard(installation),
  });
}

function promptName(user?: TelegramUser) {
  return user?.first_name?.trim().slice(0, 20) || "стример";
}

async function sendConnectPrompt(chatId: number | string, user?: TelegramUser) {
  const name = promptName(user);
  const text = `<b>${escapeHtml(name)}, выберите, что подключаем:</b> для группы права администратора не нужны. Канал откроется в приложении Telegram и запросит минимальные права администратора. Сам бот ничего писать в выбранный чат не будет.`;
  const groupUrl = `https://t.me/${BOT_USERNAME}?startgroup=obs`;
  const channelUrl = `tg://resolve?domain=${BOT_USERNAME}&startchannel&admin=manage_chat`;
  try {
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: `👥 Подключить группу, ${name}`, url: groupUrl }],
          [{ text: "📣 Подключить канал в приложении Telegram", url: channelUrl }],
        ],
      },
    });
  } catch (error) {
    console.error("Telegram onboarding buttons failed", error);
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text: `${text}\n\n<a href="${groupUrl}">Добавить в группу</a> · <a href="${channelUrl}">Добавить в канал</a>`,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }).catch((fallbackError) => console.error("Telegram onboarding fallback failed", fallbackError));
  }
}

async function sendHome(chatId: number, owner: TelegramUser, baseUrl: string) {
  const installations = await listInstallationsByOwner(String(owner.id));
  if (!installations.length) {
    await sendConnectPrompt(chatId, owner);
    return;
  }

  if (installations.length === 1) {
    await sendInstallationPanel(chatId, installations[0], baseUrl);
    return;
  }

  await telegramCall("sendMessage", {
    chat_id: chatId,
    text: "Ваши оверлеи. Выберите чат или подключите новый.",
    reply_markup: {
      inline_keyboard: [
        ...installations.map((installation) => [{
          text: `${installation.active ? "●" : "○"} ${installation.channelTitle}`,
          callback_data: `channel:${installation.id}`,
        }]),
        [{ text: "Подключить ещё группу или канал", callback_data: "connect" }],
      ],
    },
  });
}

async function sendStyleHome(chatId: number, owner: TelegramUser, baseUrl: string) {
  const installations = await listInstallationsByOwner(String(owner.id));
  if (!installations.length) {
    await sendConnectPrompt(chatId, owner);
    return;
  }
  if (installations.length === 1) {
    await sendStylePanel(chatId, installations[0], baseUrl);
    return;
  }

  await telegramCall("sendMessage", {
    chat_id: chatId,
    text: "Для какого чата меняем оформление?",
    reply_markup: {
      inline_keyboard: installations.map((installation) => [{
        text: installation.channelTitle,
        callback_data: `style-menu:${installation.id}`,
      }]),
    },
  });
}

async function ownedInstallation(id: string, ownerUserId: string) {
  const installation = await getInstallationById(id);
  return installation?.ownerUserId === ownerUserId ? installation : null;
}

async function answerUnauthorized(callbackId: string) {
  await telegramCall("answerCallbackQuery", {
    callback_query_id: callbackId,
    text: "Этот чат подключал другой пользователь",
    show_alert: true,
  });
}

async function registerChannel(
  owner: TelegramUser,
  ownerChatId: number,
  chat: { id: number; title?: string; username?: string },
) {
  return upsertStreamerInstallation({
    ownerUserId: String(owner.id),
    ownerChatId: String(ownerChatId),
    channelId: String(chat.id),
    channelTitle: chat.title?.trim().slice(0, 120) || `Канал ${chat.id}`,
    channelUsername: chat.username?.trim().replace(/^@/, "").slice(0, 64) || null,
  });
}

export async function POST(request: Request) {
  const expectedSecret = normalizeTelegramWebhookSecret(await runtimeEnv("TELEGRAM_WEBHOOK_SECRET"));
  if (expectedSecret && request.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const baseUrl = await publicBaseUrl(request);
  const callback = update.callback_query;

  if (callback?.data === "connect") {
    await telegramCall("answerCallbackQuery", { callback_query_id: callback.id });
    await sendConnectPrompt(callback.from.id, callback.from);
    return Response.json({ ok: true });
  }

  if (callback?.data?.startsWith("channel:")) {
    const installation = await ownedInstallation(callback.data.slice("channel:".length), String(callback.from.id));
    if (!installation) {
      await answerUnauthorized(callback.id);
      return Response.json({ ok: true, forbidden: true });
    }
    await telegramCall("answerCallbackQuery", { callback_query_id: callback.id });
    if (callback.message) {
      await telegramCall("deleteMessage", {
        chat_id: callback.message.chat.id,
        message_id: callback.message.message_id,
      }).catch(() => null);
    }
    await sendInstallationPanel(callback.from.id, installation, baseUrl);
    return Response.json({ ok: true, installation });
  }

  if (callback?.data?.startsWith("style-menu:")) {
    const installation = await ownedInstallation(callback.data.slice("style-menu:".length), String(callback.from.id));
    if (!installation) {
      await answerUnauthorized(callback.id);
      return Response.json({ ok: true, forbidden: true });
    }
    await telegramCall("answerCallbackQuery", { callback_query_id: callback.id });
    if (callback.message) {
      await telegramCall("deleteMessage", {
        chat_id: callback.message.chat.id,
        message_id: callback.message.message_id,
      }).catch(() => null);
    }
    await sendStylePanel(callback.from.id, installation, baseUrl);
    return Response.json({ ok: true, installation });
  }

  if (callback?.data?.startsWith("style:")) {
    const [, installationId, requestedStyle] = callback.data.split(":");
    const installation = await ownedInstallation(installationId, String(callback.from.id));
    if (!installation) {
      await answerUnauthorized(callback.id);
      return Response.json({ ok: true, forbidden: true });
    }
    if (!isOverlayStyle(requestedStyle)) {
      await telegramCall("answerCallbackQuery", { callback_query_id: callback.id, text: "Неизвестный стиль" });
      return Response.json({ ok: true, ignored: true });
    }

    const settings = await setOverlayStyle(requestedStyle, installation.id);
    const updated = (await getInstallationById(installation.id))!;
    await telegramCall("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: `Выбран стиль «${STYLE_LABELS[settings.style]}»`,
    });
    if (callback.message) {
      if (callback.message.photo?.length) {
        await telegramCall("editMessageCaption", {
          chat_id: callback.message.chat.id,
          message_id: callback.message.message_id,
          caption: styleCaption(updated),
          parse_mode: "HTML",
          reply_markup: styleKeyboard(updated),
        });
      } else {
        await telegramCall("editMessageText", {
          chat_id: callback.message.chat.id,
          message_id: callback.message.message_id,
          text: installationPanelText(updated, baseUrl),
          parse_mode: "HTML",
          reply_markup: installationKeyboard(updated, baseUrl),
        });
      }
    }
    return Response.json({ ok: true, settings, installation: updated });
  }

  if (callback?.data?.startsWith("test:")) {
    const installation = await ownedInstallation(callback.data.slice("test:".length), String(callback.from.id));
    if (!installation) {
      await answerUnauthorized(callback.id);
      return Response.json({ ok: true, forbidden: true });
    }
    const samples = [
      ["Алексей Лебедев", "alex_live"],
      ["София Белова", "sofi_bel"],
      ["Михаил Воронцов", "misha_vrn"],
    ];
    const [name, username] = samples[Math.floor(Math.random() * samples.length)];
    const event = await recordSubscriber({
      eventKey: `self-test:${installation.id}:${crypto.randomUUID()}`,
      installationId: installation.id,
      id: crypto.randomUUID(),
      name,
      username,
      avatarUrl: null,
      joinedAt: new Date().toISOString(),
      source: "telegram-test",
    });
    await telegramCall("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Тест отправлен в OBS",
    });
    return Response.json({ ok: true, event });
  }

  if (callback?.data?.startsWith("disable:")) {
    const installation = await ownedInstallation(callback.data.slice("disable:".length), String(callback.from.id));
    if (!installation) {
      await answerUnauthorized(callback.id);
      return Response.json({ ok: true, forbidden: true });
    }
    await telegramCall("answerCallbackQuery", { callback_query_id: callback.id });
    if (callback.message) {
      await telegramCall("editMessageText", {
        chat_id: callback.message.chat.id,
        message_id: callback.message.message_id,
        text: `<b>Отключить ${escapeHtml(installation.channelTitle)}?</b>\n\nOBS-ссылка перестанет работать, бот выйдет из канала.`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "Да, отключить", callback_data: `disable-confirm:${installation.id}` },
            { text: "Отмена", callback_data: `channel:${installation.id}` },
          ]],
        },
      });
    }
    return Response.json({ ok: true });
  }

  if (callback?.data?.startsWith("disable-confirm:")) {
    const installation = await ownedInstallation(callback.data.slice("disable-confirm:".length), String(callback.from.id));
    if (!installation) {
      await answerUnauthorized(callback.id);
      return Response.json({ ok: true, forbidden: true });
    }
    await setInstallationActive(installation.id, false);
    await telegramCall("leaveChat", { chat_id: installation.channelId }).catch(() => null);
    await telegramCall("answerCallbackQuery", { callback_query_id: callback.id, text: "Чат отключён" });
    if (callback.message) {
      await telegramCall("editMessageText", {
        chat_id: callback.message.chat.id,
        message_id: callback.message.message_id,
        text: `<b>${escapeHtml(installation.channelTitle)}</b> отключён. Его OBS-ссылка больше не принимает события.`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "Подключить группу или канал", callback_data: "connect" }]] },
      });
    }
    return Response.json({ ok: true });
  }

  const message = update.message;
  if (message?.new_chat_members?.length && ["group", "supergroup"].includes(message.chat.type || "")) {
    const installation = await getInstallationByChannelId(String(message.chat.id));
    if (!installation || !installation.active) {
      return Response.json({ ok: true, ignored: true });
    }

    const joinedAt = new Date((message.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
    const subscribers = [];
    for (const user of message.new_chat_members.filter((member) => !member.is_bot)) {
      subscribers.push(await recordSubscriber({
        eventKey: `telegram-member:${message.chat.id}:${user.id}:${message.date ?? update.update_id}`,
        installationId: installation.id,
        id: String(user.id),
        name: displayName(user),
        username: user.username ?? null,
        avatarUrl: subscriberAvatarUrl(baseUrl, installation, user.id),
        joinedAt,
        source: "telegram-group-service",
      }));
    }
    return Response.json({ ok: true, subscribers });
  }

  if (message && message.chat.type !== "private") {
    return Response.json({ ok: true, ignored: true });
  }

  if (message?.chat_shared && message.from) {
    const result = await registerChannel(message.from, message.chat.id, {
      id: message.chat_shared.chat_id,
      title: message.chat_shared.title,
      username: message.chat_shared.username,
    });
    if (result.ownershipConflict) {
      await telegramCall("sendMessage", {
        chat_id: message.chat.id,
        text: "Этот чат уже подключён другим пользователем. Сначала его нужно отключить в прежнем аккаунте.",
        reply_markup: { remove_keyboard: true },
      });
      return Response.json({ ok: true, conflict: true });
    }
    await telegramCall("sendMessage", {
      chat_id: message.chat.id,
      text: "Готово — группа или канал подключены. Ни ID, ни ключи вводить не нужно.",
      reply_markup: { remove_keyboard: true },
    });
    await sendInstallationPanel(message.chat.id, result.installation, baseUrl);
    return Response.json({ ok: true, installation: result.installation });
  }

  if (message?.text?.startsWith("/style")) {
    const owner = message.from ?? { id: message.chat.id };
    await sendStyleHome(message.chat.id, owner, baseUrl);
    return Response.json({ ok: true });
  }

  if (message?.text?.startsWith("/start") || message?.text?.startsWith("/panel")) {
    const owner = message.from ?? { id: message.chat.id };
    await sendHome(message.chat.id, owner, baseUrl);
    return Response.json({ ok: true });
  }

  if (message?.text?.startsWith("/help")) {
    await telegramCall("sendMessage", {
      chat_id: message.chat.id,
      text: "1. Откройте /panel\n2. Нажмите кнопку выбора группы или канала\n3. Выберите нужный чат\n4. Скопируйте OBS-ссылку\n5. Добавьте её как Browser Source 420 × 420\n\nВсё остальное бот сделает сам.",
    });
    return Response.json({ ok: true });
  }

  const ownMembership = update.my_chat_member;
  if (ownMembership) {
    const existing = await getInstallationByChannelId(String(ownMembership.chat.id));
    if (isAdministrator(ownMembership.new_chat_member)) {
      const result = await registerChannel(
        ownMembership.from,
        ownMembership.from.id,
        ownMembership.chat,
      );
      if (!result.ownershipConflict && result.created) {
        await telegramCall("sendMessage", {
          chat_id: ownMembership.from.id,
          text: `Чат «${result.installation.channelTitle}» подключён. Откройте /panel, чтобы получить OBS-ссылку.`,
        }).catch(() => null);
      }
      return Response.json({ ok: true, installation: result.installation, conflict: result.ownershipConflict });
    }
    if (!isMember(ownMembership.old_chat_member) && isMember(ownMembership.new_chat_member)) {
      if (["group", "supergroup"].includes(ownMembership.chat.type || "")) {
        const result = await registerChannel(ownMembership.from, ownMembership.from.id, ownMembership.chat);
        if (!result.ownershipConflict && result.created) {
          await telegramCall("sendMessage", {
            chat_id: ownMembership.from.id,
            text: `Группа «${result.installation.channelTitle}» подключена без прав администратора. Откройте /panel, чтобы получить OBS-ссылку.`,
          }).catch(() => null);
        }
        return Response.json({ ok: true, installation: result.installation, conflict: result.ownershipConflict });
      }
      return Response.json({ ok: true, needsAdministrator: true });
    }
    if (existing && !isAdministrator(ownMembership.new_chat_member)) {
      if (["group", "supergroup"].includes(ownMembership.chat.type || "") && isMember(ownMembership.new_chat_member)) {
        return Response.json({ ok: true, installation: existing });
      }
      await setInstallationActive(existing.id, false);
      if (isMember(ownMembership.new_chat_member)) {
        await telegramCall("sendMessage", {
          chat_id: existing.ownerChatId,
          text: `Оверлей «${existing.channelTitle}» остановлен: боту нужны права администратора чата. Подключите его заново через /panel.`,
        }).catch(() => null);
      }
    }
    return Response.json({ ok: true });
  }

  const change = update.chat_member;
  if (!change || isMember(change.old_chat_member) || !isMember(change.new_chat_member)) {
    return Response.json({ ok: true, ignored: true });
  }

  const installation = await getInstallationByChannelId(String(change.chat.id));
  if (!installation || !installation.active) {
    return Response.json({ ok: true, ignored: true });
  }

  const user = change.new_chat_member.user;
  const subscriber = await recordSubscriber({
    eventKey: `telegram-member:${change.chat.id}:${user.id}:${change.date}`,
    installationId: installation.id,
    id: String(user.id),
    name: displayName(user),
    username: user.username ?? null,
    avatarUrl: subscriberAvatarUrl(baseUrl, installation, user.id),
    joinedAt: new Date(change.date * 1000).toISOString(),
    source: "telegram-channel",
  });

  return Response.json({ ok: true, subscriber });
}
