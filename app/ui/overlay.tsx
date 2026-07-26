"use client";

import { useEffect, useRef, useState } from "react";
import { SubscriberCard } from "./subscriber-card";
import {
  DEMO_SUBSCRIBER,
  type OverlayCommunity,
  type OverlaySettings,
  type OverlayStyle,
  type Subscriber,
} from "./types";

type Snapshot = {
  latest: Subscriber | null;
  events: Subscriber[];
  cursor: number;
  settings: OverlaySettings;
  community: OverlayCommunity | null;
};

function playGentleChime() {
  if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("sound")) return;
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
    gain.connect(context.destination);
    [659.25, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.11);
      oscillator.stop(context.currentTime + 0.48 + index * 0.11);
    });
  } catch {
    // OBS/browser autoplay rules can block sound; the visual alert still works.
  }
}

export function Overlay({
  preview,
  overlayKey,
  previewName,
  previewPhase,
  previewStyle,
}: {
  preview: boolean;
  overlayKey: string | null;
  previewName: string | null;
  previewPhase: "exit" | "enter" | null;
  previewStyle: OverlayStyle | null;
}) {
  const [subscriber, setSubscriber] = useState<Subscriber | null>(
    preview ? { ...DEMO_SUBSCRIBER, name: previewName?.trim() || DEMO_SUBSCRIBER.name } : null,
  );
  const [community, setCommunity] = useState<OverlayCommunity | null>(
    preview ? { title: "Даринино сообщество", url: "https://t.me/xedat1va" } : null,
  );
  const [phase, setPhase] = useState<"idle" | "exit" | "enter">(preview && previewPhase ? previewPhase : "idle");
  const [celebrating, setCelebrating] = useState(false);
  const [queue, setQueue] = useState<Subscriber[]>([]);
  const [style, setStyle] = useState<OverlayStyle>(preview && previewStyle ? previewStyle : "anime");
  const cursor = useRef(0);
  const initialized = useRef(false);
  const animating = useRef(false);
  const subscriberRef = useRef<Subscriber | null>(subscriber);
  const persistentSubscriber = useRef<Subscriber | null>(null);
  const animationTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    subscriberRef.current = subscriber;
  }, [subscriber]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const key = overlayKey ? `&key=${encodeURIComponent(overlayKey)}` : "";
        const response = await fetch(`/api/subscribers?after=${cursor.current}${key}`, { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as Snapshot;
          if (!preview) setStyle(data.settings.style);
          if (!preview) setCommunity(data.community);
          if (!preview) persistentSubscriber.current = data.latest;
          if (!initialized.current) {
            initialized.current = true;
            if (data.latest && !(preview && previewName)) setSubscriber(data.latest);
            cursor.current = data.cursor ?? data.latest?.sequence ?? 0;
          } else if (data.events.length) {
            cursor.current = Math.max(cursor.current, ...data.events.map((event) => event.sequence));
            setQueue((current) => [...current, ...data.events]);
          }
        }
      } catch {
        // Keep the last rendered subscriber on temporary network errors.
      } finally {
        if (!cancelled) timer = setTimeout(poll, 1400);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [overlayKey, preview, previewName]);

  useEffect(() => {
    if (animating.current || queue.length === 0) return;
    animating.current = true;
    const next = queue[0];
    setPhase("exit");

    const swapTimer = setTimeout(() => {
      setSubscriber(next);
      setCelebrating(true);
      setPhase("enter");
      playGentleChime();
    }, 680);
    const settleTimer = setTimeout(() => {
      setPhase("idle");
      animating.current = false;
      setQueue((current) => current.slice(1));
    }, 1700);
    const toastTimer = setTimeout(() => setCelebrating(false), 8000);
    animationTimers.current.push(swapTimer, settleTimer, toastTimer);

    if (next.source === "telegram-test" || next.source === "test") {
      const restoreTimer = setTimeout(() => {
        if (animating.current || subscriberRef.current?.sequence !== next.sequence) return;
        animating.current = true;
        setPhase("exit");
        const restoreSwapTimer = setTimeout(() => {
          setSubscriber(persistentSubscriber.current);
          setCelebrating(false);
          setPhase("enter");
        }, 680);
        const restoreSettleTimer = setTimeout(() => {
          const restoredSequence = persistentSubscriber.current?.sequence ?? 0;
          setPhase("idle");
          animating.current = false;
          setQueue((current) => current.filter((event) => event.sequence > restoredSequence));
        }, 1700);
        animationTimers.current.push(restoreSwapTimer, restoreSettleTimer);
      }, 8000);
      animationTimers.current.push(restoreTimer);
    }
  }, [queue]);

  useEffect(() => () => {
    animationTimers.current.forEach(clearTimeout);
  }, []);

  return (
    <main className={`overlay-page ${preview ? "is-preview" : ""}`}>
      <SubscriberCard
        subscriber={subscriber}
        community={community}
        phase={phase}
        celebrating={celebrating}
        style={style}
      />
    </main>
  );
}
