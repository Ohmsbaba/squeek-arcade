"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, newRequestKey } from "@/client/api";
import { sound } from "@/client/sound";
import { clientSeed, useArcade } from "@/client/store";
import type { Commit, PublicRound, Settled } from "@/client/types";
import { blockBonusBp, displayMultAt, msToReach, RUN_COUNTDOWN_MS } from "@/shared/run-curve";

/** How long the cash-out moment holds before the wheel carries on without the player. */
const OVERTIME_DELAY_MS = 1100;

/**
 * "overtime" and "missed" follow a cash-out: the player is safe and paid, and the wheel keeps
 * turning on its own until its stop, so they can see what they left behind, or what they dodged.
 */
export type RunPhase = "idle" | "starting" | "countdown" | "running" | "won" | "lost" | "overtime" | "missed";

/** What the wheel did after the player left. All of it is known once the round settles and the seed is revealed. */
export type Overtime = { cashMult: number; stopMult: number; stake: number; paid: number; bonusBp: number; marginMs: number };

/** Read every frame by the scene and the display. Lives outside React so nothing re-renders at 60 fps. */
export type RunLive = {
  phase: RunPhase;
  mult: number;
  countdown: number;
  seconds: number;
  /** The real wheel's speed, mirrored by the idle wheel. */
  realRpm: number;
  /** Goes up each time a real Squeek block lands during the round. */
  blockPulse: number;
};

type StartResponse = { round: PublicRound; balance: number; commit: Commit; serverNow: number };
type ActiveResponse = { active: PublicRound | null; endedWhileAway?: Settled; serverNow: number };

export function useRunGame() {
  const applySettled = useArcade((s) => s.applySettled);
  const setBalance = useArcade((s) => s.setBalance);
  const setCommit = useArcade((s) => s.setCommit);
  const live = useRef<RunLive>({ phase: "idle", mult: 1, countdown: 0, seconds: 0, realRpm: 0, blockPulse: 0 });
  const [phase, setPhaseState] = useState<RunPhase>("idle");
  const [round, setRound] = useState<PublicRound | null>(null);
  const [last, setLast] = useState<Settled | null>(null);
  const [awayNotice, setAwayNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [cashing, setCashing] = useState(false);
  const [historyBump, setHistoryBump] = useState(0);
  const [overtime, setOvertime] = useState<Overtime | null>(null);
  const ghost = useRef(0);
  const ghostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const offset = useRef(0);
  const liftoff = useRef(0);
  const stream = useRef<EventSource | null>(null);
  const poller = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundId = useRef<string | null>(null);
  const finished = useRef(true);
  const frame = useRef(0);
  const lastCount = useRef(99);

  const setPhase = useCallback((p: RunPhase) => {
    live.current.phase = p;
    setPhaseState(p);
  }, []);

  const closeLinks = useCallback(() => {
    stream.current?.close();
    stream.current = null;
    if (poller.current) clearInterval(poller.current);
    poller.current = null;
    setReconnecting(false);
  }, []);

  const stopOvertime = useCallback(() => {
    cancelAnimationFrame(ghost.current);
    if (ghostTimer.current) clearTimeout(ghostTimer.current);
    ghostTimer.current = null;
  }, []);

  /** After a cash-out the wheel runs on to its real stop, now that the stop is public. */
  const runOvertime = useCallback((s: Settled) => {
    const r = s.round;
    const cash = r.resultMult ?? 100;
    const stop = r.crashMult ?? cash;
    if (stop <= cash || !r.liftoffAt) return;
    const liftoffAt = new Date(r.liftoffAt).getTime();
    const stopAt = liftoffAt + msToReach(stop);
    setOvertime({
      cashMult: cash, stopMult: stop, stake: r.stake, paid: r.payout ?? 0,
      bonusBp: r.live.boostBp + blockBonusBp(r.live.blocksMined), marginMs: msToReach(stop) - msToReach(cash),
    });
    ghostTimer.current = setTimeout(() => {
      if (roundId.current !== r.id) return;
      setPhase("overtime");
      sound.startWheel();
      const loop = () => {
        if (roundId.current !== r.id) return;
        const now = Date.now() + offset.current;
        if (now >= stopAt) {
          live.current.mult = stop / 100;
          setPhase("missed");
          sound.wheelStop();
          return;
        }
        live.current.mult = displayMultAt(now - liftoffAt);
        sound.setWheel(Math.min(1, Math.log(live.current.mult) / Math.log(50)) * 0.6);
        ghost.current = requestAnimationFrame(loop);
      };
      ghost.current = requestAnimationFrame(loop);
    }, OVERTIME_DELAY_MS);
  }, [setPhase]);

  const finish = useCallback((s: Settled) => {
    if (finished.current || roundId.current !== s.round.id) return;
    finished.current = true;
    closeLinks();
    cancelAnimationFrame(frame.current);
    const won = s.round.status === "WON";
    live.current.mult = (s.round.resultMult ?? 100) / 100;
    setRound(s.round);
    setLast(s);
    setCashing(false);
    setPhase(won ? "won" : "lost");
    if (won) {
      sound.stopWheel();
      sound.cashout();
    } else {
      sound.wheelStop();
    }
    applySettled(s);
    setHistoryBump((n) => n + 1);
    if (won) runOvertime(s);
  }, [applySettled, closeLinks, runOvertime, setPhase]);

  const startLoop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const loop = () => {
      if (finished.current) return;
      const now = Date.now() + offset.current;
      const elapsed = now - liftoff.current;
      if (elapsed < 0) {
        const left = Math.ceil(-elapsed / 1000);
        live.current.countdown = -elapsed / 1000;
        if (left !== lastCount.current) {
          lastCount.current = left;
          sound.countdown(false);
        }
        if (live.current.phase !== "countdown") setPhase("countdown");
      } else {
        if (live.current.phase !== "running") {
          setPhase("running");
          sound.countdown(true);
          sound.startWheel();
        }
        live.current.seconds = elapsed / 1000;
        live.current.mult = displayMultAt(elapsed);
        sound.setWheel(Math.min(1, Math.log(live.current.mult) / Math.log(50)));
      }
      frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
  }, [setPhase]);

  const poll = useCallback(async () => {
    const id = roundId.current;
    if (!id || finished.current) return;
    try {
      const state = await api<{ finished: boolean } & Settled>(`/api/run/${id}`);
      if (state.finished) finish(state);
    } catch {
      // Still offline. The round carries on, and settles, on the server.
    }
  }, [finish]);

  const connect = useCallback((id: string) => {
    closeLinks();
    const es = new EventSource(`/api/run/${id}/stream`);
    stream.current = es;
    es.addEventListener("settled", (e) => finish(JSON.parse((e as MessageEvent).data)));
    es.onopen = () => {
      setReconnecting(false);
      if (poller.current) {
        clearInterval(poller.current);
        poller.current = null;
      }
    };
    es.onerror = () => {
      if (finished.current) return;
      setReconnecting(true);
      // EventSource retries by itself. Polling keeps the round honest in the meantime.
      if (!poller.current) poller.current = setInterval(poll, 1500);
    };
  }, [closeLinks, finish, poll]);

  const follow = useCallback((r: PublicRound, serverNow: number, sentAt: number, gotAt: number) => {
    stopOvertime();
    setOvertime(null);
    offset.current = serverNow + (gotAt - sentAt) / 2 - gotAt;
    liftoff.current = new Date(r.liftoffAt!).getTime();
    roundId.current = r.id;
    finished.current = false;
    lastCount.current = 99;
    live.current.mult = 1;
    live.current.seconds = 0;
    setRound(r);
    setLast(null);
    setAwayNotice(false);
    connect(r.id);
    startLoop();
  }, [connect, startLoop, stopOvertime]);

  // A refresh mid-round picks the same round back up from the server.
  useEffect(() => {
    let dead = false;
    const sentAt = Date.now();
    api<ActiveResponse>("/api/run/active")
      .then((res) => {
        if (dead) return;
        const gotAt = Date.now();
        if (res.active) {
          follow(res.active, res.serverNow, sentAt, gotAt);
        } else if (res.endedWhileAway) {
          setLast(res.endedWhileAway);
          setRound(res.endedWhileAway.round);
          setAwayNotice(true);
          live.current.mult = (res.endedWhileAway.round.resultMult ?? 100) / 100;
          setPhase(res.endedWhileAway.round.status === "WON" ? "won" : "lost");
          applySettled(res.endedWhileAway);
          setHistoryBump((n) => n + 1);
        }
      })
      .catch(() => {});
    return () => {
      dead = true;
      stopOvertime();
      cancelAnimationFrame(frame.current);
      closeLinks();
      sound.stopWheel();
    };
  }, [applySettled, closeLinks, follow, setPhase, stopOvertime]);

  const start = useCallback(async (stake: number, autoCashout: number | null) => {
    const me = useArcade.getState().me;
    if (!me || !finished.current) return;
    // Starting again cuts the replay short: the next round is what matters.
    stopOvertime();
    sound.stopWheel();
    setError(null);
    setPhase("starting");
    sound.click();
    const requestKey = newRequestKey();
    const attempt = async (commit: Commit, retries: number): Promise<void> => {
      const sentAt = Date.now();
      try {
        const res = await api<StartResponse>("/api/run/start", { body: { stake, autoCashout, clientSeed: clientSeed(), commitHash: commit.hash, requestKey } });
        setBalance(res.balance);
        setCommit(res.commit);
        follow(res.round, res.serverNow, sentAt, Date.now());
      } catch (e) {
        const err = e as ApiError;
        if (err.code === "commit_changed" && err.extra.commit && retries > 0) return attempt(err.extra.commit as Commit, retries - 1);
        // Same key, so a retry can't stake twice even if the first request did land.
        if (err.code === "network" && retries > 0) {
          await new Promise((r) => setTimeout(r, 500));
          return attempt(commit, retries - 1);
        }
        throw e;
      }
    };
    try {
      await attempt(me.commit, 2);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The wheel wouldn't start.");
      setPhase("idle");
    }
  }, [follow, setBalance, setCommit, setPhase, stopOvertime]);

  const cashOut = useCallback(async () => {
    const id = roundId.current;
    if (!id || finished.current || live.current.phase !== "running" || cashing) return;
    setCashing(true);
    for (let i = 0; i < 4; i++) {
      try {
        // Safe to repeat: the server settles once and answers the same every time.
        finish(await api<Settled>(`/api/run/${id}/cashout`, { body: {} }));
        return;
      } catch (e) {
        const err = e as ApiError;
        if (err.code !== "network") {
          setError(err.message);
          break;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    setCashing(false);
    if (!finished.current) setError("Couldn't reach the arcade to cash out. Press again, the wheel is still turning.");
  }, [cashing, finish]);

  return { live, phase, round, last, overtime, awayNotice, error, reconnecting, cashing, historyBump, start, cashOut, countdownMs: RUN_COUNTDOWN_MS };
}
