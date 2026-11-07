import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { playDrop } from "@/server/drops";
import { leaderboard, weekStart } from "@/server/leaderboards";
import { cashOut, startRun } from "@/server/run";
import { adminStats } from "@/server/admin";
import { claimDaily, claimRefill, createPlayer, history, playerState, publicProfile, sharedRound, updateProfile } from "@/server/players";
import { checkAdminPassword, readToken, signToken } from "@/server/session";
import { challengesForDay, dayKey, levelFromXp, REFILL_COOLDOWN_MS, xpForLevel } from "@/shared/game-rules";
import { crashFromDigest, msToReach, RUN_COUNTDOWN_MS } from "@/shared/run-curve";
import { roundDigest } from "@/shared/fairness";
import { setLiveWheelForTests, NO_READING } from "@/server/squeekchain";
import { balanceOf, key, ledgerSum, newPlayer, resetDb } from "./helpers";

setLiveWheelForTests(() => NO_READING);

const T0 = Date.UTC(2027, 0, 4, 12);

async function winRun(userId: string, atMult: number, now = T0) {
  const seed = await db.fairnessSeed.findFirstOrThrow({ where: { userId, status: "COMMITTED" } });
  let clientSeed = "";
  for (let i = 0; i < 200_000; i++) {
    clientSeed = `s${i}`;
    if (crashFromDigest(roundDigest(seed.serverSeed, clientSeed, seed.nonce, "run")) > atMult + 5) break;
  }
  const { round } = await startRun(userId, { stake: 10, clientSeed, commitHash: seed.hash, requestKey: key() }, now);
  return cashOut(userId, round.id, now + RUN_COUNTDOWN_MS + msToReach(atMult));
}

describe("demo credits", () => {
  beforeEach(resetDb);

  it("new players start with today's 10,000, recorded", async () => {
    const p = await newPlayer();
    expect(await balanceOf(p.id)).toBe(10_000);
    await expect(claimDaily(p.id)).rejects.toMatchObject({ code: "daily_claimed" });
    const txs = await db.demoTransaction.findMany({ where: { userId: p.id } });
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("GRANT");
  });

  it("10,000 points a day, once a day, even when tapped twice at once", async () => {
    const p = await newPlayer();
    const results = await Promise.allSettled([claimDaily(p.id, T0), claimDaily(p.id, T0), claimDaily(p.id, T0)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balanceOf(p.id)).toBe(20_000);
    await claimDaily(p.id, T0 + 86_400_000);
    expect(await balanceOf(p.id)).toBe(30_000);
  });

  it("refills only below the line, with a cooldown and a daily limit", async () => {
    const p = await newPlayer();
    await expect(claimRefill(p.id, T0)).rejects.toMatchObject({ code: "refill_not_needed" });
    await db.demoBalance.update({ where: { userId: p.id }, data: { amount: 3 } });
    const r = await claimRefill(p.id, T0);
    expect(r.granted).toBe(997);
    expect(await balanceOf(p.id)).toBe(1000);
    await db.demoBalance.update({ where: { userId: p.id }, data: { amount: 0 } });
    await expect(claimRefill(p.id, T0 + 1000)).rejects.toMatchObject({ code: "refill_cooldown" });
    await claimRefill(p.id, T0 + REFILL_COOLDOWN_MS);
    await db.demoBalance.update({ where: { userId: p.id }, data: { amount: 0 } });
    await claimRefill(p.id, T0 + 2 * REFILL_COOLDOWN_MS);
    await db.demoBalance.update({ where: { userId: p.id }, data: { amount: 0 } });
    await expect(claimRefill(p.id, T0 + 3 * REFILL_COOLDOWN_MS)).rejects.toMatchObject({ code: "refill_limit" });
    await claimRefill(p.id, T0 + 86_400_000);
    expect(await balanceOf(p.id)).toBe(1000);
  });

  it("guests from one address are limited per hour", async () => {
    for (let i = 0; i < 20; i++) await createPlayer("same-ip");
    await expect(createPlayer("same-ip")).rejects.toMatchObject({ code: "too_many_players" });
    await expect(createPlayer("other-ip")).resolves.toBeTruthy();
  });
});

describe("progression", () => {
  beforeEach(resetDb);

  it("achievements come from play and only once", async () => {
    const p = await newPlayer();
    const first = await winRun(p.id, 150);
    expect(first.unlocked.map((u) => u.key).sort()).toEqual(["first_cashout", "first_run"]);
    const second = await winRun(p.id, 150, T0 + 100_000);
    expect(second.unlocked).toEqual([]);
    const big = await winRun(p.id, 520, T0 + 200_000);
    expect(big.unlocked.map((u) => u.key)).toContain("wheel_survivor");
    const state = await playerState(p.id, T0 + 300_000);
    expect(state.achievements.map((a) => a.key)).toContain("wheel_survivor");
  });

  it("nobody starts with an achievement or a best", async () => {
    const p = await newPlayer();
    const s = await playerState(p.id);
    expect(s.achievements).toEqual([]);
    expect(s.stats.bestRunMult).toBe(0);
    expect(s.xp).toBe(0);
  });

  it("XP is recorded, adds up, and doesn't depend on stake", async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const c1 = await playDrop(a.id, { stake: 1, chute: 0, clientSeed: "same", commitHash: a.commit, requestKey: key() }, T0);
    const c2 = await playDrop(b.id, { stake: 5000, chute: 0, clientSeed: "same", commitHash: b.commit, requestKey: key() }, T0);
    expect(c1.xpGained).toBeGreaterThan(0);
    expect(c2.xpGained).toBeGreaterThan(0);
    const xp = await db.xpTransaction.aggregate({ where: { userId: a.id }, _sum: { amount: true } });
    expect(xp._sum.amount).toBe((await db.playerProfile.findUniqueOrThrow({ where: { userId: a.id } })).xp);
  });

  it("the daily ceiling stops idle farming", async () => {
    const p = await newPlayer();
    await db.playerProfile.update({ where: { userId: p.id }, data: { playXpDay: dayKey(T0), playXpToday: 400, dropsPlayed: 1, runsPlayed: 1, cashouts: 1, lastPlayedDay: dayKey(T0) } });
    await db.playerAchievement.createMany({ data: [] });
    const r = await playDrop(p.id, { stake: 1, chute: 0, clientSeed: "x", commitHash: p.commit, requestKey: key() }, T0);
    const fromGame = await db.xpTransaction.count({ where: { userId: p.id, source: "GAME" } });
    expect(fromGame).toBe(0);
    expect(r.round.status).not.toBe("ACTIVE");
  });

  it("levels follow the XP curve", () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(xpForLevel(2) - 1).level).toBe(1);
    expect(levelFromXp(xpForLevel(2)).level).toBe(2);
    expect(levelFromXp(xpForLevel(9)).level).toBe(9);
  });

  it("daily challenges: three, stable per day, varied across days", () => {
    const d = challengesForDay("2027-01-04");
    expect(d).toHaveLength(3);
    expect(new Set(d.map((c) => c.key)).size).toBe(3);
    expect(challengesForDay("2027-01-04").map((c) => c.key)).toEqual(d.map((c) => c.key));
    const all = new Set<string>();
    for (let i = 1; i < 28; i++) challengesForDay(`2027-02-${String(i).padStart(2, "0")}`).forEach((c) => all.add(c.key));
    expect(all.size).toBeGreaterThan(5);
  });

  it("locked cosmetics can't be claimed, and names are unique ignoring case", async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    await expect(updateProfile(a.id, { cosmetic: "ivory" })).rejects.toMatchObject({ code: "cosmetic_locked" });
    await updateProfile(a.id, { username: "Hammy" });
    await expect(updateProfile(b.id, { username: "hammy" })).rejects.toMatchObject({ code: "name_taken" });
    await expect(updateProfile(b.id, { username: "Squeektoshi" })).rejects.toMatchObject({ code: "name_reserved" });
    await expect(updateProfile(b.id, { avatar: "squeek:5" })).rejects.toMatchObject({ code: "wallet_required" });
    await updateProfile(b.id, { avatar: "hamster:dusk" });
    expect((await playerState(b.id)).avatar).toBe("hamster:dusk");
  });
});

describe("community", () => {
  beforeEach(resetDb);

  it("an empty arcade has empty boards: nothing is made up", async () => {
    for (const board of ["run", "drops", "games", "xp"] as const) {
      expect((await leaderboard(board, "all", null)).entries).toEqual([]);
      expect((await leaderboard(board, "week", null)).entries).toEqual([]);
    }
  });

  it("boards rank recorded play, marking you", async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    await winRun(a.id, 300, Date.now() - 60_000);
    await winRun(b.id, 150, Date.now() - 60_000);
    const week = await leaderboard("run", "week", b.id);
    expect(week.entries.map((e) => e.value)).toEqual([300, 150]);
    expect(week.entries[1].isMe).toBe(true);
    const all = await leaderboard("games", "all", null);
    expect(all.entries).toHaveLength(2);
  });

  it("weekly boards forget last week", async () => {
    const a = await newPlayer();
    await winRun(a.id, 300, weekStart().getTime() - 3600_000);
    expect((await leaderboard("run", "week", null)).entries).toEqual([]);
    expect((await leaderboard("run", "all", null)).entries).toHaveLength(1);
  });

  it("losses don't set a best multiplier", async () => {
    const p = await newPlayer();
    const seed = await db.fairnessSeed.findFirstOrThrow({ where: { userId: p.id, status: "COMMITTED" } });
    const stop = crashFromDigest(roundDigest(seed.serverSeed, "x", seed.nonce, "run"));
    const { round } = await startRun(p.id, { stake: 10, clientSeed: "x", commitHash: seed.hash, requestKey: key() }, T0);
    await cashOut(p.id, round.id, T0 + RUN_COUNTDOWN_MS + msToReach(stop));
    const prof = await db.playerProfile.findUniqueOrThrow({ where: { userId: p.id } });
    expect(prof.bestRunMult).toBe(0);
    expect(prof.losses).toBe(1);
  });

  it("shares only show settled rounds, and public views leak nothing private", async () => {
    const p = await newPlayer();
    const seed = await db.fairnessSeed.findFirstOrThrow({ where: { userId: p.id, status: "COMMITTED" } });
    const { round } = await startRun(p.id, { stake: 10, clientSeed: "x", commitHash: seed.hash, requestKey: key() }, T0);
    expect(await sharedRound(round.shareId)).toBeNull();
    const profile = await db.playerProfile.findUniqueOrThrow({ where: { userId: p.id } });
    const pub = await publicProfile(profile.shareId);
    expect(JSON.stringify(pub)).not.toMatch(/balance|ipHash/);
  });

  it("history lists finished rounds only, newest first, per player", async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    await winRun(a.id, 150, T0);
    await winRun(a.id, 160, T0 + 100_000);
    await winRun(b.id, 170, T0);
    const h = await history(a.id, {});
    expect(h.rounds.map((r) => r.resultMult)).toEqual([160, 150]);
    expect(await ledgerSum(a.id)).toBe(await balanceOf(a.id));
  });
});

describe("admin and sessions", () => {
  beforeEach(resetDb);

  it("tokens reject tampering, other purposes, and expiry", () => {
    const t = signToken("session", "u1", Date.now() + 1000);
    expect(readToken("session", t)).toBe("u1");
    expect(readToken("admin", t)).toBeNull();
    expect(readToken("session", t.replace("u1", "u2"))).toBeNull();
    expect(readToken("session", signToken("session", "u1", Date.now() - 1))).toBeNull();
    expect(readToken("session", undefined)).toBeNull();
  });

  it("admin password compares safely", () => {
    expect(checkAdminPassword("test-admin-password")).toBe(true);
    expect(checkAdminPassword("nope")).toBe(false);
  });

  it("stats report real numbers and no seeds", async () => {
    const p = await newPlayer();
    await winRun(p.id, 200);
    const s = await adminStats();
    expect(s.players).toBe(1);
    expect(s.run.played).toBe(1);
    expect(s.run.staked).toBe(10);
    expect(s.credits.welcome).toBe(10_000);
    expect(JSON.stringify(s)).not.toMatch(/serverSeed|ipHash/);
  });
});
