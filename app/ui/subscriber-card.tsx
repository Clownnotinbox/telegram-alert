"use client";

/* Telegram avatars are dynamic, authenticated proxy URLs, so next/image cannot pre-optimize them. */
/* eslint-disable @next/next/no-img-element */

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import type { OverlayCommunity, OverlayStyle, Subscriber } from "./types";

const ANIME_QR_URL = "https://t.me/xedat1va";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("ru-RU") ?? "")
    .join("") || "TG";
}

function QrMark({ value, themed = false }: { value: string; themed?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    void QRCode.toCanvas(canvas.current, value, {
      width: 132,
      margin: 1,
      errorCorrectionLevel: themed ? "H" : "M",
      color: themed
        ? { dark: "#123253", light: "#f2fbff" }
        : { dark: "#111111", light: "#ffffff" },
    });
  }, [themed, value]);

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
  const name = subscriber?.name ?? "Ждём нового подписчика";
  const nameLength = Array.from(name).length;
  const nameClass = nameLength > 44 ? "is-very-long" : nameLength > 26 ? "is-long" : "";
  const waveSource = `/mascot-wave.gif?v=2&event=${subscriber?.sequence ?? 0}`;

  return (
    <div className="subscriber-wrap" data-style={style} data-waiting={waiting || undefined} data-testid="subscriber-design">
      <article className={`subscriber-card phase-${phase}`} aria-live="polite">
        <span className="frame-corner frame-corner-tl" aria-hidden="true" />
        <span className="frame-corner frame-corner-tr" aria-hidden="true" />
        <span className="frame-corner frame-corner-bl" aria-hidden="true" />
        <span className="frame-corner frame-corner-br" aria-hidden="true" />

        <div className={`anime-mascot ${celebrating ? "is-celebrating" : ""}`} aria-hidden="true">
          {/* Both original mascot assets are generated locally; no external image host is used. */}
          <img className="mascot-still" src="/mascot-anime.png" alt="" />
          {celebrating && <img className="mascot-wave" src={waveSource} alt="" />}
          <span className="mascot-spark spark-one">✦</span>
          <span className="mascot-spark spark-two">✦</span>
          <span className="mascot-spark spark-three">·</span>
        </div>

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
              {celebrating ? "Новый подписчик" : waiting ? "Ожидаем подписчика" : "Последний подписчик"}
            </div>
            <h2 className={`subscriber-name ${nameClass}`}>{name}</h2>
          </div>
        </div>

        {style === "anime" && (
          <footer className="anime-qr">
            <div className="anime-qr-code">
              <QrMark value={ANIME_QR_URL} themed />
            </div>
            <div className="anime-qr-copy">
              <strong>Открыть Telegram</strong>
              <span>сканируй QR-код</span>
            </div>
          </footer>
        )}

        {style !== "anime" && community && (
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
