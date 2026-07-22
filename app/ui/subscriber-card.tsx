"use client";

import type { Subscriber } from "./types";

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
}: {
  subscriber: Subscriber;
  phase: "idle" | "exit" | "enter";
  celebrating: boolean;
}) {
  return (
    <div className="subscriber-wrap" data-testid="subscriber-design">
      <div className={`subscriber-toast ${celebrating ? "is-visible" : ""}`} aria-live="polite">
        Спасибо за подписку!
      </div>
      <article className={`subscriber-card phase-${phase}`}>
        <div className="avatar-shell" aria-hidden="true">
          <div className="avatar">
            {subscriber.avatarUrl ? <img src={subscriber.avatarUrl} alt="" /> : initials(subscriber.name)}
          </div>
          <span className="avatar-platform">↗</span>
        </div>
        <div className="subscriber-copy">
          <div className="subscriber-label">
            {celebrating ? "Новый подписчик" : "Последний подписчик"}
          </div>
          <h2 className="subscriber-name">{subscriber.name}</h2>
          <div className="subscriber-meta">
            <span>{subscriber.username ? `@${subscriber.username}` : "Telegram"}</span>
            <span className="subscriber-meta-dot" />
            <span>{celebrating ? "только что" : "в эфире"}</span>
          </div>
        </div>
        <div className="spark" aria-hidden="true">✦</div>
      </article>
    </div>
  );
}
