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

/* Noir dissolves the nickname instead of cutting to the next one, so the swap
   has to wait out the longer fade — otherwise the name changes while the old
   one is still faintly on screen.  Both values follow the noir-signal-out /
   noir-signal-in durations in globals.css; the other styles keep the faster
   pixel-glitch timing they were built around. */
const SWAP_TIMINGS = {
  base: { swap: 300, settle: 1100 },
  noir: { swap: 400, settle: 1300 },
} as const;

function swapTimings(style: OverlayStyle) {
  return style === "noir" || style === "noir-wide" ? SWAP_TIMINGS.noir : SWAP_TIMINGS.base;
}

/* The caption above the nickname flips back on its own once the celebration is
   over, and no card animation is running to cover that.  It is dimmed for the
   last LABEL_FADE_MS instead, so the words are replaced while invisible — the
   value matches the .subscriber-label transition in globals.css. */
const CELEBRATION_MS = 8000;
const LABEL_FADE_MS = 220;

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
  previewUsername,
  previewPhase,
  previewStyle,
}: {
  preview: boolean;
  overlayKey: string | null;
  previewName: string | null;
  previewUsername: string | null | undefined;
  previewPhase: "exit" | "enter" | null;
  previewStyle: OverlayStyle | null;
}) {
  const [subscriber, setSubscriber] = useState<Subscriber | null>(
    preview
      ? {
          ...DEMO_SUBSCRIBER,
          name: previewName?.trim() || DEMO_SUBSCRIBER.name,
          username: previewUsername === undefined ? DEMO_SUBSCRIBER.username : previewUsername,
        }
      : null,
  );
  const [community, setCommunity] = useState<OverlayCommunity | null>(
    preview ? { title: "Даринино сообщество", url: "https://t.me/xedat1va" } : null,
  );
  const [phase, setPhase] = useState<"idle" | "exit" | "enter">(preview && previewPhase ? previewPhase : "idle");
  const [celebrating, setCelebrating] = useState(false);
  const [labelFading, setLabelFading] = useState(false);
  const [queue, setQueue] = useState<Subscriber[]>([]);
  const [style, setStyle] = useState<OverlayStyle>(preview && previewStyle ? previewStyle : "noir");
  const cursor = useRef(0);
  const initialized = useRef(false);
  const animating = useRef(false);
  const subscriberRef = useRef<Subscriber | null>(subscriber);
  const styleRef = useRef<OverlayStyle>(style);
  const persistentSubscriber = useRef<Subscriber | null>(null);
  const animationTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    subscriberRef.current = subscriber;
  }, [subscriber]);

  /* Read through a ref: the running animation should keep the timing it started
     with, even if the streamer switches styles halfway through it. */
  useEffect(() => {
    styleRef.current = style;
  }, [style]);

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
    const timings = swapTimings(styleRef.current);
    setPhase("exit");

    const swapTimer = setTimeout(() => {
      setSubscriber(next);
      setCelebrating(true);
      setPhase("enter");
      playGentleChime();
    }, timings.swap);
    const settleTimer = setTimeout(() => {
      setPhase("idle");
      animating.current = false;
      setQueue((current) => current.slice(1));
    }, timings.settle);
    const labelFadeTimer = setTimeout(() => setLabelFading(true), CELEBRATION_MS - LABEL_FADE_MS);
    const toastTimer = setTimeout(() => {
      setCelebrating(false);
      setLabelFading(false);
    }, CELEBRATION_MS);
    animationTimers.current.push(swapTimer, settleTimer, labelFadeTimer, toastTimer);

    if (next.source === "telegram-test" || next.source === "test") {
      const restoreTimer = setTimeout(() => {
        if (animating.current || subscriberRef.current?.sequence !== next.sequence) return;
        animating.current = true;
        const restoreTimings = swapTimings(styleRef.current);
        setPhase("exit");
        const restoreSwapTimer = setTimeout(() => {
          setSubscriber(persistentSubscriber.current);
          setCelebrating(false);
          setPhase("enter");
        }, restoreTimings.swap);
        const restoreSettleTimer = setTimeout(() => {
          const restoredSequence = persistentSubscriber.current?.sequence ?? 0;
          setPhase("idle");
          animating.current = false;
          setQueue((current) => current.filter((event) => event.sequence > restoredSequence));
        }, restoreTimings.settle);
        animationTimers.current.push(restoreSwapTimer, restoreSettleTimer);
      }, CELEBRATION_MS);
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
        labelFading={labelFading}
        style={style}
      />
    </main>
  );
}
