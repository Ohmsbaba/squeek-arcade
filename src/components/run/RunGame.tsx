"use client";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/client/env";
import { credits, mult, signed } from "@/client/format";
import { useArcade } from "@/client/store";
import { FairnessPanel } from "@/components/game/FairnessPanel";
import { LiteToggle } from "@/components/game/LiteToggle";
import { RunHistory } from "@/components/game/RunHistory";
import { ShareButton } from "@/components/game/ShareButton";
import { StakeControl } from "@/components/game/StakeControl";
import { useCanRender3D } from "@/components/game/useCanRender3D";
import { useHistory } from "@/components/game/useHistory";
import { useLiveWheel } from "@/client/useLiveWheel";
import { sound } from "@/client/sound";
import { DailyClaim } from "@/components/game/DailyClaim";
import { DEFAULT_STAKE, MAX_AUTO_CASHOUT, MIN_AUTO_CASHOUT } from "@/shared/game-rules";
import { blockBonusBp, livePayout, RUN_RETURN_PERCENT } from "@/shared/run-curve";
import { LiveMultiplier } from "./LiveMultiplier";
import { LivePanel } from "./LivePanel";
import RunFallback from "./RunFallback";
import { useRunGame } from "./useRunGame";
import Link from "next/link";

const RunScene = dynamic(() => import("./RunScene"), {
  ssr: false,
  loading: () => <StageLoading />,
});

function StageLoading() {
  return <div className="flex h-full w-full items-center justify-center font-data text-xs text-gray">Waking the wheel…</div>;
}

/** Updates the potential payout a few times a second, without re-rendering the whole game. */
function PotentialPayout({ live, stake, phase, bonusBp }: { live: ReturnType<typeof useRunGame>["live"]; stake: number; phase: string; bonusBp: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      if (ref.current) ref.current.textContent = credits(livePayout(stake, Math.floor(live.current.mult * 100), bonusBp));
    }, 80);
    return () => clearInterval(id);
  }, [live, stake, phase, bonusBp]);
  return <span ref={ref} className="tabular" data-testid="potential-payout">{credits(stake)}</span>;
}

export function RunGame() {
  const game = useRunGame();
  const { live, phase, round, last } = game;
  const me = useArcade((s) => s.me);
  const can3d = useCanRender3D();
  const reduced = useReducedMotion();
  const [stake, setStake] = useState<number>(DEFAULT_STAKE);
  const wheel = useLiveWheel(3000);
  const [blockNotice, setBlockNotice] = useState<number | null>(null);
  const [autoOn, setAutoOn] = useState(false);
  const [autoText, setAutoText] = useState("2.00");
  const history = useHistory("RUN", game.historyBump);

  useEffect(() => {
    const saved = Number(localStorage.getItem("sa_run_stake"));
    if (saved > 0) setStake(saved);
  }, []);
  useEffect(() => {
    if (stake > 0) localStorage.setItem("sa_run_stake", String(stake));
  }, [stake]);

  const busy = phase === "starting" || phase === "countdown" || phase === "running";

  // The real wheel feeds the scene, and a real block mined mid-run gets its moment.
  useEffect(() => {
    live.current.realRpm = wheel.now?.running ? wheel.now.rpm : 0;
  }, [live, wheel]);
  const roundRunning = phase === "running" && round?.status === "ACTIVE";
  const startBlock = round?.live?.startBlock ?? null;
  const chainHeight = wheel.chain?.blockHeight ?? null;
  const blocksInRound = roundRunning && startBlock !== null && chainHeight !== null ? Math.max(0, chainHeight - startBlock) : 0;
  const seenBlocks = useRef(0);
  useEffect(() => {
    if (!roundRunning) {
      seenBlocks.current = 0;
      return;
    }
    if (blocksInRound > seenBlocks.current) {
      seenBlocks.current = blocksInRound;
      live.current.blockPulse += 1;
      sound.achievement();
      setBlockNotice(chainHeight);
      const t = setTimeout(() => setBlockNotice(null), 2400);
      return () => clearTimeout(t);
    }
  }, [blocksInRound, chainHeight, live, roundRunning]);
  const boostBp = busy ? (round?.live?.boostBp ?? 0) : 0;
  const bonusBp = boostBp + blockBonusBp(blocksInRound);
  const balance = me?.balance ?? 0;
  const autoValue = Math.round(Number(autoText) * 100);
  const autoValid = !autoOn || (autoValue >= MIN_AUTO_CASHOUT && autoValue <= MAX_AUTO_CASHOUT);
  const activeStake = busy && round ? round.stake : stake;
  const canStart = Boolean(me) && !busy && stake > 0 && stake <= balance && autoValid;

  const go = () => canStart && game.start(stake, autoOn ? autoValue : null);

  // Space to start or cash out, for anyone at a keyboard.
  const keyRef = useRef({ go, cash: game.cashOut, phase });
  keyRef.current = { go, cash: game.cashOut, phase };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "BUTTON" || tag === "A") return;
      e.preventDefault();
      if (keyRef.current.phase === "running") void keyRef.current.cash();
      else if (!["starting", "countdown"].includes(keyRef.current.phase)) keyRef.current.go();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const outcome = last && (phase === "won" || phase === "lost") ? last : null;

  const actionButton = phase === "running" ? (
    <button
      data-testid="cash-out"
      onClick={() => game.cashOut()}
      disabled={game.cashing}
      className="key key-mint h-[72px] w-full flex-col gap-0 text-3xl leading-none"
      style={{ "--travel": "6px" } as React.CSSProperties}
    >
      {game.cashing ? "Cashing out…" : "Cash out"}
      <span className="font-data text-sm font-normal normal-case tracking-normal">
        <PotentialPayout live={live} stake={activeStake} phase={phase} bonusBp={bonusBp} /> points
      </span>
    </button>
  ) : phase === "countdown" || phase === "starting" ? (
    <button disabled className="key key-dark h-[72px] w-full text-2xl" style={{ "--travel": "6px" } as React.CSSProperties}>
      {phase === "starting" ? "Starting…" : "Get ready"}
    </button>
  ) : (
    <button
      data-testid="start-run"
      onClick={go}
      disabled={!canStart}
      className="key key-gold h-[72px] w-full text-3xl"
      style={{ "--travel": "6px" } as React.CSSProperties}
    >
      {phase === "idle" ? "Start the wheel" : "Run again"}
    </button>
  );

  return (
    <div className="mx-auto grid w-full max-w-[1500px] flex-1 grid-cols-1 gap-3 p-2 sm:p-3 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
      {/* The stage comes first on phones. */}
      <section className="plate relative order-1 h-[46svh] min-h-[300px] overflow-hidden lg:order-2 lg:h-auto lg:min-h-[640px]" aria-label="Squeek Run stage">
        <div className="absolute inset-0">
          {can3d === null ? <StageLoading /> : can3d ? <RunScene live={live} reduced={reduced} /> : <RunFallback live={live} reduced={reduced} />}
        </div>
        <AnimatePresence>
          {blockNotice !== null && (
            <motion.div
              data-testid="block-notice"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center"
            >
              <div className="rounded-[6px] border border-gold bg-ink/90 px-4 py-2 text-center">
                <p className="title text-2xl text-gold sm:text-3xl">Settled on-chain: block #{blockNotice.toLocaleString("en-US")}</p>
                <p className="font-data text-xs text-mint">His new blocks add to your cash-out</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-2">
          <div className="sm:hidden"><LiveMultiplier live={live} height={46} /></div>
          <div className="hidden sm:block"><LiveMultiplier live={live} height={72} /></div>
          <AnimatePresence mode="wait">
            {outcome && (
              <motion.div
                key={outcome.round.id}
                data-testid="round-result"
                initial={{ opacity: 0, y: -8, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                className={`pointer-events-auto rounded-[6px] border px-4 py-2 text-center ${phase === "won" ? "border-mint/60 bg-[#0c1f16]/95" : "border-reactor/60 bg-[#240e12]/95"}`}
              >
                <p className="font-display text-xl font-semibold uppercase leading-none tracking-wide sm:text-2xl">
                  {phase === "won" ? `Cashed out at ${mult(outcome.round.resultMult)}` : `Wheel stopped at ${mult(outcome.round.crashMult)}`}
                </p>
                <p className="mt-1 font-data text-xs text-lit">
                  {phase === "won"
                    ? `Paid ${credits(outcome.round.payout ?? 0)}, net ${signed(outcome.round.net ?? 0)}${outcome.round.live.boostBp + blockBonusBp(outcome.round.live.blocksMined) > 0 ? `, with +${Math.round((outcome.round.live.boostBp + blockBonusBp(outcome.round.live.blocksMined)) / 100)}% live bonus` : ""}`
                    : "Squeektoshi hopped off for a snack."}
                  {outcome.xpGained > 0 && <span className="text-mint"> · +{outcome.xpGained} XP</span>}
                </p>
                {game.awayNotice && <p className="mt-1 font-data text-[11px] text-gray">This finished while you were away.</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {game.reconnecting && (
          <p role="status" className="absolute inset-x-3 bottom-3 rounded border border-amber/40 bg-ink/90 p-2 text-center font-data text-[11px] text-amber">
            Connection dropped. Your round carries on with the server, and auto cash-out still fires. Reconnecting…
          </p>
        )}
        <div className="absolute right-2 top-2 hidden sm:block"><LiteToggle /></div>
      </section>

      <aside className="order-2 lg:order-1">
        <div className="plate flex flex-col gap-4 p-4">
          <header className="hidden lg:block">
            <p className="eyebrow">Game two</p>
            <h1 className="title mt-1 text-4xl text-gold">Squeek Run</h1>
            <p className="mt-2 text-sm leading-relaxed text-lit">Your own wheel, nobody else&apos;s. It speeds up and the multiplier climbs. Cash out before it stops.</p>
          </header>
          <div className="order-first flex flex-col gap-3 lg:order-none">
            {actionButton}
            {!busy && <DailyClaim />}
          </div>
          <LivePanel wheel={wheel} busy={busy} boostBp={boostBp} blocksInRound={blocksInRound} bonusBp={bonusBp} />
          <StakeControl stake={busy ? activeStake : stake} setStake={setStake} balance={balance} disabled={busy} />
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="auto" className="eyebrow">Auto cash-out</label>
              <button role="switch" aria-checked={autoOn} aria-label="Auto cash-out" disabled={busy} data-on={autoOn} className="chip" data-testid="auto-toggle" onClick={() => setAutoOn((a) => !a)}>
                {autoOn ? "On" : "Off"}
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="auto"
                className="field tabular"
                inputMode="decimal"
                disabled={!autoOn || busy}
                value={autoText}
                aria-invalid={!autoValid}
                data-testid="auto-value"
                onChange={(e) => setAutoText(e.target.value.replace(/[^0-9.]/g, "").slice(0, 7))}
              />
              <span className="font-data text-sm text-gray">x</span>
            </div>
            {!autoValid && <p className="mt-1 text-xs text-reactor">Pick between 1.01x and 1000x.</p>}
            {autoOn && autoValid && <p className="mt-1 text-[11px] text-dim">The server pays this the instant it&apos;s reached, even if you close the tab.</p>}
          </div>
          <dl className="grid grid-cols-2 gap-2 rounded-[4px] border border-line bg-ink/60 p-3">
            <div>
              <dt className="eyebrow">Balance</dt>
              <dd className="tabular font-data text-sm text-paper">{credits(balance)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Potential</dt>
              <dd className="font-data text-sm text-gold">
                {phase === "running" ? <PotentialPayout live={live} stake={activeStake} phase={phase} bonusBp={bonusBp} /> : credits(activeStake)}
              </dd>
            </div>
          </dl>
          {game.error && <p role="alert" className="text-sm text-reactor">{game.error}</p>}
          {me && balance < 1 && !busy && <p className="text-sm text-amber">You&apos;re out of points. Claim today&apos;s, or tap your balance for a refill.</p>}
          <FairnessPanel disabled={busy} />
          {outcome && (
            <div className="flex flex-wrap gap-2">
              <ShareButton path={`/r/${outcome.round.shareId}`} title="this round" />
              <Link className="chip" href={`/fairness?round=${outcome.round.shareId}`}>Verify this round</Link>
            </div>
          )}
          <p className="text-[11px] leading-snug text-dim">Points only, with no cash value. Returns {RUN_RETURN_PERCENT}% over the long run whatever you pick, plus any live bonus.</p>
        </div>
      </aside>

      <aside className="order-3 flex flex-col gap-3">
        <RunHistory rounds={history} />
      </aside>
    </div>
  );
}
