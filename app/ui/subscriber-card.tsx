"use client";

/* Telegram avatars are dynamic, authenticated proxy URLs, so next/image cannot pre-optimize them. */
/* eslint-disable @next/next/no-img-element */

import QRCode from "qrcode";
import type { CSSProperties } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { OverlayCommunity, OverlayStyle, Subscriber } from "./types";

const ANIME_QR_URL = "https://t.me/xedat1va";
const MASCOT_ASSET_VERSION = 6;
const IDENTITY_PIXELS = Array.from({ length: 48 }, (_, index) => index);

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("ru-RU") ?? "")
    .join("") || "TG";
}

/* The budget is roughly twice the plate the art reserves for the nickname, so
   the line lands at ~90% of it whatever the name length: the condensed face
   advances about half an em per character.  3:2 used to spend 740 of its 475px
   plate, which read as a caption floating in an empty frame. */
function noirNameSize(length: number, wide: boolean) {
  const maxSize = wide ? 66 : 34;
  const minSize = wide ? 22 : 18;
  const widthBudget = wide ? 880 : 610;
  return Math.max(minSize, Math.min(maxSize, Math.floor(widthBudget / Math.max(length, 1))));
}

/* The rendered width of the line, which scrollWidth cannot report through the
   overflow: clip the noir plates use. */
function inkWidth(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect().width;
}

function QrMark({
  value,
  theme = "default",
}: {
  value: string;
  theme?: "default" | "anime";
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    void QRCode.toCanvas(canvas.current, value, {
      width: theme === "anime" ? 154 : 160,
      margin: 1,
      errorCorrectionLevel: theme === "default" ? "M" : "H",
      color: theme === "anime"
        ? { dark: "#123253", light: "#f2fbff" }
        : { dark: "#111111", light: "#ffffff" },
    });
  }, [theme, value]);

  return <canvas ref={canvas} className="community-qr" aria-label="QR-код публичной ссылки на чат" />;
}

function isFinderCell(row: number, column: number, size: number) {
  return (row < 7 && column < 7)
    || (row < 7 && column >= size - 7)
    || (row >= size - 7 && column < 7);
}

function StyledQrMark({ value }: { value: string }) {
  const gradientId = `qr-ink-${useId().replaceAll(":", "")}`;
  const surfaceId = `${gradientId}-surface`;
  const symbol = useMemo(() => {
    const created = QRCode.create(value, { errorCorrectionLevel: "H" });
    const cells: Array<{ row: number; column: number }> = [];
    for (let row = 0; row < created.modules.size; row += 1) {
      for (let column = 0; column < created.modules.size; column += 1) {
        if (created.modules.get(row, column) && !isFinderCell(row, column, created.modules.size)) {
          cells.push({ row, column });
        }
      }
    }
    return { cells, size: created.modules.size };
  }, [value]);
  const margin = 2;
  const canvasSize = symbol.size + margin * 2;
  const finders = [
    { row: 0, column: 0 },
    { row: 0, column: symbol.size - 7 },
    { row: symbol.size - 7, column: 0 },
  ];

  return (
    <svg
      className="community-qr styled-qr"
      viewBox={`0 0 ${canvasSize} ${canvasSize}`}
      role="img"
      aria-label="QR-код публичной ссылки на чат"
      shapeRendering="geometricPrecision"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#050506" />
          <stop offset=".55" stopColor="#17181a" />
          <stop offset="1" stopColor="#292a2d" />
        </linearGradient>
        <linearGradient id={surfaceId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0f0ed" />
          <stop offset=".55" stopColor="#dedfdd" />
          <stop offset="1" stopColor="#c9cac9" />
        </linearGradient>
      </defs>
      <rect width={canvasSize} height={canvasSize} rx="2.2" fill={`url(#${surfaceId})`} />
      {symbol.cells.map(({ row, column }) => (
        <rect
          key={`${row}-${column}`}
          x={margin + column + 0.02}
          y={margin + row + 0.02}
          width=".96"
          height=".96"
          rx=".14"
          fill={`url(#${gradientId})`}
        />
      ))}
      {finders.map(({ row, column }) => {
        const x = margin + column;
        const y = margin + row;
        return (
          <g key={`${row}-${column}`}>
            <rect x={x} y={y} width="7" height="7" rx=".7" fill={`url(#${gradientId})`} />
            <rect x={x + 1} y={y + 1} width="5" height="5" rx=".35" fill={`url(#${surfaceId})`} />
            <rect x={x + 2} y={y + 2} width="3" height="3" rx=".45" fill={`url(#${gradientId})`} />
          </g>
        );
      })}
    </svg>
  );
}

export function SubscriberCard({
  subscriber,
  community,
  phase,
  celebrating,
  labelFading,
  style,
}: {
  subscriber: Subscriber | null;
  community: OverlayCommunity | null;
  phase: "idle" | "exit" | "enter";
  celebrating: boolean;
  labelFading: boolean;
  style: OverlayStyle;
}) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  const animeLike = style === "anime";
  const noirLike = style === "noir";
  const noirWideLike = style === "noir-wide";
  const waiting = !subscriber;
  const name = subscriber?.name ?? "Ждём нового подписчика";
  const displayedName = (noirLike || noirWideLike) && subscriber?.username
    ? `@${subscriber.username.replace(/^@/, "")}`
    : name;
  const nameLength = Array.from(name).length;
  const displayedNameLength = Array.from(displayedName).length;
  const animeNameSize = Math.max(19, Math.min(30, 33.5 - nameLength * 0.45));
  const animeNameStyle = animeLike
    ? { "--anime-name-size": `${animeNameSize.toFixed(1)}px` } as CSSProperties
    : undefined;
  const noirNameStyle = noirLike || noirWideLike
    ? { "--noir-name-size": `${noirNameSize(displayedNameLength, noirWideLike)}px` } as CSSProperties
    : undefined;
  const nameRef = useRef<HTMLHeadingElement>(null);
  const noirPlate = noirLike || noirWideLike;

  /* noirNameSize assumes an average glyph, which is all the server can do — a
     nickname of all «w» still overruns the plate the art draws, and there is
     nowhere for it to spill.  Measure the real line and step down until it
     fits, re-checking whenever OBS resizes the source. */
  useEffect(() => {
    const element = nameRef.current;
    if (!element || !noirPlate) return;

    const fit = () => {
      const available = element.clientWidth;
      if (!available) return;
      const minSize = noirWideLike ? 22 : 18;
      let size = noirNameSize(displayedNameLength, noirWideLike);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        element.style.setProperty("--noir-name-size", `${size}px`);
        const ink = inkWidth(element);
        if (ink <= available || size <= minSize) return;
        size = Math.max(minSize, Math.floor((size * available) / ink));
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [displayedName, displayedNameLength, noirPlate, noirWideLike]);

  const nameClass = [
    displayedNameLength <= 8 ? "is-short" : "",
    displayedNameLength > 22 ? "is-long" : "",
    displayedNameLength > 38 ? "is-very-long" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="subscriber-wrap" data-style={style} data-waiting={waiting || undefined} data-testid="subscriber-design">
      <article className={`subscriber-card phase-${phase}`} aria-live="polite">
        <span className="frame-corner frame-corner-tl" aria-hidden="true" />
        <span className="frame-corner frame-corner-tr" aria-hidden="true" />
        <span className="frame-corner frame-corner-bl" aria-hidden="true" />
        <span className="frame-corner frame-corner-br" aria-hidden="true" />

        {noirLike && (
          <div className="noir-art" aria-hidden="true">
            <img src="/noir-portrait.webp?v=1" alt="" />
          </div>
        )}

        {noirWideLike && (
          <div className="noir-wide-art" aria-hidden="true">
            <img src="/noir-wide-source.png?v=1" alt="" />
          </div>
        )}

        <div className="anime-mascot" aria-hidden="true">
          <img className="mascot-still" src={`/mascot-anime-static.png?v=${MASCOT_ASSET_VERSION}`} alt="" />
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
            {!animeLike && (
              <div className={`subscriber-label ${labelFading ? "is-swapping" : ""}`}>
                <span className={`subscriber-indicator ${celebrating ? "is-live" : ""}`} />
                {celebrating ? "Новый подписчик" : waiting ? "Ожидаем подписчика" : "Последний подписчик"}
              </div>
            )}
            <h2 ref={nameRef} className={`subscriber-name ${nameClass}`} style={animeNameStyle ?? noirNameStyle}>{displayedName}</h2>
          </div>
          <div className="identity-pixels" aria-hidden="true">
            {IDENTITY_PIXELS.map((pixel) => (
              <i
                key={pixel}
                style={{
                  "--pixel-out-delay": `${(pixel % 12) * 7}ms`,
                  "--pixel-in-delay": `${(11 - (pixel % 12)) * 6}ms`,
                  "--pixel-drift": `${((pixel * 7) % 13) - 6}px`,
                } as CSSProperties}
              />
            ))}
          </div>
        </div>

        {animeLike && (
          <footer className="anime-qr">
            <div className="anime-qr-code">
              <QrMark value={ANIME_QR_URL} theme="anime" />
            </div>
          </footer>
        )}

        {(noirLike || noirWideLike) && (
          <footer className={noirWideLike ? "noir-wide-qr" : "noir-qr"}>
            <div className={noirWideLike ? "noir-wide-qr-code" : "noir-qr-code"}>
              <StyledQrMark value={community?.url ?? ANIME_QR_URL} />
            </div>
          </footer>
        )}

        {!animeLike && !noirLike && !noirWideLike && community && (
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
