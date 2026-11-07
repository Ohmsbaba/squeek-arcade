"use client";
import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/client/api";
import { credits } from "@/client/format";
import { sound } from "@/client/sound";
import { useArcade } from "@/client/store";

/** Counts toward the shown balance instead of jumping. */
export function useCountedValue(value: number) {
  const mv = useMotionValue(value);
  const [shown, setShown] = useState(value);
  useMotionValueEvent(mv, "change", (v) => setShown(Math.round(v)));
  const seen = useRef(false);
  useEffect(() => {
    // The first real value appears as it is. Only later changes count up or down.
    if (!seen.current && value !== 0) {
      seen.current = true;
      mv.set(value);
      setShown(value);
      return;
    }
    const c = animate(mv, value, { duration: 0.5, ease: "easeOut" });
    return () => c.stop();
  }, [value, mv]);
  return shown;
}

export function BalanceChip() {
  const me = useArcade((s) => s.me);
  const held = useArcade((s) => s.held);
  const load = useArcade((s) => s.load);
  const toast = useArcade((s) => s.toast);
  const [open, setOpen] = useState(false);
  const shown = useCountedValue((me?.balance ?? 0) - held);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const claim = async (path: string) => {
    try {
      const r = await api<{ granted: number }>(path, { body: {} });
      sound.cashout();
      toast({ kind: "info", title: `+${credits(r.granted)} points`, body: "Free to play, and no cash value." });
      await load();
    } catch (error) {
      toast({ kind: "error", title: error instanceof ApiError ? error.message : "That didn't work." });
      await load();
    }
  };

  const dailyReady = me?.credits.dailyAvailable;
  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => { sound.click(); setOpen((o) => !o); }}
        aria-expanded={open}
        aria-label={`Balance: ${credits(shown)} points`}
        data-testid="balance"
        data-value={me ? me.balance - held : undefined}
        className="flex h-10 items-center gap-2 rounded-[6px] border border-line2 bg-panel px-3 transition-colors hover:border-gold"
      >
        <span className="relative h-3 w-3 rounded-full bg-gold shadow-[inset_0_-1px_0_#8f6e12]">
          {dailyReady && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-mint" />}
        </span>
        <span className="tabular font-data text-sm text-paper">{me ? credits(shown) : "····"}</span>
      </button>
      {open && me && (
        <div className="plate absolute right-0 top-12 z-40 w-[290px] p-4">
          <p className="eyebrow">Your points</p>
          <p className="tabular mt-1 font-display text-4xl font-semibold text-gold">{credits(me.balance - held)}</p>
          <p className="mt-2 text-xs leading-relaxed text-gray">Claim 10,000 free every day and bet them whenever you like. They have no cash value: no deposits, no withdrawals, no prizes.</p>
          <div className="mt-4 flex flex-col gap-3">
            <button className="key key-gold h-10 text-sm" disabled={!me.credits.dailyAvailable} onClick={() => claim("/api/credits/daily")}>
              {me.credits.dailyAvailable ? `Claim daily ${credits(me.credits.dailyAmount)}` : "Daily claimed"}
            </button>
            <button className="key key-dark h-10 text-sm" disabled={!me.credits.refill.available} onClick={() => claim("/api/credits/refill")}>
              Refill to {credits(me.credits.refill.to)}
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-dim">
            Refills are for balances under {me.credits.refill.below}. {me.credits.refill.left} left today.
          </p>
          <Link href="/profile#ledger" onClick={() => setOpen(false)} className="link mt-3 inline-block text-xs">Points history</Link>
        </div>
      )}
    </div>
  );
}
