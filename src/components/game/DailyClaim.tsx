"use client";
import { useState } from "react";
import { api, ApiError } from "@/client/api";
import { credits } from "@/client/format";
import { sound } from "@/client/sound";
import { useArcade } from "@/client/store";

/** Shows only when there's something to claim, right where the player is about to bet. */
export function DailyClaim({ className }: { className?: string }) {
  const me = useArcade((s) => s.me);
  const load = useArcade((s) => s.load);
  const toast = useArcade((s) => s.toast);
  const [busy, setBusy] = useState(false);
  if (!me?.credits.dailyAvailable) return null;
  return (
    <button
      data-testid="daily-claim"
      disabled={busy}
      className={`key key-tile h-12 w-full text-lg ${className ?? ""}`}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ granted: number }>("/api/credits/daily", { body: {} });
          sound.cashout();
          toast({ kind: "info", title: `+${credits(r.granted)} points`, body: "Free to play, and no cash value." });
        } catch (e) {
          toast({ kind: "error", title: e instanceof ApiError ? e.message : "That didn't work." });
        }
        await load();
        setBusy(false);
      }}
    >
      Claim today&apos;s {credits(me.credits.dailyAmount)} points
    </button>
  );
}
