"use client";

/* Telegram avatars are dynamic, authenticated proxy URLs, so next/image cannot pre-optimize them. */
/* eslint-disable @next/next/no-img-element */

import QRCode from "qrcode";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { OverlayCommunity, OverlayStyle, Subscriber } from "./types";

const ANIME_QR_URL = "https://t.me/xedat1va";
const MASCOT_ASSET_VERSION = 6;
const IDENTITY_PIXELS = Array.from({ length: 48 }, (_, index) => index);

/* «С анимацией» is the 3:2 noir plate that crumbles away pixel by pixel and
   comes back as the other side: the face is that art untouched, the back is a
   plate of its own.  The holds below are the times a side sits there readable —
   the sweeps are not counted into them, because a plate that is halfway gone is
   not a plate anyone is reading.  DISSOLVE_MS follows the two animations in
   globals.css: one sweep out, then one back in. */
const DISSOLVE_MS = 1_800;
const FACE_HOLD_MS = 12_600;
const BACK_HOLD_MS = 5_200;

/* «Затемнение» is the same 3:2 noir plate with nothing on the back of it: it is
   overexposed until the picture washes out into white, that white sinks to
   black, and the plate comes back the same way round.  Nothing turns and nothing
   crumbles — the whole change is light.  LIGHT_MS follows the two animations in
   globals.css, and the holds are the times the plate is simply there or simply
   gone. */
const LIGHT_MS = 1_800;
const LIT_HOLD_MS = 20_000;
const DARK_HOLD_MS = 6_000;

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
   advances about half an em per character.  The budget bounds long names, the
   cap bounds short ones — and the cap is generous because the plates carry
   nothing but the nickname now. */
function noirNameSize(length: number, wide: boolean) {
  const maxSize = wide ? 84 : 56;
  const minSize = wide ? 42 : 28;
  const widthBudget = wide ? 845 : 610;
  return Math.max(minSize, Math.min(maxSize, Math.floor(widthBudget / Math.max(length, 1))));
}

/* The back plate hands the nickname the full width of its rules — four fifths of
   the card, against the 37% strip the art leaves on the face — so it starts from
   a longer budget and a bigger cap, and is then measured down from there like
   every other plate.  The cap is what a short nickname gets, and it is set by how
   large the plate can carry a line rather than by how large it needs to be: this
   side has to stay readable when the whole card is a few hundred pixels wide. */
function noirBackNameSize(length: number) {
  return Math.max(32, Math.min(112, Math.floor(1900 / Math.max(length, 1))));
}

/* The rendered width of the line, which scrollWidth cannot report through the
   overflow: clip the noir plates use.  «С анимацией» can be part way through a
   turn when a nickname is swapped, and a turning card foreshortens everything
   measured on it — the element loses exactly as much width as the line does, so
   its own two widths give the factor back and the answer stays in layout px. */
function inkWidth(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const ink = range.getBoundingClientRect().width;
  const projected = element.getBoundingClientRect().width;
  const laid = element.clientWidth;
  return projected > 0 && laid > 0 ? (ink * laid) / projected : ink;
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

/* The size a plate starts from is worked out from the character count, which is
   all the server can do — a nickname of all «w» still overruns the plate, and
   there is nowhere for it to spill.  Measure the real line, step the size down
   to the smallest we are willing to show, and cut the tail off past that.  Both
   plates fit their nickname this way; only the numbers and the property differ. */
function useFittedName<T extends HTMLElement>(
  ref: RefObject<T | null>,
  text: string,
  property: string,
  startSize: number,
  minSize: number,
  enabled: boolean,
) {
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    const fit = () => {
      const available = element.clientWidth;
      if (!available) return;

      element.textContent = text;
      let size = startSize;
      let ink = 0;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        element.style.setProperty(property, `${size}px`);
        ink = inkWidth(element);
        if (ink <= available) return;
        if (size <= minSize) break;
        size = Math.max(minSize, Math.floor((size * available) / ink));
      }

      const characters = Array.from(text);
      let keep = Math.min(characters.length - 1, Math.max(1, Math.floor((characters.length * available) / ink) - 1));
      element.textContent = `${characters.slice(0, keep).join("")}…`;
      while (keep > 1 && inkWidth(element) > available) {
        keep -= 1;
        element.textContent = `${characters.slice(0, keep).join("")}…`;
      }
    };

    /* Fitting resizes the very element being observed, and doing that inside the
       observer's own callback is what makes a browser report undelivered
       notifications.  A frame's delay takes the work out of that delivery loop;
       the second pass then settles on the same size and nothing resizes again. */
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };

    fit();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);

    /* The first pass can measure a face the browser then swaps out from under
       it: Firefox lays these plates out in the default sans before resolving
       «Arial Narrow», which is 17% narrower, and a nickname fitted against the
       wider one comes out needlessly small.  The element keeps its width through
       that swap, so no resize reports it and document.fonts.ready has already
       settled — nothing announces it, and it has to be looked for.  Three
       re-reads cover it; each one that finds nothing changed costs a measure and
       resizes nothing. */
    const rereads = [120, 350, 800].map((delay) => setTimeout(fit, delay));

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      rereads.forEach(clearTimeout);
    };
  }, [enabled, minSize, property, ref, startSize, text]);
}

/* A component of its own so the cycle starts over whenever the style is switched
   on — the card opens on its face rather than carrying on from wherever it was
   left — and so «Нуар 3:2» never carries the timer it does not use. */
function NoirAnimatedCard({
  alerting,
  face,
  name,
  startOnBack,
}: {
  alerting: boolean;
  face: ReactNode;
  name: string;
  startOnBack: boolean;
}) {
  const [showingBack, setShowingBack] = useState(startOnBack);
  const [sweeping, setSweeping] = useState(false);
  const backNameRef = useRef<HTMLSpanElement>(null);
  const backNameSize = noirBackNameSize(Array.from(name).length);
  useFittedName(backNameRef, name, "--noir-back-name-size", backNameSize, 32, true);

  useEffect(() => {
    /* A sweep is never cut short: half a plate blinking into the other one is the
       one thing here that would read as a glitch rather than as an effect. */
    if (sweeping) return;
    /* Never leave the face while a subscriber is arriving — and if one arrives
       while the back is up, start back towards the face at once. */
    if (alerting && !showingBack) return;
    const hold = alerting ? 0 : showingBack ? BACK_HOLD_MS : FACE_HOLD_MS;
    const timer = setTimeout(() => {
      setShowingBack((back) => !back);
      setSweeping(true);
    }, hold);
    return () => clearTimeout(timer);
  }, [alerting, showingBack, sweeping]);

  /* Out and then back in, one after the other: the plate is wholly gone before
     the other starts to build, which is what makes it a change of side rather
     than a cross-fade. */
  useEffect(() => {
    if (!sweeping) return;
    const timer = setTimeout(() => setSweeping(false), DISSOLVE_MS * 2);
    return () => clearTimeout(timer);
  }, [showingBack, sweeping]);

  const layer = (shown: boolean) => [
    "noir-animated-layer",
    shown ? "is-current" : "",
    sweeping ? (shown ? "is-entering" : "is-leaving") : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <div className={`${layer(!showingBack)} noir-animated-face`}>{face}</div>
      {/* Written from scratch rather than mirrored: nothing of the face is
          repeated here, so what builds back up is a plate, not a reflection. */}
      <div className={`${layer(showingBack)} noir-animated-back`}>
        <span className="noir-animated-back-frame" aria-hidden="true" />
        <div className="noir-animated-back-copy">
          <span className="noir-animated-back-rule" aria-hidden="true" />
          <div className="noir-animated-back-lines">
            <span className="noir-animated-back-title">LAST TG FOLLOWER</span>
            <span
              ref={backNameRef}
              className="noir-animated-back-name"
              style={{ "--noir-back-name-size": `${backNameSize}px` } as CSSProperties}
            >
              {name}
            </span>
          </div>
          <span className="noir-animated-back-rule" aria-hidden="true" />
        </div>
      </div>
    </>
  );
}

/* Its own component for the same reason as the one above: the cycle starts over
   whenever the style is switched on, and no other style pays for the timer.
   The plate carries the black the card used to carry, so that when the light has
   finished taking it there is nothing left on the stream — a card that faded to
   black would still be a black rectangle over the game. */
function NoirFadeCard({ alerting, face }: { alerting: boolean; face: ReactNode }) {
  const [lit, setLit] = useState(true);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    /* Light is not something that can be stopped halfway and started again. */
    if (changing) return;
    /* Never go dark on a subscriber who is arriving, and come straight back if
       one arrives while the plate is away. */
    if (alerting && lit) return;
    const hold = alerting ? 0 : lit ? LIT_HOLD_MS : DARK_HOLD_MS;
    const timer = setTimeout(() => {
      setLit((shown) => !shown);
      setChanging(true);
    }, hold);
    return () => clearTimeout(timer);
  }, [alerting, changing, lit]);

  useEffect(() => {
    if (!changing) return;
    const timer = setTimeout(() => setChanging(false), LIGHT_MS);
    return () => clearTimeout(timer);
  }, [changing, lit]);

  const state = changing ? (lit ? "is-arriving" : "is-leaving") : lit ? "is-lit" : "";

  return <div className={`noir-fade-plate ${state}`}>{face}</div>;
}

export function SubscriberCard({
  subscriber,
  community,
  phase,
  celebrating,
  labelFading,
  style,
  previewSide,
}: {
  subscriber: Subscriber | null;
  community: OverlayCommunity | null;
  phase: "idle" | "exit" | "enter";
  celebrating: boolean;
  labelFading: boolean;
  style: OverlayStyle;
  previewSide: "front" | "back" | null;
}) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  const animeLike = style === "anime";
  const noirLike = style === "noir";
  const noirAnimated = style === "noir-animated";
  const noirFade = style === "noir-fade";
  const noirWideLike = style === "noir-wide" || noirAnimated || noirFade;
  /* data-style stays noir-wide for all three, so every one of them draws that
     art down to the pixel — what each does with it hangs off its own class
     instead, and nothing written for them can reach the static style. */
  const renderedStyle = noirWideLike ? "noir-wide" : style;
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
  useFittedName(
    nameRef,
    displayedName,
    "--noir-name-size",
    noirNameSize(displayedNameLength, noirWideLike),
    noirWideLike ? 42 : 28,
    noirPlate,
  );

  const nameClass = [
    displayedNameLength <= 8 ? "is-short" : "",
    displayedNameLength > 22 ? "is-long" : "",
    displayedNameLength > 38 ? "is-very-long" : "",
  ].filter(Boolean).join(" ");

  const face = (
    <>
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
          {!animeLike && !noirPlate && (
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
    </>
  );

  return (
    <div
      className={`subscriber-wrap ${noirAnimated ? "is-noir-animated" : ""} ${noirFade ? "is-noir-fade" : ""}`}
      data-style={renderedStyle}
      data-waiting={waiting || undefined}
      data-testid="subscriber-design"
    >
      <article className={`subscriber-card phase-${phase}`} aria-live="polite">
        {/* Exit, enter and the celebration window all belong to the nickname, so
            an alert is the one thing that keeps the plate where it can be read. */}
        {noirAnimated && (
          <NoirAnimatedCard
            alerting={phase !== "idle" || celebrating}
            face={face}
            name={displayedName}
            startOnBack={previewSide === "back"}
          />
        )}
        {noirFade && <NoirFadeCard alerting={phase !== "idle" || celebrating} face={face} />}
        {!noirAnimated && !noirFade && face}
      </article>
    </div>
  );
}
