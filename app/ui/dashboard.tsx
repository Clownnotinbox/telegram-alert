"use client";

import { useEffect, useState } from "react";

const TEST_NAMES = [
  ["Михаил Воронцов", "misha_vrn"],
  ["София Белова", "sofi_bel"],
  ["Алексей Лебедев", "alex_live"],
  ["Мария Орлова", "maria_orlova"],
];

export function Dashboard() {
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [message, setMessage] = useState("Локальный тест не требует ключа администратора.");
  const [sampleIndex, setSampleIndex] = useState(0);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((response) => setOnline(response.ok))
      .catch(() => setOnline(false));
  }, []);

  const headers = () => ({
    "content-type": "application/json",
    ...(adminKey ? { "x-admin-key": adminKey } : {}),
  });

  const testSubscriber = async () => {
    setBusy(true);
    const [name, username] = TEST_NAMES[sampleIndex % TEST_NAMES.length];
    try {
      const response = await fetch("/api/subscribers", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ name, username }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось создать событие");
      setSampleIndex((value) => value + 1);
      setMessage(`Тест отправлен: ${name}. Оверлей обновится через секунду.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка теста");
    } finally {
      setBusy(false);
    }
  };

  const setupWebhook = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/telegram/setup", { method: "POST", headers: headers() });
      const result = (await response.json()) as { description?: string; webhook?: string; error?: string };
      if (!response.ok) throw new Error(result.error || result.description || "Не удалось подключить webhook");
      setMessage(`Webhook подключён: ${result.webhook}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка подключения");
    } finally {
      setBusy(false);
    }
  };

  const copyOverlay = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/overlay`);
    setMessage("Адрес оверлея скопирован.");
  };

  return (
    <main className="dashboard">
      <div className="shell">
        <header className="topbar">
          <div className="brand"><span className="brand-mark">↗</span> Telegram Alert</div>
          <div className="service-status"><span className="status-dot" />{online ? "Сервис готов" : "Нет соединения"}</div>
        </header>

        <section className="hero-copy">
          <div className="eyebrow">Live overlay</div>
          <h1>Каждый новый подписчик — <span>заметный момент.</span></h1>
          <p>Бот ловит событие Telegram, сохраняет подписчика и мягко обновляет карточку в OBS без перезагрузки сцены.</p>
        </section>

        <section className="workspace-grid">
          <div className="panel preview-panel">
            <div className="panel-header">
              <h2 className="panel-title">Предпросмотр оверлея</h2>
              <span className="preview-dimensions">580 × 178 px</span>
            </div>
            <div className="preview-window">
              <iframe src="/overlay?preview=1" title="Предпросмотр уведомления о подписчике" />
            </div>
            <div className="preview-actions">
              <button className="button button-primary" type="button" disabled={busy} onClick={testSubscriber}>✦ Проверить анимацию</button>
              <button className="button button-secondary" type="button" onClick={copyOverlay}>Скопировать адрес OBS</button>
              <a className="button button-secondary" href="/overlay?preview=1" target="_blank" rel="noreferrer">Открыть отдельно ↗</a>
            </div>
          </div>

          <aside className="panel setup-panel">
            <h2>Подключение Telegram</h2>
            <p className="setup-intro">После деплоя достаточно добавить секреты и один раз активировать webhook.</p>
            <ol className="checklist">
              <li className="check-item"><span className="check-number">01</span><span className="check-copy"><strong>Добавь бота в канал</strong><span>Назначь его администратором, чтобы видеть новых участников.</span></span></li>
              <li className="check-item"><span className="check-number">02</span><span className="check-copy"><strong>Заполни переменные Render</strong><span>BOT_TOKEN, TELEGRAM_CHANNEL_ID и два секретных ключа.</span></span></li>
              <li className="check-item"><span className="check-number">03</span><span className="check-copy"><strong>Активируй webhook</strong><span>Вставь ADMIN_KEY ниже и нажми кнопку после успешного деплоя.</span></span></li>
            </ol>
            <input className="secret-field" type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="ADMIN_KEY после деплоя" aria-label="Ключ администратора" />
            <button className="button button-primary" type="button" disabled={busy} onClick={setupWebhook}>Подключить webhook</button>
            <p className="action-message" aria-live="polite">{message}</p>
          </aside>
        </section>
      </div>
    </main>
  );
}
