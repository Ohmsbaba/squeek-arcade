"use client";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "@/client/env";
import { credits, mult, signed, slotLabel, timeAgo } from "@/client/format";
import { sound } from "@/client/sound";
import { useArcade } from "@/client/store";
import type { OwnedSqueek, PublicRound } from "@/client/types";
import { FairnessPanel } from "@/components/game/FairnessPanel";
import { LiteToggle } from "@/components/game/LiteToggle";
import { ShareButton } from "@/components/game/ShareButton";
import { StakeControl } from "@/components/game/StakeControl";
import { useCanRender3D } from "@/components/game/useCanRender3D";
import { useHistory } from "@/components/game/useHistory";
import { BALL_COUNTS, CHUTES, type BallCount, type Chute } from "@/shared/drops/board";
import { CALIBRATION_BALLS, chanceFor, DROPS_RETURN, slotMult, tableFor } from "@/shared/drops/tables";
import { COSMETICS, DEFAULT_STAKE, trailForLevel } from "@/shared/game-rules";
import { DailyClaim } from "@/components/game/DailyClaim";
import DropsFallback from "./DropsFallback";
import { ArcadeFace, SqueekPicker } from "./SqueekPicker";
import { slotColor } from "./faces";
import { useDropsGame } from "./useDropsGame";

const DropsScene = dynamic(() => import("./DropsScene"), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center font-data text-xs text-gray">Polishing the pegs…</div>,
});

function DropHistory({ rounds }: { rounds: PublicRound[] | null }) {
  return (
    <section className="plate p-4" aria-label="Your recent drops">
      <h2 className="eyebrow">Your recent drops</h2>
      {rounds === null && <p className="mt-3 font-data text-xs text-dim">Loading…</p>}
      {rounds?.length === 0 && <p className="mt-3 text-sm text-gray">No drops yet. Your rounds show up here, and only yours.</p>}
      <ul className="mt-2 divide-y divide-line">
        {rounds?.map((r) => {
          const m = (r.resultMult ?? 0) / 100;
          return (
            <li key={r.id} className="py-2" data-testid="drop-history-row">
              <div className="flex items-baseline justify-between gap-2">
                <span className="tabular font-data text-sm" style={{ color: slotColor(m) }}>{mult(r.resultMult)}</span>
                <span className={`tabular font-data text-sm ${(r.net ?? 0) > 0 ? "text-mint" : (r.net ?? 0) < 0 ? "text-reactor" : "text-lit"}`}>{signed(r.net ?? 0)}</span>
              </div>
              <div className="mt-0.5 flex justify-between gap-2 font-data text-[11px] text-dim">
                <span className="truncate">{r.balls > 1 ? `${r.balls} tokens, best shown` : r.tokenId ? `Squeek #${r.tokenId}` : "Arcade token"} · bet {credits(r.stake)}</span>
                <span className="flex shrink-0 gap-2">
                  <time dateTime={r.createdAt}>{timeAgo(r.createdAt)}</time>
                  <Link className="link" href={`/fairness?round=${r.shareId}`}>Verify</Link>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function DropsGame() {
  const me = useArcade((s) => s.me);
  const held = useArcade((s) => s.held);
  const can3d = useCanRender3D();
  const reduced = useReducedMotion();
  const [stake, setStake] = useState<number>(DEFAULT_STAKE);
  const [chute, setChuteState] = useState<Chute>(0);
  const [balls, setBalls] = useState<BallCount>(5);
  const [selected, setSelected] = useState<OwnedSqueek[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const cosmetic = COSMETICS.find((c) => c.key === me?.cosmetic)?.color ?? "#f2c230";
  const game = useDropsGame(selected, cosmetic);
  const history = useHistory("DROPS", game.historyBump);
  const table = useMemo(() => tableFor(chute, balls), [chute, balls]);
  const odds = useMemo(() => chanceFor(chute, balls), [chute, balls]);
  const balance = (me?.balance ?? 0) - held;
  const total = stake * balls;
  const canDrop = Boolean(me) && stake > 0 && total <= balance && game.tokensInFlight + balls <= 30;

  const setChute = useCallback((c: Chute) => setChuteState(c), []);

  useEffect(() => {
    const saved = Number(localStorage.getItem("sa_drop_stake"));
    if (saved > 0) setStake(saved);
  }, []);
  useEffect(() => {
    if (stake > 0) localStorage.setItem("sa_drop_stake", String(stake));
  }, [stake]);

  const go = useCallback(() => {
    if (canDrop) game.drop(stake, chute, balls);
  }, [balls, canDrop, chute, game, stake]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT") return;
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        setChuteState((c) => {
          const i = CHUTES.indexOf(c) + (e.code === "ArrowLeft" ? -1 : 1);
          return CHUTES[Math.max(0, Math.min(CHUTES.length - 1, i))];
        });
        sound.tick();
      }
      if (e.code === "Space" && tag !== "BUTTON" && tag !== "A") {
        e.preventDefault();
        if (!e.repeat) go();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const last = game.lastLanded;
  const previewArts = selected.length ? selected.map((s) => s.imageUrl) : ["arcade"];
  const previewTrail = selected.length ? trailForLevel(selected[0].level) : cosmetic;
  const tally = game.tally;
  const counting = tally && tally.landed < tally.balls && tally.balls > 1;

  return (
    <div className="mx-auto grid w-full max-w-[1500px] flex-1 grid-cols-1 gap-3 p-2 sm:p-3 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
      <section className="plate relative order-1 h-[58svh] min-h-[380px] overflow-hidden lg:order-2 lg:h-auto lg:min-h-[680px]" aria-label="Squeek Drops board">
        <div className="absolute inset-0" data-testid="drops-stage">
          {can3d === null ? null : can3d ? (
            <DropsScene live={game.live} chute={chute} setChute={setChute} table={table} previewArts={previewArts} previewTrail={previewTrail} balls={balls} reduced={reduced} />
          ) : (
            <DropsFallback live={game.live} chute={chute} setChute={setChute} table={table} previewArt={previewArts[0]} balls={balls} />
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
          {counting && tally && (
            <div className="absolute top-0 rounded-[6px] border border-gold/60 bg-ink/90 px-3 py-1 text-center" data-testid="drop-tally">
              <span className="font-data text-xs text-lit">{tally.landed} of {tally.balls} in</span>
              <span className="tabular ml-2 font-display text-xl font-semibold text-gold">{credits(tally.paid)}</span>
            </div>
          )}
          <AnimatePresence mode="popLayout">
            {last && !counting && (
              <motion.div
                key={last.round.id}
                data-testid="drop-result"
                initial={{ opacity: 0, y: -10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="rounded-[6px] border border-line2 bg-ink/90 px-3 py-1 text-center"
              >
                <span className="font-display text-xl font-semibold uppercase tracking-wide" style={{ color: slotColor((last.round.resultMult ?? 0) / 100) }}>
                  {last.round.balls > 1 ? `Best ${mult(last.round.resultMult)}` : mult(last.round.resultMult)}
                </span>
                <span className={`ml-2 font-data text-sm ${(last.round.net ?? 0) > 0 ? "text-mint" : (last.round.net ?? 0) < 0 ? "text-reactor" : "text-lit"}`}>{signed(last.round.net ?? 0)}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="absolute right-2 top-2 hidden sm:block"><LiteToggle /></div>
      </section>

      <aside className="order-2 lg:order-1">
        <div className="plate flex flex-col gap-4 p-4">
          <header className="hidden lg:block">
            <p className="eyebrow">Game one</p>
            <h1 className="title mt-1 text-4xl text-gold">Squeek Drops</h1>
            <p className="mt-2 text-sm leading-relaxed text-lit">Up to ten tokens fall at once through real physics, knocking each other about on the way down. Where each one lands is what it pays.</p>
          </header>

          <button data-testid="drop" onClick={go} disabled={!canDrop} className="key key-gold order-first h-[72px] w-full text-3xl lg:order-none" style={{ "--travel": "6px" } as React.CSSProperties}>
            Drop {balls > 1 ? balls : ""}
          </button>
          <div className="order-first lg:order-none"><DailyClaim /></div>

          <div>
            <p className="eyebrow">Tokens at once</p>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Tokens at once">
              {BALL_COUNTS.map((b) => (
                <button key={b} role="radio" aria-checked={b === balls} data-on={b === balls} data-testid={`balls-${b}`} className="chip justify-center py-2 text-sm" onClick={() => { sound.tick(); setBalls(b); }}>{b}</button>
              ))}
            </div>
          </div>

          <div>
            <p className="eyebrow">Your fallers</p>
            <button onClick={() => { sound.click(); setPickerOpen(true); }} data-testid="pick-squeek" className="mt-1.5 flex w-full items-center gap-3 rounded-[4px] border border-line2 bg-ink p-2 text-left transition-colors hover:border-gold">
              {selected.length ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected[0].imageUrl} alt={selected[0].name} width={44} height={44} className="h-11 w-11 rounded-full bg-panel object-cover" />
              ) : (
                <span className="h-11 w-11 overflow-hidden rounded-full"><ArcadeFace size={44} /></span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-data text-sm text-paper" data-testid="faller-name">{selected.length > 1 ? `${selected.length} Squeeks` : selected.length ? selected[0].name : "Arcade token"}</span>
                <span className="block truncate font-data text-[11px] text-gray">{selected.length > 1 ? selected.map((s) => `#${s.tokenId}`).join(" ") : selected.length ? `Token #${selected[0].tokenId} · Level ${selected[0].level}` : "Tap to use Squeeks you hold"}</span>
              </span>
              <span className="font-data text-xs text-gold">Change</span>
            </button>
          </div>

          <div>
            <p className="eyebrow">Starting position</p>
            <div className="mt-1.5 grid grid-cols-7 gap-1" role="radiogroup" aria-label="Starting position">
              {CHUTES.map((c) => (
                <button key={c} role="radio" aria-checked={c === chute} data-on={c === chute} data-testid={`chute-${c}`} className="chip justify-center px-0" onClick={() => { sound.tick(); setChuteState(c); }}>
                  {c > 0 ? `+${c}` : c}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-dim">
              Moving the chute shifts where tokens tend to land, so the slots re-price, aiming for the same {(DROPS_RETURN * 100).toFixed(0)}% long-run return. Off-centre is riskier, not better.
            </p>
          </div>

          <div>
            <StakeControl stake={stake} setStake={setStake} balance={balance} label="Bet per token" multiple={balls} />
            {balls > 1 && <p className="mt-1.5 font-data text-[11px] text-gray" data-testid="total-bet">Total bet: {credits(total)}</p>}
          </div>
          {game.error && <p role="alert" className="text-sm text-reactor">{game.error}</p>}
          {me && balance < 1 && game.tokensInFlight === 0 && <p className="text-sm text-amber">You&apos;re out of points. Claim today&apos;s, or tap your balance for a refill.</p>}
          <FairnessPanel />
          <p className="text-[11px] leading-snug text-dim">Points only, with no cash value.</p>
        </div>
      </aside>

      <aside className="order-3 flex flex-col gap-3">
        {last && (
          <section className="plate p-4" aria-label="Last result" data-testid="result-card">
            <h2 className="eyebrow">Last result</h2>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="tabular font-display text-5xl font-semibold" style={{ color: slotColor((last.round.resultMult ?? 0) / 100) }}>{last.round.balls > 1 ? signed(last.round.net ?? 0) : mult(last.round.resultMult)}</p>
              {last.round.tokenId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/nfts/${last.round.tokenId}/image`} alt={`Squeek #${last.round.tokenId}`} width={64} height={64} className="h-16 w-16 rounded-full border-2 border-brass bg-panel object-cover" />
              ) : (
                <span className="h-16 w-16 overflow-hidden rounded-full border-2 border-brass"><ArcadeFace size={64} /></span>
              )}
            </div>
            {last.round.balls > 1 && (
              <ul className="mt-2 flex flex-wrap gap-1" data-testid="ball-results">
                {last.round.slots.map((slot, i) => {
                  const m = slotMult(last.round.chute as Chute, last.round.balls, slot) / 100;
                  return <li key={i} className="rounded-[3px] border border-line2 px-1.5 py-0.5 font-data text-[11px]" style={{ color: slotColor(m) }}>{slotLabel(m)}</li>;
                })}
              </ul>
            )}
            <dl className="mt-2 space-y-1 font-data text-xs">
              <Row label={last.round.balls > 1 ? "Fallers" : "Faller"} value={last.round.tokenIds.length > 1 ? `${last.round.tokenIds.length} Squeeks` : last.round.tokenId ? `Squeek #${last.round.tokenId}` : "Arcade token"} />
              <Row label="Bet" value={credits(last.round.stake)} />
              {last.round.balls === 1 && <Row label="Landed in" value={`Slot ${(last.round.slot ?? 0) + 1} of 11`} />}
              <Row label="Paid" value={credits(last.round.payout ?? 0)} />
              <Row label="Result" value={signed(last.round.net ?? 0)} />
              <Row label="Balance" value={credits(balance)} />
              {last.xpGained > 0 && <Row label="XP" value={`+${last.xpGained}`} />}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <ShareButton path={`/r/${last.round.shareId}`} title="this drop" />
              <Link className="chip" href={`/fairness?round=${last.round.shareId}`}>Verify</Link>
            </div>
          </section>
        )}
        <section className="plate p-4" aria-label="Pay table">
          <h2 className="eyebrow">Each token pays</h2>
          <ul className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1">
            {table.map((m, i) => (
              <li key={i} className="contents">
                <span className="w-9 text-right font-data text-[11px]" style={{ color: slotColor(m) }}>{slotLabel(m)}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-line">
                  <span className="block h-full rounded-full" style={{ width: `${Math.min(100, odds[i] * 300)}%`, background: slotColor(m) }} />
                </span>
                <span className="w-12 text-right font-data text-[10px] text-dim">{odds[i] < 0.001 ? "<0.1" : (odds[i] * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-dim">Odds measured from {CALIBRATION_BALLS.toLocaleString("en-US")} simulated tokens for each setting. They&apos;re the same whichever token falls.</p>
        </section>
        <DropHistory rounds={history} />
      </aside>

      <SqueekPicker open={pickerOpen} onClose={() => setPickerOpen(false)} selected={selected} onSelect={setSelected} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-dim">{label}</dt>
      <dd className="tabular text-paper">{value}</dd>
    </div>
  );
}
