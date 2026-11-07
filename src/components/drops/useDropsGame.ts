"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, newRequestKey } from "@/client/api";
import { sound } from "@/client/sound";
import { clientSeed, useArcade } from "@/client/store";
import type { Commit, OwnedSqueek, Settled } from "@/client/types";
import { logicalSlotCheck } from "./replay";
import type { DropTrace } from "@/shared/drops/sim";
import type { Chute } from "@/shared/drops/board";
import { slotMult } from "@/shared/drops/tables";
import { trailForLevel } from "@/shared/game-rules";
import { payoutFor } from "@/shared/run-curve";

export type ActiveDrop = {
  id: string;
  trace: DropTrace;
  startedAt: number;
  /** Playback speed. */
  rate: number;
  chute: Chute;
  /** Per token: "arcade" or the art URL. Looks only. */
  arts: string[];
  levels: number[];
  trails: string[];
  settled: Settled;
  stakePerBall: number;
  caught: boolean[];
  paidSoFar: number;
  landed: boolean;
  finished: boolean;
};

/** Rendering reads and advances this directly, frame by frame. */
export type DropsLive = {
  drops: ActiveDrop[];
  onBallLand: (d: ActiveDrop, ball: number) => void;
  onFinish: (d: ActiveDrop) => void;
};

export type Tally = { id: string; balls: number; landed: number; paid: number; stake: number };

export function useDropsGame(selected: OwnedSqueek[], cosmeticColor: string) {
  const applySettled = useArcade((s) => s.applySettled);
  const setCommit = useArcade((s) => s.setCommit);
  const setBalance = useArcade((s) => s.setBalance);
  const hold = useArcade((s) => s.hold);
  const [results, setResults] = useState<Settled[]>([]);
  const [lastLanded, setLastLanded] = useState<Settled | null>(null);
  const [tally, setTally] = useState<Tally | null>(null);
  const [tokensInFlight, setTokensInFlight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [historyBump, setHistoryBump] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const live = useRef<DropsLive>({ drops: [], onBallLand: () => {}, onFinish: () => {} });
  const count = () => live.current.drops.reduce((n, d) => n + d.trace.balls, 0);

  live.current.onBallLand = (d, ball) => {
    if (d.caught[ball]) return;
    d.caught[ball] = true;
    const r = d.settled.round;
    const m = slotMult(d.chute, r.balls, r.slots[ball]);
    const paid = payoutFor(d.stakePerBall, m);
    d.paidSoFar += paid;
    // The result was final when the server answered. This is the moment the player sees it, a token at a time.
    hold(-paid);
    const landed = d.caught.filter(Boolean).length;
    setTally({ id: d.id, balls: r.balls, landed, paid: d.paidSoFar, stake: r.stake });
    if (r.balls > 1) sound.ballLand(m);
    if (landed === r.balls) {
      d.landed = true;
      sound.landing(r.resultMult ?? 0);
      setLastLanded(d.settled);
      setResults((old) => [d.settled, ...old].slice(0, 6));
      applySettled(d.settled);
      setHistoryBump((n) => n + 1);
    }
  };
  live.current.onFinish = (d) => {
    live.current.drops = live.current.drops.filter((x) => x !== d);
    setTokensInFlight(count());
  };

  // Load the physics up front, so the first drop doesn't wait for it.
  useEffect(() => {
    void import("@/shared/drops/sim").then((m) => m.initPhysics());
  }, []);

  useEffect(() => {
    const dropsRef = live.current;
    return () => {
      // Leaving mid-fall: everything's already settled, so just release what's still held.
      for (const d of dropsRef.drops) useArcade.getState().hold(-((d.settled.round.payout ?? 0) - d.paidSoFar));
      dropsRef.drops = [];
    };
  }, []);

  const drop = useCallback((stakePerBall: number, chute: Chute, balls: number) => {
    setError(null);
    sound.drop();
    const requestKey = newRequestKey();
    const squeeks = selected;
    // Requests go one at a time: each needs the commitment the last one produced.
    queue.current = queue.current.then(async () => {
      const me = useArcade.getState().me;
      if (!me) return;
      const attempt = async (hash: string, retries: number): Promise<Settled> => {
        try {
          return await api<Settled>("/api/drops/play", {
            body: { stake: stakePerBall, chute, balls, tokenIds: squeeks.map((s) => s.tokenId), clientSeed: clientSeed(), commitHash: hash, requestKey },
          });
        } catch (e) {
          const err = e as ApiError;
          if (err.code === "commit_changed" && err.extra.commit && retries > 0) return attempt((err.extra.commit as Commit).hash, retries - 1);
          if (err.code === "network" && retries > 0) {
            await new Promise((r) => setTimeout(r, 400));
            return attempt(hash, retries - 1);
          }
          throw e;
        }
      };
      try {
        // Hold the payout back until the tokens land, so the balance doesn't spoil the fall.
        const res = await attempt(me.commit.hash, 2);
        hold(res.round.payout ?? 0);
        setCommit(res.commit);
        setBalance(res.balance);
        const trace = await logicalSlotCheck(res);
        // Squeeks take turns. With fewer Squeeks than tokens, they come round again.
        const pick = (i: number) => (squeeks.length ? squeeks[i % squeeks.length] : null);
        const d: ActiveDrop = {
          id: res.round.id, trace, startedAt: performance.now(), rate: 1, chute, settled: res, stakePerBall,
          arts: Array.from({ length: balls }, (_, i) => pick(i)?.imageUrl ?? "arcade"),
          levels: Array.from({ length: balls }, (_, i) => pick(i)?.level ?? 0),
          trails: Array.from({ length: balls }, (_, i) => { const s = pick(i); return s ? trailForLevel(s.level) : cosmeticColor; }),
          caught: new Array(balls).fill(false), paidSoFar: 0, landed: false, finished: false,
        };
        setTally({ id: d.id, balls, landed: 0, paid: 0, stake: res.round.stake });
        live.current.drops.push(d);
        setTokensInFlight(count());
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "That drop didn't go through. Nothing was staked.");
      }
    });
  }, [cosmeticColor, hold, selected, setBalance, setCommit]);

  return { live, drop, results, lastLanded, tally, tokensInFlight, error, historyBump };
}
