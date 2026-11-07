"use client";
import Link from "next/link";
import { mult, signed, timeAgo } from "@/client/format";
import type { PublicRound } from "@/client/types";

export function RunHistory({ rounds }: { rounds: PublicRound[] | null }) {
  return (
    <section className="plate p-4" aria-label="Your recent runs">
      <h2 className="eyebrow">Your recent runs</h2>
      {rounds === null && <p className="mt-3 font-data text-xs text-dim">Loading…</p>}
      {rounds?.length === 0 && <p className="mt-3 text-sm text-gray">Nothing yet. Your rounds show up here, and only yours.</p>}
      <ul className="mt-2 divide-y divide-line">
        {rounds?.map((r) => (
          <li key={r.id} className="py-2" data-testid="run-history-row">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`tabular font-data text-sm ${r.status === "WON" ? "text-mint" : "text-reactor"}`}>
                {r.status === "WON" ? `Cashed ${mult(r.resultMult)}` : `Stopped ${mult(r.crashMult)}`}
              </span>
              <span className={`tabular font-data text-sm ${(r.net ?? 0) > 0 ? "text-mint" : (r.net ?? 0) < 0 ? "text-reactor" : "text-lit"}`}>{signed(r.net ?? 0)}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 font-data text-[11px] text-dim">
              <span>
                Bet {r.stake.toLocaleString("en-US")}
                {r.live.boostBp + r.live.blocksMined > 0 && r.status === "WON" ? " · live bonus" : ""}
                {r.status === "WON" && r.crashMult ? ` · wheel stop ${mult(r.crashMult)}` : ""}
              </span>
              <span className="flex shrink-0 gap-2">
                <time dateTime={r.createdAt}>{timeAgo(r.createdAt)}</time>
                <Link className="link" href={`/fairness?round=${r.shareId}`}>Verify</Link>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-snug text-dim">Every round is independent. Past stops say nothing about the next one.</p>
    </section>
  );
}
