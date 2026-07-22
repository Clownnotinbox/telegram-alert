"use client";

import { useEffect, useRef, useState } from "react";
import { SubscriberCard } from "./subscriber-card";
import { DEMO_SUBSCRIBER, type Subscriber } from "./types";

type Snapshot = { latest: Subscriber | null; events: Subscriber[] };

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

export function Overlay() {
  const [subscriber, setSubscriber] = useState<Subscriber>(DEMO_SUBSCRIBER);
  const [phase, setPhase] = useState<"idle" | "exit" | "enter">("idle");
  const [celebrating, setCelebrating] = useState(false);
  const [queue, setQueue] = useState<Subscriber[]>([]);
  const [preview, setPreview] = useState(false);
  const cursor = useRef(0);
  const initialized = useRef(false);
  const animating = useRef(false);
  const animationTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    setPreview(new URLSearchParams(window.location.search).has("preview"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const response = await fetch(`/api/subscribers?after=${cursor.current}`, { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as Snapshot;
          if (!initialized.current) {
            initialized.current = true;
            if (data.latest) setSubscriber(data.latest);
            cursor.current = data.latest?.sequence ?? 0;
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
  }, []);

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
    }, 260);
    const settleTimer = setTimeout(() => {
      setPhase("idle");
      animating.current = false;
      setQueue((current) => current.slice(1));
    }, 960);
    const toastTimer = setTimeout(() => setCelebrating(false), 8000);
    animationTimers.current = [swapTimer, settleTimer, toastTimer];
  }, [queue]);

  useEffect(() => () => {
    animationTimers.current.forEach(clearTimeout);
  }, []);

  return (
    <main className={`overlay-page ${preview ? "is-preview" : ""}`}>
      <SubscriberCard subscriber={subscriber} phase={phase} celebrating={celebrating} />
    </main>
  );
}
