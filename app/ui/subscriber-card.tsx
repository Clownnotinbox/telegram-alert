"use client";

import type { OverlayStyle, Subscriber } from "./types";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("ru-RU") ?? "")
    .join("") || "TG";
}

export function SubscriberCard({
  subscriber,
  phase,
  celebrating,
  style,
}: {
  subscriber: Subscriber;
  phase: "idle" | "exit" | "enter";
  celebrating: boolean;
  style: OverlayStyle;
}) {
  return (
    <div className="subscriber-wrap" data-style={style} data-testid="subscriber-design">
      <article className={`subscriber-card phase-${phase}`} aria-live="polite">
        <div className="avatar-shell" aria-hidden="true">
          <div className="avatar">
            {/* Telegram avatar URLs are dynamic and cannot use a fixed Next Image allowlist. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {subscriber.avatarUrl ? <img src={subscriber.avatarUrl} alt="" /> : initials(subscriber.name)}
          </div>
          <span className="avatar-platform">tg</span>
        </div>
        <div className="subscriber-copy">
          <div className="subscriber-label">
            <span className={`subscriber-indicator ${celebrating ? "is-live" : ""}`} />
            {celebrating ? "Новый подписчик" : "Последний подписчик"}
          </div>
          <h2 className="subscriber-name">{subscriber.name}</h2>
          <div className="subscriber-meta">
            {subscriber.username ? `@${subscriber.username}` : "Telegram"}
          </div>
        </div>
        <div className="subscriber-state">{celebrating ? "сейчас" : "последний"}</div>
        <div className={`subscriber-progress ${celebrating ? "is-running" : ""}`} />
      </article>
    </div>
  );
}
