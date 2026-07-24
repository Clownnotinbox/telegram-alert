"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OverlayStyle } from "./types";

const STYLE_NAMES: Record<OverlayStyle, string> = {
  anime: "Аниме",
  graphite: "Графит",
  paper: "Светлый",
  mono: "Только текст",
};

type BotInfo = { ready: boolean; username?: string; name?: string };

export function Dashboard() {
  const [online, setOnline] = useState(true);
  const [bot, setBot] = useState<BotInfo>({ ready: false });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [healthResponse, botResponse] = await Promise.all([
          fetch("/api/health", { cache: "no-store" }),
          fetch("/api/telegram/info", { cache: "no-store" }),
        ]);
        if (!cancelled) {
          setOnline(healthResponse.ok);
          if (botResponse.ok) setBot((await botResponse.json()) as BotInfo);
        }
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const botUrl = bot.username ? `https://t.me/${bot.username}` : null;

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

        <section className="page-heading self-service-heading">
          <p className="eyebrow">Оверлей без ручной настройки</p>
          <h1>Стример всё делает в Telegram</h1>
          <p>Выбирает группу или канал, оформление и тестирует уведомление. Бот сам выдаёт персональную OBS-ссылку — без ID, ключей и переписки с владельцем сервиса.</p>
          {botUrl ? (
            <a className="button button-primary hero-button" href={botUrl} target="_blank" rel="noreferrer">
              Открыть @{bot.username}
            </a>
          ) : (
            <span className="bot-pending">Бот станет доступен после первого деплоя</span>
          )}
        </section>

        <section className="workspace-grid">
          <div className="panel preview-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Предпросмотр</span>
                <h2 className="panel-title">Минималистичное уведомление</h2>
              </div>
              <span className="preview-dimensions">420 × 420</span>
            </div>
            <div className="preview-window">
              <iframe src="/overlay?preview=1" title="Предпросмотр уведомления о подписчике" />
            </div>
            <div className="preview-actions">
              <a className="button button-secondary" href="/overlay?preview=1" target="_blank" rel="noreferrer">Открыть демо</a>
              <span className="preview-note">Последний подписчик остаётся на экране. Новый появляется с мягкой анимацией.</span>
            </div>
          </div>

          <aside className="panel control-panel">
            <div className="panel-header compact">
              <div>
                <span className="panel-kicker">Внутри бота</span>
                <h2 className="panel-title">Одна минута до OBS</h2>
              </div>
            </div>

            <ol className="bot-flow">
              <li><span>1</span><p><strong>Открыть бота</strong> и нажать большую кнопку снизу.</p></li>
              <li><span>2</span><p><strong>Выбрать свою группу или канал</strong> в системном окне Telegram.</p></li>
              <li><span>3</span><p><strong>Скопировать OBS-ссылку</strong> и нажать «Проверить».</p></li>
            </ol>

            <div className="style-list" aria-label="Доступные стили">
              {(Object.keys(STYLE_NAMES) as OverlayStyle[]).map((style) => (
                <div className="style-row" key={style}>
                  <span className={`style-swatch style-${style}`} />
                  <span>{STYLE_NAMES[style]}</span>
                </div>
              ))}
            </div>

            <div className="command-box">
              <span>Панель стримера</span>
              <code>/panel</code>
            </div>
            <p className="privacy-note">Каждый чат получает отдельную случайную ссылку. Управлять ею может только пользователь, который его подключил.</p>
          </aside>
        </section>

        <footer className="steps self-service-summary">
          <div><span>01</span><p><strong>Без ID чатов</strong><br />Telegram передаёт всё автоматически.</p></div>
          <div><span>02</span><p><strong>Без доступа к Render</strong><br />Стример работает только с ботом.</p></div>
          <div><span>03</span><p><strong>Без перезапуска OBS</strong><br />Стиль и подписчик обновляются сами.</p></div>
        </footer>
      </div>
    </main>
  );
}
