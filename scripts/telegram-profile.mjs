const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required");

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(`${method}: ${body.description || response.status}`);
  return body.result;
}

await telegram("setMyName", { name: "Telegram Alert" });
await telegram("setMyDescription", {
  description: "Подключает Telegram-группу или канал к OBS и аккуратно показывает нового участника или подписчика в эфире. Выберите чат, получите личную Browser Source-ссылку, настройте стиль и запустите тест — всё прямо внутри бота.",
});
await telegram("setMyShortDescription", {
  short_description: "Новые участники групп и подписчики каналов — аккуратно в OBS",
});
await telegram("setMyCommands", {
  commands: [
    { command: "start", description: "Подключить группу или канал" },
    { command: "panel", description: "Мои чаты и OBS-ссылки" },
    { command: "style", description: "Выбрать оформление" },
    { command: "help", description: "Короткая инструкция" },
  ],
});
const defaultAdministratorRights = {
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
};
await Promise.all([
  telegram("setMyDefaultAdministratorRights", { for_channels: false, rights: defaultAdministratorRights }),
  telegram("setMyDefaultAdministratorRights", { for_channels: true, rights: defaultAdministratorRights }),
]);

const bot = await telegram("getMe", {});
const commands = await telegram("getMyCommands", {});
const description = await telegram("getMyDescription", {});
if (commands[0]?.description !== "Подключить группу или канал" || !description?.description?.startsWith("Подключает Telegram-группу")) {
  throw new Error("Telegram returned an invalid localized profile");
}
console.log(`Telegram profile configured for @${bot.username}`);
