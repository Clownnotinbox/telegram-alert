"use client";

/* Telegram avatars are dynamic, authenticated proxy URLs, so next/image cannot pre-optimize them. */
/* eslint-disable @next/next/no-img-element */

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import type { OverlayCommunity, OverlayStyle, Subscriber } from "./types";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("ru-RU") ?? "")
    .join("") || "TG";
}

function QrMark({ value }: { value: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    void QRCode.toCanvas(canvas.current, value, {
      width: 104,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    });
  }, [value]);

  return <canvas ref={canvas} className="community-qr" aria-label="QR-код публичной ссылки на чат" />;
}

export function SubscriberCard({
  subscriber,
  community,
  phase,
  celebrating,
  style,
}: {
  subscriber: Subscriber | null;
  community: OverlayCommunity | null;
  phase: "idle" | "exit" | "enter";
  celebrating: boolean;
  style: OverlayStyle;
}) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  const waiting = !subscriber;
  const isTest = subscriber?.source === "telegram-test" || subscriber?.source === "test";
  const name = subscriber?.name ?? "Ждём нового подписчика";
  const meta = subscriber
    ? isTest ? "Тестовое уведомление" : subscriber.username ? `@${subscriber.username}` : "Telegram"
    : "Появится здесь после вступления";

  return (
    <div className="subscriber-wrap" data-style={style} data-waiting={waiting || undefined} data-testid="subscriber-design">
      <article className={`subscriber-card phase-${phase}`} aria-live="polite">
        <span className="frame-corner frame-corner-tl" aria-hidden="true" />
        <span className="frame-corner frame-corner-tr" aria-hidden="true" />
        <span className="frame-corner frame-corner-bl" aria-hidden="true" />
        <span className="frame-corner frame-corner-br" aria-hidden="true" />

        <div className={`anime-mascot ${celebrating ? "is-celebrating" : ""}`} aria-hidden="true">
          {/* Generated original mascot asset; no external image host is used. */}
          <img src="/mascot-anime.png" alt="" />
          <span className="mascot-spark spark-one">✦</span>
          <span className="mascot-spark spark-two">✦</span>
          <span className="mascot-spark spark-three">·</span>
        </div>

        <header className="subscriber-topline">
          <span className="overlay-brand"><b>tg</b> telegram alert</span>
          <span className="subscriber-state">{isTest ? "демо" : celebrating ? "только что" : waiting ? "готов" : "последний"}</span>
        </header>

        <div className="subscriber-identity">
          <div className="avatar-shell" aria-hidden="true">
            <div className="avatar">
              {/* Telegram file URLs are proxied so the bot token never reaches OBS. */}
              {subscriber?.avatarUrl && subscriber.avatarUrl !== failedAvatarUrl
                ? <img src={subscriber.avatarUrl} alt="" onError={() => setFailedAvatarUrl(subscriber.avatarUrl)} />
                : initials(name)}
            </div>
            <span className="avatar-platform">tg</span>
          </div>

          <div className="subscriber-copy">
            <div className="subscriber-label">
              <span className={`subscriber-indicator ${celebrating ? "is-live" : ""}`} />
              {isTest ? "Проверка оформления" : celebrating ? "Новый подписчик" : waiting ? "Ожидаем событие" : "Последний подписчик"}
            </div>
            <h2 className="subscriber-name">{name}</h2>
            <div className="subscriber-meta">{meta}</div>
          </div>
        </div>

        {community && (
          <footer className={`community-block ${community.url ? "has-qr" : ""}`}>
            <div className="community-copy">
              <span>Telegram-сообщество</span>
              <strong>{community.title}</strong>
              {community.url && <small>Наведите камеру, чтобы открыть</small>}
            </div>
            {community.url && <QrMark value={community.url} />}
          </footer>
        )}

        <div className={`subscriber-progress ${celebrating ? "is-running" : ""}`} />
      </article>
    </div>
  );
}
