import assert from "node:assert/strict";
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

test("start sends one visible prompt with working group and channel links", async () => {
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
    const edit = calls.find((call) => call.method === "editMessageText");
    assert.ok(edit);
    assert.match(edit.body.reply_markup.inline_keyboard[0][0].text, /Дарина/);
    assert.match(edit.body.reply_markup.inline_keyboard[0][0].url, /startgroup=obs/);
    assert.match(edit.body.reply_markup.inline_keyboard[1][0].url, /startchannel=obs/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.BOT_TOKEN;
  }
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
