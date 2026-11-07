import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { activeRun, cashOut, readRun, runVerdict, startRun } from "@/server/run";
import { hashServerSeed, roundDigest } from "@/shared/fairness";
import { crashFromDigest, msToReach, multAt, payoutFor, RUN_COUNTDOWN_MS } from "@/shared/run-curve";
import { STARTING_CREDITS as START } from "@/shared/game-rules";
import { blockBonusBp, livePayout, rpmBoostBp } from "@/shared/run-curve";
import { NO_READING, setLiveWheelForTests, wheelFromReadings, type LiveWheel } from "@/server/squeekchain";
import { parseRealTime } from "@/client/useLiveWheel";
import { balanceOf, key, ledgerSum, newPlayer, resetDb } from "./helpers";

const T0 = 1_800_000_000_000;
const readBeacon = async () => (await currentWheel()).beacon;
let currentWheel: () => LiveWheel = () => NO_READING;
const wheel = (over: Partial<LiveWheel>): LiveWheel => ({ ...NO_READING, available: true, ...over });
const setWheel = (w: LiveWheel) => {
  currentWheel = () => w;
  setLiveWheelForTests(() => w);
};

/** Starts a round whose stop is at least `atLeast` (hundredths) or at most `atMost`, by trying client seeds. */
async function startWith(userId: string, want: (crash: number) => boolean, extra: { stake?: number; autoCashout?: number | null } = {}, now = T0) {
  const seed = await db.fairnessSeed.findFirstOrThrow({ where: { userId, status: "COMMITTED" } });
  let clientSeed = "";
  const beacon = (await readBeacon()) ?? null;
  for (let i = 0; i < 100_000; i++) {
    clientSeed = `try-${i}`;
    if (want(crashFromDigest(roundDigest(seed.serverSeed, clientSeed, seed.nonce, "run", beacon)))) break;
  }
  const res = await startRun(userId, { stake: extra.stake ?? 100, autoCashout: extra.autoCashout ?? null, clientSeed, commitHash: seed.hash, requestKey: key() }, now);
  const crash = crashFromDigest(roundDigest(seed.serverSeed, clientSeed, seed.nonce, "run", beacon));
  return { res, crash, clientSeed, seed, beacon };
}

const after = (ms: number) => T0 + RUN_COUNTDOWN_MS + ms;

describe("Squeek Run", () => {
  beforeEach(async () => {
    await resetDb();
    setWheel(NO_READING);
  });

  it("takes the stake at the start and hides the stop point and seed", async () => {
    const p = await newPlayer();
    const { res } = await startWith(p.id, (c) => c >= 200);
    expect(await balanceOf(p.id)).toBe(START - 100);
    expect(res.round.status).toBe("ACTIVE");
    expect(res.round.crashMult).toBeNull();
    expect(res.round.fairness.serverSeed).toBeNull();
    expect(JSON.stringify(res.round)).not.toMatch(/crashMult":\d/);
  });

  it("cashing out before the stop pays by the server's clock", async () => {
    const p = await newPlayer();
    const { res, crash } = await startWith(p.id, (c) => c >= 300);
    const t = msToReach(200) + 40;
    const out = await cashOut(p.id, res.round.id, after(t));
    expect(crash).toBeGreaterThanOrEqual(300);
    expect(out.round.status).toBe("WON");
    expect(out.round.resultMult).toBe(multAt(t));
    expect(out.round.payout).toBe(payoutFor(100, multAt(t)));
    expect(await balanceOf(p.id)).toBe(START - 100 + payoutFor(100, multAt(t)));
    expect(await ledgerSum(p.id)).toBe(await balanceOf(p.id));
  });

  it("the wheel stopping first loses the stake", async () => {
    const p = await newPlayer();
    const { res, crash } = await startWith(p.id, (c) => c >= 120 && c < 200);
    const out = await cashOut(p.id, res.round.id, after(msToReach(crash)));
    expect(out.round.status).toBe("LOST");
    expect(out.round.payout).toBe(0);
    expect(out.round.resultMult).toBe(crash);
    expect(await balanceOf(p.id)).toBe(START - 100);
  });

  it("a stop at 1.00x ends the round the moment the wheel starts", async () => {
    const p = await newPlayer();
    const { res, crash } = await startWith(p.id, (c) => c === 100);
    expect(crash).toBe(100);
    await expect(cashOut(p.id, res.round.id, after(-1))).rejects.toMatchObject({ code: "not_started" });
    const out = await cashOut(p.id, res.round.id, after(0));
    expect(out.round.status).toBe("LOST");
  });

  it("can't cash out during the countdown", async () => {
    const p = await newPlayer();
    const { res } = await startWith(p.id, (c) => c >= 200);
    await expect(cashOut(p.id, res.round.id, T0 + 1000)).rejects.toMatchObject({ code: "not_started" });
    expect(await balanceOf(p.id)).toBe(START - 100);
  });

  it("auto cash-out pays exactly its target even if nobody was watching", async () => {
    const p = await newPlayer();
    const { res } = await startWith(p.id, (c) => c >= 300, { autoCashout: 150 });
    const running = await readRun(p.id, res.round.id, after(msToReach(150) - 5));
    expect(running.finished).toBe(false);
    const state = await readRun(p.id, res.round.id, after(600_000));
    expect(state.finished).toBe(true);
    expect(state.round.resultMult).toBe(150);
    expect(state.round.status).toBe("WON");
    expect(await balanceOf(p.id)).toBe(START - 100 + 150);
    expect(new Date(state.round.settledAt!).getTime()).toBe(after(msToReach(150)));
  });

  it("auto cash-out set above the stop loses", async () => {
    const p = await newPlayer();
    const { res, crash } = await startWith(p.id, (c) => c >= 120 && c < 140, { autoCashout: 150 });
    const state = await readRun(p.id, res.round.id, after(msToReach(crash)));
    expect(state.finished).toBe(true);
    expect(state.round.status).toBe("LOST");
  });

  it("auto cash-out equal to the stop wins, matching the published odds", async () => {
    const p = await newPlayer();
    const { res, crash } = await startWith(p.id, (c) => c >= 130 && c < 400);
    await db.gameRound.update({ where: { id: res.round.id }, data: { autoCashout: crash } });
    const state = await readRun(p.id, res.round.id, after(msToReach(crash)));
    expect(state.round.status).toBe("WON");
    expect(state.round.resultMult).toBe(crash);
  });

  it("a late manual press can't beat its own auto target", async () => {
    const p = await newPlayer();
    const { res } = await startWith(p.id, (c) => c >= 500, { autoCashout: 150 });
    const out = await cashOut(p.id, res.round.id, after(msToReach(300)));
    expect(out.round.resultMult).toBe(150);
  });

  it("settles exactly once under a flood of duplicate cash-outs", async () => {
    const p = await newPlayer();
    const { res } = await startWith(p.id, (c) => c >= 300);
    const t = after(msToReach(200));
    const results = await Promise.all(Array.from({ length: 12 }, () => cashOut(p.id, res.round.id, t)));
    expect(results.filter((r) => r.settledNow).length).toBe(1);
    expect(new Set(results.map((r) => r.round.payout)).size).toBe(1);
    expect(await balanceOf(p.id)).toBe(START - 100 + 200);
    const payouts = await db.demoTransaction.count({ where: { roundId: res.round.id, type: "PAYOUT" } });
    expect(payouts).toBe(1);
    const stats = await db.playerProfile.findUniqueOrThrow({ where: { userId: p.id } });
    expect(stats.runsPlayed).toBe(1);
    expect(stats.cashouts).toBe(1);
    expect(await ledgerSum(p.id)).toBe(await balanceOf(p.id));
  });

  it("a cash-out and a stop racing still settle once", async () => {
    const p = await newPlayer();
    const { res, crash } = await startWith(p.id, (c) => c >= 200 && c < 400);
    const t = after(msToReach(crash));
    await Promise.all([cashOut(p.id, res.round.id, t - 5), readRun(p.id, res.round.id, t), cashOut(p.id, res.round.id, t)]);
    expect(await db.demoTransaction.count({ where: { roundId: res.round.id, type: "STAKE" } })).toBe(1);
    expect(await db.demoTransaction.count({ where: { roundId: res.round.id, type: "PAYOUT" } })).toBeLessThanOrEqual(1);
    expect(await ledgerSum(p.id)).toBe(await balanceOf(p.id));
  });

  it("a replayed start request returns the same round without a second stake", async () => {
    const p = await newPlayer();
    const seed = await db.fairnessSeed.findFirstOrThrow({ where: { userId: p.id, status: "COMMITTED" } });
    const input = { stake: 50, autoCashout: null, clientSeed: "same", commitHash: seed.hash, requestKey: key() };
    const [a, b] = await Promise.all([startRun(p.id, input, T0), startRun(p.id, input, T0)]);
    expect(a.round.id).toBe(b.round.id);
    expect(await balanceOf(p.id)).toBe(START - 50);
    const c = await startRun(p.id, input, T0 + 50);
    expect(c.round.id).toBe(a.round.id);
    expect(await balanceOf(p.id)).toBe(START - 50);
  });

  it("one wheel at a time per player", async () => {
    const p = await newPlayer();
    const { res } = await startWith(p.id, (c) => c >= 500);
    const seed = await db.fairnessSeed.findFirstOrThrow({ where: { userId: p.id, status: "COMMITTED" } });
    await expect(startRun(p.id, { stake: 10, clientSeed: "x", commitHash: seed.hash, requestKey: key() }, T0 + 10)).rejects.toMatchObject({ code: "round_active" });
    expect(res.round.status).toBe("ACTIVE");
    expect(await balanceOf(p.id)).toBe(START - 100);
  });

  it("starting again right after a stop works, and the old round is settled on the way", async () => {
    const p = await newPlayer();
    const { res, crash } = await startWith(p.id, (c) => c >= 110 && c < 130);
    const later = after(msToReach(crash) + 10);
    const seed = await db.fairnessSeed.findFirstOrThrow({ where: { userId: p.id, status: "COMMITTED" } });
    const next = await startRun(p.id, { stake: 10, clientSeed: "next", commitHash: seed.hash, requestKey: key() }, later);
    expect(next.round.id).not.toBe(res.round.id);
    const old = await db.gameRound.findUniqueOrThrow({ where: { id: res.round.id } });
    expect(old.status).toBe("LOST");
  });

  it("refreshing mid-round resumes the same round", async () => {
    const p = await newPlayer();
    const { res } = await startWith(p.id, (c) => c >= 300);
    const back = await activeRun(p.id, after(100));
    expect(back.active?.id).toBe(res.round.id);
    expect(back.active?.crashMult).toBeNull();
    expect(new Date(back.active!.liftoffAt!).getTime()).toBe(after(0));
  });

  it("coming back after the wheel stopped reports the loss", async () => {
    const p = await newPlayer();
    const { res, crash } = await startWith(p.id, (c) => c < 500 && c >= 110);
    const back = await activeRun(p.id, after(msToReach(crash) + 60_000));
    expect(back.active).toBeNull();
    expect((back as { endedWhileAway?: { round: { id: string; status: string } } }).endedWhileAway?.round.id).toBe(res.round.id);
    expect((back as { endedWhileAway?: { round: { status: string } } }).endedWhileAway?.round.status).toBe("LOST");
  });

  it("the client has no way to name a multiplier", async () => {
    const p = await newPlayer();
    const { res } = await startWith(p.id, (c) => c >= 300);
    // cashOut takes no multiplier at all; at 1 ms the most anyone can get is ~1.00x.
    const out = await cashOut(p.id, res.round.id, after(1));
    expect(out.round.resultMult).toBe(100);
    expect(out.round.payout).toBe(100);
  });

  it("players can't touch each other's rounds", async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const { res } = await startWith(a.id, (c) => c >= 300);
    await expect(cashOut(b.id, res.round.id, after(1000))).rejects.toMatchObject({ code: "round_not_found" });
    await expect(readRun(b.id, res.round.id, after(1000))).rejects.toMatchObject({ code: "round_not_found" });
    expect(await balanceOf(b.id)).toBe(START);
  });

  it("players' wheels are independent", async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const ra = await startWith(a.id, (c) => c >= 300);
    const rb = await startWith(b.id, (c) => c >= 110 && c < 130);
    const lost = await readRun(b.id, rb.res.round.id, after(msToReach(rb.crash)));
    expect(lost.round.status).toBe("LOST");
    const still = await readRun(a.id, ra.res.round.id, after(msToReach(rb.crash)));
    expect(still.finished).toBe(false);
  });

  it("refuses bad stakes and overdrafts, and the balance never goes negative", async () => {
    const p = await newPlayer();
    const seed = await db.fairnessSeed.findFirstOrThrow({ where: { userId: p.id, status: "COMMITTED" } });
    await expect(startRun(p.id, { stake: 50_000, clientSeed: "x", commitHash: seed.hash, requestKey: key() }, T0)).rejects.toMatchObject({ code: "insufficient_credits" });
    expect(await balanceOf(p.id)).toBe(START);
    // The failed start left the commitment unspent.
    const same = await db.fairnessSeed.findFirstOrThrow({ where: { userId: p.id, status: "COMMITTED" } });
    expect(same.id).toBe(seed.id);
    await expect(db.$executeRaw`UPDATE demo_balances SET amount = -1 WHERE "userId" = ${p.id}`).rejects.toThrow();
  });

  it("a stale commitment is refused and the new one offered", async () => {
    const p = await newPlayer();
    await expect(startRun(p.id, { stake: 10, clientSeed: "x", commitHash: "0".repeat(64), requestKey: key() }, T0)).rejects.toMatchObject({ code: "commit_changed" });
  });

  it("the revealed seed proves the round: hash matches, stop re-derives", async () => {
    const p = await newPlayer();
    const { res, crash, clientSeed, seed } = await startWith(p.id, (c) => c >= 120 && c < 400);
    expect(res.round.fairness.hash).toBe(seed.hash);
    const out = await cashOut(p.id, res.round.id, after(msToReach(crash)));
    const revealed = out.round.fairness.serverSeed!;
    expect(hashServerSeed(revealed)).toBe(res.round.fairness.hash);
    expect(crashFromDigest(roundDigest(revealed, clientSeed, res.round.fairness.nonce, "run"))).toBe(out.round.crashMult);
  });

  it("each round gets a fresh commitment", async () => {
    const p = await newPlayer();
    const first = await startWith(p.id, (c) => c >= 300);
    expect(first.res.commit.hash).not.toBe(first.seed.hash);
    expect(first.res.commit.nonce).toBe(first.seed.nonce + 1);
  });

  it("with the live feed down, the game plays on with no bonus", async () => {
    const p = await newPlayer();
    const { res } = await startWith(p.id, (c) => c >= 300);
    expect(res.round.live).toMatchObject({ rpm: 0, boostBp: 0, startBlock: null });
    expect(res.round.fairness.beacon).toBeNull();
  });

  it("the real wheel's speed locks a payout boost at the start", async () => {
    setWheel(wheel({ running: true, rpm: 77, blockHeight: 100, beacon: "0x" + "ab".repeat(32) }));
    const p = await newPlayer();
    const { res } = await startWith(p.id, (c) => c >= 300);
    expect(res.round.live).toMatchObject({ rpm: 77, boostBp: 800, startBlock: 100 });
    // He stops, and the boost stays: it was locked when the round started.
    setWheel(wheel({ running: false, rpm: 0, blockHeight: 100 }));
    const out = await cashOut(p.id, res.round.id, after(msToReach(200)));
    expect(out.round.payout).toBe(216);
    expect(out.round.resultMult).toBe(200);
    expect(out.unlocked.map((u) => u.key)).toContain("live_runner");
  });

  it("a resting hamster gives no boost", async () => {
    setWheel(wheel({ running: false, rpm: 0, blockHeight: 100 }));
    const p = await newPlayer();
    const { res } = await startWith(p.id, (c) => c >= 300);
    expect(res.round.live.boostBp).toBe(0);
  });

  it("boost scale: 1% to 10%, and none at rest", () => {
    expect(rpmBoostBp(0)).toBe(0);
    expect(rpmBoostBp(3)).toBe(100);
    expect(rpmBoostBp(77)).toBe(800);
    expect(rpmBoostBp(5000)).toBe(1000);
    expect(blockBonusBp(3)).toBe(1500);
    expect(blockBonusBp(99)).toBe(2500);
    expect(blockBonusBp(-2)).toBe(0);
    expect(livePayout(100, 200, 1500)).toBe(230);
  });

  it("real blocks mined during the run pay on cash-out, read by the server at settlement", async () => {
    setWheel(wheel({ blockHeight: 500 }));
    const p = await newPlayer();
    const now = Date.now() - RUN_COUNTDOWN_MS - msToReach(200);
    const { res } = await startWith(p.id, (c) => c >= 300, {}, now);
    setWheel(wheel({ blockHeight: 502 }));
    const out = await cashOut(p.id, res.round.id, now + RUN_COUNTDOWN_MS + msToReach(200));
    expect(out.round.live.blocksMined).toBe(2);
    expect(out.round.payout).toBe(220);
    expect(out.unlocked.map((u) => u.key)).toContain("block_catcher");
    expect((await db.playerProfile.findUniqueOrThrow({ where: { userId: p.id } })).blocksCaught).toBe(2);
    expect(await ledgerSum(p.id)).toBe(await balanceOf(p.id));
  });

  it("a slow feed can't hold up a cash-out and let the stop overtake it", async () => {
    setWheel(wheel({ blockHeight: 500 }));
    const p = await newPlayer();
    const now = Date.now() - RUN_COUNTDOWN_MS - msToReach(200);
    const { res } = await startWith(p.id, (c) => c >= 300, {}, now);
    // The feed now takes far longer than any cash-out should wait.
    setLiveWheelForTests(() => new Promise((resolve) => setTimeout(() => resolve(wheel({ blockHeight: 500 })), 5000)));
    const started = Date.now();
    const out = await cashOut(p.id, res.round.id, now + RUN_COUNTDOWN_MS + msToReach(200));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(out.round.status).toBe("WON");
    expect(out.round.live.blocksMined).toBe(0);
    expect(out.round.payout).toBe(200);
  });

  it("a round settled long after it ended takes no block bonus, and blocks going backwards pay nothing", async () => {
    setWheel(wheel({ blockHeight: 500 }));
    const p = await newPlayer();
    const old = Date.now() - 600_000;
    const { res } = await startWith(p.id, (c) => c >= 300, { autoCashout: 150 }, old);
    setWheel(wheel({ blockHeight: 900 }));
    const state = await readRun(p.id, res.round.id);
    expect(state.round.live.blocksMined).toBe(0);
    expect(state.round.payout).toBe(150);

    const q = await newPlayer();
    setWheel(wheel({ blockHeight: 500 }));
    const now = Date.now() - RUN_COUNTDOWN_MS - msToReach(200);
    const second = await startWith(q.id, (c) => c >= 300, {}, now);
    setWheel(wheel({ blockHeight: 499 }));
    const out = await cashOut(q.id, second.res.round.id, now + RUN_COUNTDOWN_MS + msToReach(200));
    expect(out.round.live.blocksMined).toBe(0);
  });

  it("bonuses never move the stop or rescue a loss", async () => {
    setWheel(wheel({ running: true, rpm: 90, blockHeight: 10, beacon: "0x" + "cd".repeat(32) }));
    const p = await newPlayer();
    const { res, crash } = await startWith(p.id, (c) => c >= 120 && c < 300);
    setWheel(wheel({ running: true, rpm: 90, blockHeight: 14 }));
    const out = await cashOut(p.id, res.round.id, after(msToReach(crash)));
    expect(out.round.status).toBe("LOST");
    expect(out.round.payout).toBe(0);
    expect(out.round.crashMult).toBe(crash);
  });

  it("the beacon is mixed in and recorded, so the stop still re-derives from public values", async () => {
    const beacon = "0x" + "ef".repeat(32);
    setWheel(wheel({ beacon }));
    const p = await newPlayer();
    const { res, crash, clientSeed } = await startWith(p.id, (c) => c >= 120 && c < 400);
    expect(res.round.fairness.beacon).toBe(beacon);
    const out = await cashOut(p.id, res.round.id, after(msToReach(crash)));
    const seed = out.round.fairness.serverSeed!;
    expect(crashFromDigest(roundDigest(seed, clientSeed, res.round.fairness.nonce, "run", beacon))).toBe(out.round.crashMult);
    // Without the beacon it's a different digest altogether.
    expect(Buffer.from(roundDigest(seed, clientSeed, 0, "run", beacon)).toString("hex")).not.toBe(Buffer.from(roundDigest(seed, clientSeed, 0, "run")).toString("hex"));
  });

  it("works out his speed from settled work on-chain", () => {
    const w = wheelFromReadings({ work: 11_600n, height: 1140n, hash: "0xabc", number: 200n }, { work: 11_000n }, 100n);
    expect(w).toMatchObject({ available: true, running: true, recentWork: 600, rpm: 30, blockHeight: 1140, beacon: "0xabc", windowMinutes: 20 });
    const quiet = wheelFromReadings({ work: 11_000n, height: 1140n, hash: "0xabc", number: 200n }, { work: 11_000n }, 100n);
    expect(quiet).toMatchObject({ running: false, rpm: 0, recentWork: 0 });
    // A few passes still count as running.
    expect(wheelFromReadings({ work: 3n, height: 1n, hash: "0x", number: 2n }, { work: 0n }, 100n).rpm).toBe(1);
  });

  it("reads the official status format in the browser, and treats a stale or simulated wheel as not running", () => {
    const base = {
      measurement: { freshness: "online", provenance: "hardware", rpmMilli: 77005 },
      builder: { projected: { blockHeight: "2394", blockProgress: "130983659" } },
    };
    const w = parseRealTime(base)!;
    expect(w).toMatchObject({ running: true, rpm: 77, blockHeight: 2394 });
    expect(w.blockProgress).toBeCloseTo(0.131, 3);
    expect(parseRealTime({ ...base, measurement: { ...base.measurement, freshness: "stale" } })!.running).toBe(false);
    expect(parseRealTime({ ...base, measurement: { ...base.measurement, provenance: "simulated" } })!.running).toBe(false);
    expect(parseRealTime({})).toBeNull();
  });

  it("runVerdict never pays at or beyond the stop for a manual press", () => {
    const round = { crashMult: 241, autoCashout: null, liftoffAt: new Date(0) };
    const stop = msToReach(241);
    expect(runVerdict(round, stop - 1, true)).toMatchObject({ kind: "won" });
    const v = runVerdict(round, stop - 1, true) as { mult: number };
    expect(v.mult).toBeLessThan(241);
    expect(runVerdict(round, stop, true)).toMatchObject({ kind: "lost" });
    expect(runVerdict(round, stop + 5000, true)).toMatchObject({ kind: "lost" });
  });
});
