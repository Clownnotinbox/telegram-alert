import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);

async function request(path, init = {}) {
  const url = new URL(workerUrl);
  url.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(url.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { accept: "text/html", ...init.headers },
    }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the self-service Telegram Alert dashboard", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Telegram Alert/);
  assert.match(html, /Стример всё делает в Telegram/);
  assert.match(html, /\/panel/);
  assert.match(html, /группу или канал/);
  assert.doesNotMatch(html, /codex-preview/);
});

test("renders the OBS overlay", async () => {
  const response = await request("/overlay?preview=1");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Последний подписчик/);
  assert.match(html, /Анна Смирнова/);
  assert.match(html, /data-style="graphite"/);
});

test("serves the style preview used inside Telegram", async () => {
  const bytes = await readFile(new URL("../public/style-preview.png", import.meta.url));
  assert.ok(bytes.byteLength > 40_000);
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("start sends one message with working group and channel buttons", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  process.env.BOT_TOKEN = "test-token";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://api.telegram.org/")) return originalFetch(input, init);
    const method = new URL(url).pathname.split("/").at(-1);
    const body = JSON.parse(init?.body || "{}");
    calls.push({ method, body });
    return Response.json({ ok: true, result: method === "sendMessage" ? { message_id: 901 } : true });
  };

  try {
    const response = await request("/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 41,
        message: {
          message_id: 4,
          text: "/start",
          chat: { id: 101, type: "private" },
          from: { id: 101, first_name: "Дарина" },
        },
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(calls.filter((call) => call.method === "sendMessage").length, 1);
    assert.equal(calls.filter((call) => call.method === "editMessageText").length, 0);
    const prompt = calls.find((call) => call.method === "sendMessage");
    assert.match(prompt.body.reply_markup.inline_keyboard[0][0].text, /Дарина/);
    assert.match(prompt.body.reply_markup.inline_keyboard[0][0].url, /startgroup=obs/);
    assert.doesNotMatch(prompt.body.reply_markup.inline_keyboard[0][0].url, /admin=/);
    assert.match(prompt.body.reply_markup.inline_keyboard[1][0].url, /^tg:\/\/resolve\?domain=xedat1va_bot&startchannel&admin=manage_chat$/);
    assert.equal(prompt.body.reply_markup.inline_keyboard.length, 2);

    calls.length = 0;
    const groupCommand = await request("/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 42,
        message: {
          message_id: 5,
          text: "/start",
          chat: { id: -100500, type: "supergroup", title: "Тихая группа" },
          from: { id: 101, first_name: "Дарина" },
        },
      }),
    });
    assert.equal(groupCommand.status, 200);
    assert.equal((await groupCommand.json()).ignored, true);
    assert.equal(calls.length, 0);

    const membership = await request("/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 43,
        my_chat_member: {
          chat: { id: -100500, type: "supergroup", title: "Тихая группа" },
          from: { id: 101, first_name: "Дарина" },
          old_chat_member: { status: "left", user: { id: 777 } },
          new_chat_member: { status: "member", user: { id: 777 } },
          date: 1_700_000_000,
        },
      }),
    });
    assert.equal(membership.status, 200);
    assert.ok((await membership.json()).installation);
    const membershipMessages = calls.filter((call) => call.method === "sendMessage");
    assert.equal(membershipMessages.length, 1);
    assert.equal(membershipMessages[0].body.chat_id, 101);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.BOT_TOKEN;
  }
});

test("a regular group member receives join events without bot admin rights", async () => {
  const connected = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      update_id: 50,
      my_chat_member: {
        chat: { id: -100700, type: "supergroup", title: "Группа без администратора" },
        from: { id: 303, first_name: "Дарина" },
        old_chat_member: { status: "left", user: { id: 777, is_bot: true } },
        new_chat_member: { status: "member", user: { id: 777, is_bot: true } },
        date: 1_700_000_000,
      },
    }),
  });
  assert.equal(connected.status, 200);
  const installation = (await connected.json()).installation;
  assert.equal(installation.ownerUserId, "303");
  assert.equal(installation.active, true);

  const joined = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      update_id: 51,
      message: {
        message_id: 8,
        date: 1_700_000_100,
        chat: { id: -100700, type: "supergroup", title: "Группа без администратора" },
        new_chat_members: [{ id: 404, first_name: "Новый", last_name: "Зритель" }],
      },
    }),
  });
  assert.equal(joined.status, 200);
  const subscriber = (await joined.json()).subscribers[0];
  assert.equal(subscriber.name, "Новый Зритель");

  const snapshot = await request(`/api/subscribers?after=0&key=${installation.overlayKey}`, {
    headers: { accept: "application/json" },
  });
  assert.equal(snapshot.status, 200);
  assert.equal((await snapshot.json()).latest.name, "Новый Зритель");
});

test("self-service flow creates a private overlay, changes style and sends a test", async () => {
  const connected = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      update_id: 42,
      message: {
        message_id: 5,
        chat: { id: 101, type: "private" },
        from: { id: 101, first_name: "Streamer" },
        chat_shared: { request_id: 73001, chat_id: -100500, title: "Test channel", username: "test_channel" },
      },
    }),
  });
  assert.equal(connected.status, 200);
  const installation = (await connected.json()).installation;
  assert.equal(installation.ownerUserId, "101");
  assert.equal(installation.channelId, "-100500");
  assert.ok(installation.overlayKey.length >= 40);

  const callback = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      update_id: 43,
      callback_query: {
        id: "callback-test",
        from: { id: 101 },
        data: `style:${installation.id}:paper`,
        message: { message_id: 7, chat: { id: 101 } },
      },
    }),
  });
  assert.equal(callback.status, 200);
  assert.equal((await callback.json()).settings.style, "paper");

  const forbidden = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      update_id: 45,
      callback_query: { id: "wrong-owner", from: { id: 202 }, data: `style:${installation.id}:mono` },
    }),
  });
  assert.equal(forbidden.status, 200);
  assert.equal((await forbidden.json()).forbidden, true);

  const testAlert = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      update_id: 44,
      callback_query: { id: "test-alert", from: { id: 101 }, data: `test:${installation.id}` },
    }),
  });
  assert.equal(testAlert.status, 200);
  assert.equal((await testAlert.json()).event.installationId, installation.id);

  const snapshot = await request(`/api/subscribers?after=0&key=${installation.overlayKey}`, {
    headers: { accept: "application/json" },
  });
  assert.equal(snapshot.status, 200);
  const snapshotBody = await snapshot.json();
  assert.equal(snapshotBody.settings.style, "paper");
  assert.equal(snapshotBody.latest.installationId, installation.id);

  const privateSnapshot = await request("/api/subscribers?after=0&key=wrong-key", {
    headers: { accept: "application/json" },
  });
  assert.equal(privateSnapshot.status, 404);
});

test("panel stays compact and style shows visual choices in Telegram", async () => {
  const ownerId = 505;
  const connected = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      update_id: 80,
      message: {
        message_id: 12,
        chat: { id: ownerId, type: "private" },
        from: { id: ownerId, first_name: "Дарина" },
        chat_shared: { request_id: 73002, chat_id: -100800, title: "ffdfd" },
      },
    }),
  });
  assert.equal(connected.status, 200);
  const installation = (await connected.json()).installation;

  const originalFetch = globalThis.fetch;
  const calls = [];
  process.env.BOT_TOKEN = "test-token";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://api.telegram.org/")) return originalFetch(input, init);
    const method = new URL(url).pathname.split("/").at(-1);
    const body = JSON.parse(init?.body || "{}");
    calls.push({ method, body });
    return Response.json({ ok: true, result: method === "sendMessage" || method === "sendPhoto" ? { message_id: 902 } : true });
  };

  try {
    const panel = await request("/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 81,
        message: {
          message_id: 13,
          text: "/panel",
          chat: { id: ownerId, type: "private" },
          from: { id: ownerId, first_name: "Дарина" },
        },
      }),
    });
    assert.equal(panel.status, 200);
    const panelMessages = calls.filter((call) => call.method === "sendMessage");
    assert.equal(panelMessages.length, 1);
    assert.match(panelMessages[0].body.text, /ffdfd/);
    assert.doesNotMatch(panelMessages[0].body.text, /Ваши оверлеи/);
    assert.equal(panelMessages[0].body.reply_markup.inline_keyboard[0][0].callback_data, `style-menu:${installation.id}`);

    calls.length = 0;
    const style = await request("/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 82,
        message: {
          message_id: 14,
          text: "/style",
          chat: { id: ownerId, type: "private" },
          from: { id: ownerId, first_name: "Дарина" },
        },
      }),
    });
    assert.equal(style.status, 200);
    const preview = calls.find((call) => call.method === "sendPhoto");
    assert.ok(preview);
    assert.match(preview.body.photo, /\/style-preview\.png\?v=1$/);
    assert.match(preview.body.caption, /Оформление · ffdfd/);
    assert.match(preview.body.caption, /Сейчас: <b>Графит<\/b>/);
    assert.equal(preview.body.reply_markup.inline_keyboard[0][0].text, "✓ Графит");

    calls.length = 0;
    const chooseStyle = await request("/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 83,
        callback_query: {
          id: "style-photo",
          from: { id: ownerId },
          data: `style:${installation.id}:mono`,
          message: { message_id: 902, chat: { id: ownerId, type: "private" }, photo: [{}] },
        },
      }),
    });
    assert.equal(chooseStyle.status, 200);
    const edit = calls.find((call) => call.method === "editMessageCaption");
    assert.ok(edit);
    assert.match(edit.body.caption, /Сейчас: <b>Только текст<\/b>/);
    assert.equal(edit.body.reply_markup.inline_keyboard[1][0].text, "✓ Только текст");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.BOT_TOKEN;
  }
});
