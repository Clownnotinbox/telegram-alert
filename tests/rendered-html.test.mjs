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

test("renders the Telegram Alert dashboard", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Telegram Alert/);
  assert.match(html, /Текущий стиль/);
  assert.match(html, /\/style/);
  assert.match(html, /Подключить Telegram/);
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

test("changes the persisted overlay style from a Telegram button", async () => {
  const callback = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      update_id: 42,
      callback_query: {
        id: "callback-test",
        from: { id: 101 },
        data: "style:paper",
        message: { message_id: 7, chat: { id: 101 } },
      },
    }),
  });
  assert.equal(callback.status, 200);
  assert.equal((await callback.json()).settings.style, "paper");

  const snapshot = await request("/api/subscribers?after=0", { headers: { accept: "application/json" } });
  assert.equal(snapshot.status, 200);
  assert.equal((await snapshot.json()).settings.style, "paper");
});
