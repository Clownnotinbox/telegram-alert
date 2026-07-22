"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { OverlaySettings, OverlayStyle } from "./types";

const TEST_NAMES = [
  ["Михаил Воронцов", "misha_vrn"],
  ["София Белова", "sofi_bel"],
  ["Алексей Лебедев", "alex_live"],
  ["Мария Орлова", "maria_orlova"],
];

const STYLE_NAMES: Record<OverlayStyle, string> = {
  graphite: "Графит",
  paper: "Светлый",
  mono: "Только текст",
};

export function Dashboard() {
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [message, setMessage] = useState("Локальный тест работает без ключа.");
  const [sampleIndex, setSampleIndex] = useState(0);
  const [currentStyle, setCurrentStyle] = useState<OverlayStyle>("graphite");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [health, snapshot] = await Promise.all([
          fetch("/api/health", { cache: "no-store" }),
          fetch("/api/subscribers?after=0", { cache: "no-store" }),
        ]);
        if (!cancelled) {
          setOnline(health.ok);
          if (snapshot.ok) {
            const data = (await snapshot.json()) as { settings: OverlaySettings };
            setCurrentStyle(data.settings.style);
          }
        }
      } catch {
        if (!cancelled) setOnline(false);
      } finally {
        if (!cancelled) timer = setTimeout(poll, 2400);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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
      setMessage(`Показано тестовое уведомление: ${name}`);
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
      setMessage("Webhook подключён. Напишите боту /style.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка подключения");
    } finally {
      setBusy(false);
    }
  };

  const copyOverlay = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/overlay`);
    setMessage("Адрес OBS скопирован.");
  };

  return (
    <main className="dashboard">
      <div className="shell">
        <header className="topbar">
          <Link className="brand" href="/" aria-label="Telegram Alert — главная">
            <span className="brand-mark">T</span>
            <span>Telegram Alert</span>
          </Link>
          <div className="service-status"><span className="status-dot" />{online ? "Работает" : "Нет связи"}</div>
        </header>

        <section className="page-heading">
          <p className="eyebrow">Панель оверлея</p>
          <h1>Подписчики в эфире</h1>
          <p>Проверьте уведомление, подключите Telegram и добавьте прозрачный оверлей в OBS.</p>
        </section>

        <section className="workspace-grid">
          <div className="panel preview-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Предпросмотр</span>
                <h2 className="panel-title">Текущий стиль: {STYLE_NAMES[currentStyle]}</h2>
              </div>
              <span className="preview-dimensions">520 × 120</span>
            </div>
            <div className="preview-window">
              <iframe src="/overlay?preview=1" title="Предпросмотр уведомления о подписчике" />
            </div>
            <div className="preview-actions">
              <button className="button button-primary" type="button" disabled={busy} onClick={testSubscriber}>Проверить уведомление</button>
              <button className="button button-secondary" type="button" onClick={copyOverlay}>Скопировать ссылку OBS</button>
              <a className="text-link" href="/overlay?preview=1" target="_blank" rel="noreferrer">Открыть отдельно ↗</a>
            </div>
          </div>

          <aside className="panel control-panel">
            <div className="panel-header compact">
              <div>
                <span className="panel-kicker">Управление</span>
                <h2 className="panel-title">Через Telegram</h2>
              </div>
            </div>

            <div className="style-list" aria-label="Доступные стили">
              {(["graphite", "paper", "mono"] as OverlayStyle[]).map((style) => (
                <div className={`style-row ${currentStyle === style ? "is-active" : ""}`} key={style}>
                  <span className={`style-swatch style-${style}`} />
                  <span>{STYLE_NAMES[style]}</span>
                  {currentStyle === style && <span className="style-check">выбран</span>}
                </div>
              ))}
            </div>

            <div className="command-box">
              <span>Команда в боте</span>
              <code>/style</code>
            </div>

            <div className="setup-block">
              <label htmlFor="admin-key">ADMIN_KEY</label>
              <input id="admin-key" className="secret-field" type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="Нужен после деплоя" />
              <button className="button button-primary full-width" type="button" disabled={busy} onClick={setupWebhook}>Подключить Telegram</button>
              <p className="action-message" aria-live="polite">{message}</p>
            </div>
          </aside>
        </section>

        <footer className="steps">
          <div><span>1</span><p><strong>Разверните</strong> сервис через Render Blueprint.</p></div>
          <div><span>2</span><p><strong>Выберите стиль</strong> командой /style в боте.</p></div>
          <div><span>3</span><p><strong>Добавьте в OBS</strong> ссылку /overlay.</p></div>
        </footer>
      </div>
    </main>
  );
}
