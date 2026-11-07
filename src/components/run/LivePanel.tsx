"use client";
import type { LiveWheel } from "@/client/useLiveWheel";
import { rpmBoostBp } from "@/shared/run-curve";

const pct = (bp: number) => `${Math.round(bp / 100)}%`;

/** The real hamster, the real chain. The status line is display. Bonuses come from what the server reads on-chain. */
export function LivePanel({ wheel, busy, boostBp, blocksInRound, bonusBp }: { wheel: LiveWheel; busy: boolean; boostBp: number; blocksInRound: number; bonusBp: number }) {
  const { chain, now } = wheel;
  const running = now?.running ?? false;
  const progress = now?.blockProgress ?? null;
  const known = Boolean(now);
  return (
    <section className="rounded-[4px] border border-line bg-ink/60 p-3" aria-label="Live from Squeekchain" data-testid="live-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="eyebrow">Live from Squeekchain</h2>
        <a className="link font-data text-[10px]" href="https://squeekchain.com" target="_blank" rel="noreferrer">Watch him</a>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${running ? "animate-pulse bg-mint" : known ? "bg-amber" : "bg-dim"}`} />
        <p className="text-sm text-paper" data-testid="live-status">
          {!known ? "The real Squeektoshi: live status unavailable" : running ? `The real Squeektoshi is running at ${now?.rpm} rpm` : "The real Squeektoshi is resting"}
        </p>
      </div>
      {progress !== null && now?.blockHeight != null && (
        <div className="mt-2">
          <div className="flex justify-between font-data text-[10px] text-gray">
            <span>Next Squeek block: #{(now.blockHeight + 1).toLocaleString("en-US")}</span>
            <span>{Math.floor(progress * 100)}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.floor(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the next real Squeek block">
            <div className="h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}
      {busy ? (
        <dl className="mt-2 grid grid-cols-3 gap-1 font-data text-[11px]" data-testid="live-bonus">
          <div><dt className="text-dim">Work</dt><dd className="text-paper">+{pct(boostBp)}</dd></div>
          <div><dt className="text-dim">Blocks</dt><dd className="text-paper">{blocksInRound}</dd></div>
          <div><dt className="text-dim">Bonus</dt><dd className="text-mint">+{pct(bonusBp)}</dd></div>
        </dl>
      ) : (
        <p className="mt-2 text-[11px] leading-snug text-gray" data-testid="live-terms">
          {!chain?.available
            ? "Can't read the contract right now, so no bonus for this run."
            : chain.running
              ? `On-chain he did ${chain.recentWork.toLocaleString("en-US")} wheel passes in the last ${Math.round(chain.windowMinutes)} minutes: that's +${pct(rpmBoostBp(chain.rpm))} on your cash-out.`
              : `No work settled on-chain in the last ${Math.round(chain.windowMinutes)} minutes, so no work bonus right now.`}{" "}
          If his work settles on Ethereum during your run, each new Squeek block adds +5%, up to +25%. His running is always his own choice.
        </p>
      )}
    </section>
  );
}
