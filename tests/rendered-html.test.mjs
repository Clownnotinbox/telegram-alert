import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

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
  assert.match(html, /@anna_live/);
  assert.doesNotMatch(html, /Открыть Telegram/);
  assert.match(html, /data-style="noir"/);
  assert.match(html, /\/noir-portrait\.webp\?v=1/);
  assert.doesNotMatch(html, /mascot-wave/);

  const animeResponse = await request("/overlay?preview=1&style=anime");
  assert.equal(animeResponse.status, 200);
  const animeHtml = await animeResponse.text();
  assert.match(animeHtml, /data-style="anime"/);
  assert.match(animeHtml, /Анна Смирнова/);
  assert.match(animeHtml, /\/mascot-anime-static\.png\?v=6/);

  const wideResponse = await request("/overlay?preview=1&style=noir-wide");
  assert.equal(wideResponse.status, 200);
  const wideHtml = await wideResponse.text();
  assert.match(wideHtml, /data-style="noir-wide"/);
  assert.match(wideHtml, /\/noir-wide-source\.png\?v=1/);
  assert.match(wideHtml, /--noir-name-size:66px/);
  assert.doesNotMatch(wideHtml, /Открыть Telegram/);

  const longestUsername = "a".repeat(32);
  const longMainResponse = await request(`/overlay?preview=1&style=noir&username=${longestUsername}`);
  const longMainHtml = await longMainResponse.text();
  assert.match(longMainHtml, new RegExp(`@${longestUsername}`));
  assert.match(longMainHtml, /--noir-name-size:18px/);
  assert.match(longMainHtml, /is-long/);

  const longWideResponse = await request(`/overlay?preview=1&style=noir-wide&username=${longestUsername}`);
  const longWideHtml = await longWideResponse.text();
  assert.match(longWideHtml, /--noir-name-size:26px/);

  const fallbackName = "A".repeat(60);
  const fallbackResponse = await request(`/overlay?preview=1&style=noir&username=&name=${fallbackName}`);
  const fallbackHtml = await fallbackResponse.text();
  assert.match(fallbackHtml, /--noir-name-size:18px/);
  assert.match(fallbackHtml, /is-very-long/);

  const graphiteResponse = await request("/overlay?preview=1&style=graphite");
  assert.equal(graphiteResponse.status, 200);
  assert.match(await graphiteResponse.text(), /data-style="graphite"/);
});

test("a production overlay waits honestly instead of showing a demo subscriber", async () => {
  const response = await request("/overlay?key=not-a-demo-key");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Ждём нового подписчика/);
  assert.doesNotMatch(html, /Анна Смирнова/);
});

test("serves the style preview used inside Telegram", async () => {
  const bytes = await readFile(new URL("../public/style-preview.png", import.meta.url));
  assert.ok(bytes.byteLength > 40_000);
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 1880);
});

test("noir nickname animation fades without shaking", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const animationRules = css.slice(
    css.indexOf('.subscriber-wrap[data-style="noir"] .identity-pixels'),
    css.indexOf(".noir-wide-qr"),
  );
  const keyframes = css.slice(
    css.indexOf("@keyframes noir-signal-out"),
    css.indexOf("@keyframes subscriber-progress"),
  );

  assert.doesNotMatch(animationRules, /steps\(|noir-scanline/);
  assert.doesNotMatch(keyframes, /translate|skew|clip-path|transform\s*:/);
  assert.match(keyframes, /filter: blur/);
  assert.doesNotMatch(keyframes, /brightness/, "a brightness ramp flashes the white nickname");
});

test("noir changes the nickname only while it is invisible", async () => {
  const [css, overlay] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/overlay.tsx", import.meta.url), "utf8"),
  ]);

  const durationMs = (animation) => {
    const match = new RegExp(`animation: ${animation} ([\\d.]+)s`).exec(css);
    assert.ok(match, `globals.css must keep a duration for ${animation}`);
    return Number(match[1]) * 1000;
  };
  const fadeOut = durationMs("noir-signal-out");
  const fadeIn = durationMs("noir-signal-in");

  const timings = /noir:\s*\{\s*swap:\s*(?<swap>\d+),\s*settle:\s*(?<settle>\d+)\s*\}/.exec(overlay);
  assert.ok(timings, "overlay.tsx must keep separate swap timings for noir");
  const swap = Number(timings.groups.swap);
  const settle = Number(timings.groups.settle);

  assert.ok(swap >= fadeOut, `swapping at ${swap}ms cuts the ${fadeOut}ms fade-out short`);
  assert.ok(settle >= swap + fadeIn, `settling at ${settle}ms cuts the ${fadeIn}ms fade-in short`);
});

test("the caption is replaced while it is dimmed", async () => {
  const [css, overlay] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/overlay.tsx", import.meta.url), "utf8"),
  ]);

  const dim = /\.subscriber-label\.is-swapping\s*\{[^}]*transition-duration:\s*([\d.]+)s/.exec(css);
  assert.ok(dim, "globals.css must dim the caption before the words change");
  const scheduled = /LABEL_FADE_MS = (\d+)/.exec(overlay);
  assert.ok(scheduled, "overlay.tsx must schedule the caption fade");
  assert.equal(Number(scheduled[1]), Number(dim[1]) * 1000, "the fade must end exactly when the caption flips");
});

test("ships only the original clean static anime mascot", async () => {
  const [staticBytes, baseBytes] = await Promise.all([
    readFile(new URL("../public/mascot-anime-static.png", import.meta.url)),
    readFile(new URL("../public/mascot-anime-base.png", import.meta.url)),
  ]);

  const [staticRaw, baseRaw] = await Promise.all([
    sharp(staticBytes).ensureAlpha().raw().toBuffer(),
    sharp(baseBytes).ensureAlpha().raw().toBuffer(),
  ]);
  assert.equal(Buffer.compare(staticRaw, baseRaw), 0, "the static anime style must use the original clean mascot");
  await assert.rejects(readFile(new URL("../public/mascot-wave.gif", import.meta.url)), /ENOENT/);
  await assert.rejects(readFile(new URL("../public/mascot-anime.png", import.meta.url)), /ENOENT/);
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
  assert.equal(installation.style, "noir");

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
  assert.match(subscriber.avatarUrl, new RegExp(`/api/telegram/avatar\\?key=${installation.overlayKey}&amp;user=404|/api/telegram/avatar\\?key=${installation.overlayKey}&user=404`));

  const snapshot = await request(`/api/subscribers?after=0&key=${installation.overlayKey}`, {
    headers: { accept: "application/json" },
  });
  assert.equal(snapshot.status, 200);
  assert.equal((await snapshot.json()).latest.name, "Новый Зритель");

  const originalFetch = globalThis.fetch;
  const telegramCalls = [];
  process.env.BOT_TOKEN = "test-token";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://api.telegram.org/")) return originalFetch(input, init);
    telegramCalls.push(url);
    if (url.includes("/getUserProfilePhotos")) {
      return Response.json({
        ok: true,
        result: { total_count: 1, photos: [[
          { file_id: "small", width: 64, height: 64 },
          { file_id: "large", width: 320, height: 320 },
        ]] },
      });
    }
    if (url.includes("/getFile")) {
      assert.equal(JSON.parse(init?.body || "{}").file_id, "large");
      return Response.json({ ok: true, result: { file_path: "photos/avatar.jpg" } });
    }
    if (url.includes("/file/")) {
      return new Response(Uint8Array.from([255, 216, 255, 217]), {
        headers: { "content-type": "image/jpeg" },
      });
    }
    throw new Error(`Unexpected Telegram request: ${url}`);
  };

  try {
    const avatar = await request(`/api/telegram/avatar?key=${installation.overlayKey}&user=404`, {
      headers: { accept: "image/*" },
    });
    assert.equal(avatar.status, 200);
    assert.equal(avatar.headers.get("content-type"), "image/jpeg");
    assert.deepEqual([...new Uint8Array(await avatar.arrayBuffer())], [255, 216, 255, 217]);

    const unknownUser = await request(`/api/telegram/avatar?key=${installation.overlayKey}&user=405`, {
      headers: { accept: "image/*" },
    });
    assert.equal(unknownUser.status, 404);
    assert.equal(telegramCalls.filter((url) => url.includes("/getUserProfilePhotos")).length, 1);
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
  assert.equal(installation.style, "noir");
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

  const realJoin = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      update_id: 46,
      message: {
        message_id: 8,
        date: 1_700_000_100,
        chat: { id: -100500, type: "supergroup", title: "Test channel", username: "test_channel" },
        new_chat_members: [{ id: 777, first_name: "Real", last_name: "Subscriber" }],
      },
    }),
  });
  assert.equal(realJoin.status, 200);
  assert.equal((await realJoin.json()).subscribers[0].name, "Real Subscriber");

  const testAlert = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      update_id: 44,
      callback_query: { id: "test-alert", from: { id: 101 }, data: `test:${installation.id}` },
    }),
  });
  assert.equal(testAlert.status, 200);
  const testEvent = (await testAlert.json()).event;
  assert.equal(testEvent.installationId, installation.id);
  assert.equal(testEvent.source, "telegram-test");

  const snapshot = await request(`/api/subscribers?after=0&key=${installation.overlayKey}`, {
    headers: { accept: "application/json" },
  });
  assert.equal(snapshot.status, 200);
  const snapshotBody = await snapshot.json();
  assert.equal(snapshotBody.settings.style, "paper");
  assert.equal(snapshotBody.latest.installationId, installation.id);
  assert.equal(snapshotBody.latest.name, "Real Subscriber");
  assert.equal(snapshotBody.latest.source, "telegram-group-service");
  assert.ok(snapshotBody.cursor >= testEvent.sequence);
  assert.ok(snapshotBody.events.some((event) => event.sequence === testEvent.sequence));
  assert.deepEqual(snapshotBody.community, { title: "Test channel", url: "https://t.me/test_channel" });

  const caughtUp = await request(
    `/api/subscribers?after=${snapshotBody.cursor}&key=${installation.overlayKey}`,
    { headers: { accept: "application/json" } },
  );
  assert.equal(caughtUp.status, 200);
  const caughtUpBody = await caughtUp.json();
  assert.equal(caughtUpBody.latest.name, "Real Subscriber");
  assert.deepEqual(caughtUpBody.events, []);

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
    assert.match(preview.body.photo, /\/style-preview\.png\?v=19$/);
    assert.match(preview.body.caption, /Оформление · ffdfd/);
    assert.match(preview.body.caption, /Сейчас: <b>Нуар<\/b>/);
    assert.match(preview.body.caption, /Размер OBS: <code>420 × 420<\/code>/);
    assert.match(preview.body.reply_markup.inline_keyboard[0][0].text, /^✓ /);
    assert.equal(preview.body.reply_markup.inline_keyboard[0][0].callback_data, `style:${installation.id}:noir`);
    assert.equal(preview.body.reply_markup.inline_keyboard[0][1].callback_data, `style:${installation.id}:noir-wide`);
    assert.match(preview.body.reply_markup.inline_keyboard[0][1].text, /Нуар 3:2 · 1280×853/);
    assert.equal(preview.body.reply_markup.inline_keyboard[1][0].callback_data, `style:${installation.id}:anime`);

    calls.length = 0;
    const chooseWide = await request("/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 83,
        callback_query: {
          id: "style-photo-wide",
          from: { id: ownerId },
          data: `style:${installation.id}:noir-wide`,
          message: { message_id: 902, chat: { id: ownerId, type: "private" }, photo: [{}] },
        },
      }),
    });
    assert.equal(chooseWide.status, 200);
    const wideEdit = calls.find((call) => call.method === "editMessageCaption");
    assert.ok(wideEdit);
    assert.match(wideEdit.body.caption, /Сейчас: <b>Нуар 3:2<\/b>/);
    assert.match(wideEdit.body.caption, /Размер OBS: <code>1280 × 853<\/code>/);
    assert.match(wideEdit.body.reply_markup.inline_keyboard[0][1].text, /^✓ /);

    calls.length = 0;
    const chooseStyle = await request("/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 84,
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
    assert.equal(edit.body.reply_markup.inline_keyboard[2][1].text, "✓ Только текст");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.BOT_TOKEN;
  }
});
