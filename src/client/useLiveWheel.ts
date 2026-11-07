"use client";
import { useEffect, useState } from "react";

/** What the game server read from the contract. This is what bonuses are based on. */
export type ChainWheel = {
  available: boolean;
  running: boolean;
  rpm: number;
  recentWork: number;
  windowMinutes: number;
  blockHeight: number | null;
  beacon: string | null;
  ethBlock: number | null;
};

/** His status this second, read by this browser from the official API. For display only. */
export type RealTimeWheel = { online: boolean; running: boolean; rpm: number; blockHeight: number | null; blockProgress: number | null };

export type LiveWheel = { chain: ChainWheel | null; now: RealTimeWheel | null };

const STATUS_URL = "https://api.squeekchain.com/v1/status";

export function parseRealTime(raw: unknown): RealTimeWheel | null {
  const s = raw as { measurement?: { freshness?: string; provenance?: string; rpmMilli?: number }; builder?: { projected?: { blockHeight?: string; blockProgress?: string } } };
  const m = s?.measurement;
  if (!m) return null;
  const online = m.freshness === "online";
  const rpm = online && m.provenance === "hardware" ? Math.round((m.rpmMilli ?? 0) / 1000) : 0;
  const p = s.builder?.projected;
  const height = p?.blockHeight !== undefined ? Number(p.blockHeight) : NaN;
  const progress = p?.blockProgress !== undefined ? Number(p.blockProgress) / 1_000_000_000 : NaN;
  return {
    online, running: rpm > 0, rpm,
    blockHeight: Number.isFinite(height) ? height : null,
    blockProgress: Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : null,
  };
}

export function useLiveWheel(intervalMs = 3000) {
  const [wheel, setWheel] = useState<LiveWheel>({ chain: null, now: null });
  useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!document.hidden) {
        const [chain, now] = await Promise.all([
          fetch("/api/squeekchain/live").then((r) => (r.ok ? (r.json() as Promise<ChainWheel>) : null)).catch(() => null),
          fetch(STATUS_URL).then((r) => (r.ok ? r.json() : null)).then(parseRealTime).catch(() => null),
        ]);
        // Keep the last reading through a blip.
        if (!dead) setWheel((old) => ({ chain: chain ?? old.chain, now: now ?? old.now }));
      }
      if (!dead) timer = setTimeout(tick, intervalMs);
    };
    void tick();
    return () => {
      dead = true;
      clearTimeout(timer);
    };
  }, [intervalMs]);
  return wheel;
}
