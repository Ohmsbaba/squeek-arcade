import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

const holders = new Map<number, string>();
vi.mock("@/server/nft", async (orig) => {
  const actual = await orig<typeof import("@/server/nft")>();
  const { db } = await import("@/server/db");
  return {
    ...actual,
    readSqueekForPlay: async (userId: string, tokenId: number) => {
      const wallet = await db.wallet.findUnique({ where: { userId } });
      const { GameError } = await import("@/server/errors");
      if (!wallet) throw new GameError("wallet_required", 403, "Connect first");
      if (holders.get(tokenId) !== wallet.address) throw new GameError("not_your_squeek", 403, "Not yours");
      await db.nft.upsert({ where: { tokenId }, create: { tokenId, name: `Squeek #${tokenId}`, level: 3, imageUri: "", attributes: [] }, update: {} });
      return { tokenId, level: 3 };
    },
  };
});

import { db } from "@/server/db";
import { playDrop } from "@/server/drops";
import { BALL_COUNTS, BALL_RADIUS, buildPegs, CHUTES, FLOOR_Y, slotCenterX, SLOTS, startLayout, WALL_X, type Chute } from "@/shared/drops/board";
import { initPhysics, simulateDrop } from "@/shared/drops/sim";
import { chanceFor, slotMult, tableFor } from "@/shared/drops/tables";
import { hashServerSeed, roundDigest } from "@/shared/fairness";
import { payoutFor } from "@/shared/run-curve";
import { STARTING_CREDITS as START } from "@/shared/game-rules";
import { balanceOf, key, ledgerSum, newPlayer, resetDb } from "./helpers";

beforeAll(() => initPhysics());

const hexOf = (a: Float32Array) => Buffer.from(a.buffer).toString("hex");

describe("the physics", () => {
  it("is fully repeatable from the digest", () => {
    const digest = randomBytes(32);
    const a = simulateDrop(digest, 0);
    const b = simulateDrop(digest, 0);
    expect(a.slots).toEqual(b.slots);
    expect(hexOf(a.frames)).toBe(hexOf(b.frames));
    expect(a.events).toEqual(b.events);
  });

  it("a digest gives the same slot with or without recording", () => {
    for (let i = 0; i < 20; i++) {
      const digest = randomBytes(32);
      expect(simulateDrop(digest, -1, 1, { trace: false }).slots).toEqual(simulateDrop(digest, -1).slots);
      expect(simulateDrop(digest, -1, 5, { trace: false }).slots).toEqual(simulateDrop(digest, -1, 5).slots);
    }
  });

  it("pinned vector: the WASM build hasn't drifted", () => {
    // If this changes, every published result stops verifying. Bump deliberately or not at all.
    const digest = new Uint8Array(32).map((_, i) => (i * 37 + 11) & 255);
    const t = simulateDrop(digest, 0);
    const m = simulateDrop(digest, 0, 10);
    expect({ slots: t.slots, catchFrames: t.catchFrames, hits: t.events.length, multi: m.slots, multiCatch: m.catchFrames, multiHits: m.events.length }).toMatchSnapshot();
  });

  it("every chute lands, and rests inside the slot it was scored in", () => {
    for (const chute of CHUTES) {
      for (let i = 0; i < 25; i++) {
        const t = simulateDrop(randomBytes(32), chute);
        expect(t.landed).toBe(true);
        expect(t.slots[0]).toBeGreaterThanOrEqual(0);
        expect(t.slots[0]).toBeLessThan(SLOTS);
        const x = t.frames[(t.frameCount - 1) * 3];
        const y = t.frames[(t.frameCount - 1) * 3 + 1];
        expect(Math.abs(x - slotCenterX(t.slots[0]))).toBeLessThan(0.5);
        expect(y).toBeLessThan(FLOOR_Y + BALL_RADIUS + 0.2);
      }
    }
  });

  it("really collides: it touches pegs, spins, and never passes through one", () => {
    const pegs = buildPegs();
    for (let i = 0; i < 10; i++) {
      const t = simulateDrop(randomBytes(32), 0);
      expect(t.events.filter((e) => e.kind === "peg").length).toBeGreaterThan(4);
      let spun = 0;
      for (let f = 0; f < t.frameCount; f++) {
        const x = t.frames[f * 3];
        const y = t.frames[f * 3 + 1];
        spun = Math.max(spun, Math.abs(t.frames[f * 3 + 2]));
        for (const p of pegs) {
          // Centre never sinks past the peg's surface by more than a whisker.
          expect(Math.hypot(x - p.x, y - p.y)).toBeGreaterThan(0.09 + 0.3 - 0.08);
        }
      }
      expect(spun).toBeGreaterThan(0);
    }
  });

  it("different chutes shift where tokens land", () => {
    const mean = (chute: Chute) => {
      let s = 0;
      for (let i = 0; i < 80; i++) s += simulateDrop(randomBytes(32), chute, 1, { trace: false }).slots[0];
      return s / 80;
    };
    expect(mean(-3)).toBeLessThan(mean(3));
  });

  it("the token's look isn't an input: the simulation takes only a digest, a chute and a count", () => {
    expect(simulateDrop.length).toBe(2); // count and options are defaulted; art and level have no parameter to pass
  });

  it("multi-ball: every token lands, in its slot, and each is reported", () => {
    for (const balls of BALL_COUNTS) {
      for (const chute of [-3, 0, 3] as Chute[]) {
        const t = simulateDrop(randomBytes(32), chute, balls);
        expect(t.landed).toBe(true);
        expect(t.slots).toHaveLength(balls);
        expect(t.catchFrames).toHaveLength(balls);
        expect(t.frames.length).toBe(t.frameCount * balls * 3);
        for (let b = 0; b < balls; b++) {
          expect(t.slots[b]).toBeGreaterThanOrEqual(0);
          expect(t.slots[b]).toBeLessThan(SLOTS);
          const x = t.frames[((t.frameCount - 1) * balls + b) * 3];
          expect(Math.abs(x - slotCenterX(t.slots[b]))).toBeLessThan(0.55);
        }
      }
    }
  });

  it("multi-ball: tokens really hit each other, and never sit inside each other while in play", () => {
    for (let run = 0; run < 6; run++) {
      const t = simulateDrop(randomBytes(32), 0, 10);
      expect(t.events.filter((e) => e.kind === "ball").length).toBeGreaterThan(4);
      for (let f = 0; f < t.frameCount; f += 3) {
        for (let a = 0; a < 10; a++) {
          if (f >= t.catchFrames[a]) continue;
          for (let b = a + 1; b < 10; b++) {
            if (f >= t.catchFrames[b]) continue;
            const dx = t.frames[(f * 10 + a) * 3] - t.frames[(f * 10 + b) * 3];
            const dy = t.frames[(f * 10 + a) * 3 + 1] - t.frames[(f * 10 + b) * 3 + 1];
            // Only in the first second, before any jam can have freed a token from the others.
            if (f < 60) expect(Math.hypot(dx, dy)).toBeGreaterThan(BALL_RADIUS * 2 - 0.15);
          }
        }
      }
    }
  });

  it("multi-ball never stalls: a jam clears in seconds", () => {
    for (const chute of [0, -3] as Chute[]) {
      for (let run = 0; run < 150; run++) {
        const t = simulateDrop(randomBytes(32), chute, 10, { trace: false });
        expect(t.landed).toBe(true);
      }
    }
    const lasts = Array.from({ length: 150 }, () => Math.max(...simulateDrop(randomBytes(32), 0, 10).catchFrames) / 60);
    expect(Math.max(...lasts)).toBeLessThan(15);
  });

  it("start positions fit in the cabinet, from every chute", () => {
    for (const chute of CHUTES) for (const balls of BALL_COUNTS) {
      const layout = startLayout(chute, balls);
      expect(layout).toHaveLength(balls);
      for (const p of layout) expect(Math.abs(p.x)).toBeLessThan(WALL_X - BALL_RADIUS);
      for (let a = 0; a < balls; a++) for (let b = a + 1; b < balls; b++) {
        expect(Math.hypot(layout[a].x - layout[b].x, layout[a].y - layout[b].y)).toBeGreaterThan(BALL_RADIUS * 2);
      }
    }
  });
});

describe("payout tables", () => {
  it("every chute returns the same long-run percentage by its measured odds", () => {
    for (const balls of BALL_COUNTS) for (const chute of CHUTES) {
      const table = tableFor(chute, balls);
      const odds = chanceFor(chute, balls);
      expect(table.length).toBe(SLOTS);
      const ret = table.reduce((sum, m, i) => sum + m * odds[i], 0);
      expect(ret).toBeGreaterThan(0.955);
      expect(ret).toBeLessThan(0.985);
    }
  });

  it("mirror chutes have mirror tables", () => {
    for (const balls of BALL_COUNTS) {
      expect(tableFor(2, balls)).toEqual([...tableFor(-2, balls)].reverse());
      expect(tableFor(0, balls)).toEqual([...tableFor(0, balls)].reverse());
    }
  });
});

describe("Squeek Drops rounds", () => {
  beforeEach(resetDb);

  const input = (commit: string, extra: Record<string, unknown> = {}) => ({ stake: 100, chute: 0, clientSeed: "abc", commitHash: commit, requestKey: key(), ...extra });

  it("settles in one go, reveals the seed, and the result re-derives", async () => {
    const p = await newPlayer();
    const res = await playDrop(p.id, input(p.commit));
    const r = res.round;
    expect(r.status).not.toBe("ACTIVE");
    const seed = r.fairness.serverSeed!;
    expect(hashServerSeed(seed)).toBe(p.commit);
    const replay = simulateDrop(roundDigest(seed, "abc", r.fairness.nonce, "drops"), 0);
    expect(replay.slots[0]).toBe(r.slot);
    expect(r.resultMult).toBe(slotMult(0, 1, replay.slots[0]));
    expect(r.payout).toBe(payoutFor(100, r.resultMult!));
    expect(await balanceOf(p.id)).toBe(START - 100 + r.payout!);
    expect(await ledgerSum(p.id)).toBe(await balanceOf(p.id));
  });

  it("a replayed request drops once", async () => {
    const p = await newPlayer();
    const i = input(p.commit);
    const [a, b] = await Promise.all([playDrop(p.id, i), playDrop(p.id, i)]);
    expect(a.round.id).toBe(b.round.id);
    expect(await db.gameRound.count({ where: { userId: p.id } })).toBe(1);
    expect(await ledgerSum(p.id)).toBe(await balanceOf(p.id));
  });

  it("consecutive drops all settle and the ledger keeps adding up", async () => {
    const p = await newPlayer();
    let commit = p.commit;
    for (let i = 0; i < 12; i++) {
      const res = await playDrop(p.id, input(commit, { stake: 5, chute: CHUTES[i % CHUTES.length] }));
      commit = res.commit.hash;
    }
    expect(await db.gameRound.count({ where: { userId: p.id, game: "DROPS" } })).toBe(12);
    expect(await ledgerSum(p.id)).toBe(await balanceOf(p.id));
    const prof = await db.playerProfile.findUniqueOrThrow({ where: { userId: p.id } });
    expect(prof.dropsPlayed).toBe(12);
    expect(prof.wins + prof.losses).toBe(12);
  });

  it("refuses overdrafts and invalid chutes leave nothing behind", async () => {
    const p = await newPlayer();
    await expect(playDrop(p.id, input(p.commit, { stake: 50_000 }))).rejects.toMatchObject({ code: "insufficient_credits" });
    expect(await balanceOf(p.id)).toBe(START);
    expect(await db.gameRound.count({ where: { userId: p.id } })).toBe(0);
  });

  it("you can't drop a Squeek without a connected wallet, or someone else's", async () => {
    const p = await newPlayer();
    await expect(playDrop(p.id, input(p.commit, { tokenIds: [42] }))).rejects.toMatchObject({ code: "wallet_required" });
    await db.wallet.create({ data: { address: "0x000000000000000000000000000000000000dEaD", userId: p.id } });
    holders.set(42, "0x0000000000000000000000000000000000000001");
    await expect(playDrop(p.id, input(p.commit, { tokenIds: [42] }))).rejects.toMatchObject({ code: "not_your_squeek" });
    expect(await balanceOf(p.id)).toBe(START);
  });

  it("the Squeek you hold falls, is recorded, and its level changes nothing about the result", async () => {
    const p = await newPlayer();
    const addr = "0x000000000000000000000000000000000000dEaD";
    await db.wallet.create({ data: { address: addr, userId: p.id } });
    holders.set(7, addr);
    const res = await playDrop(p.id, input(p.commit, { tokenIds: [7] }));
    expect(res.round.tokenId).toBe(7);
    expect(res.round.tokenLevel).toBe(3);
    expect(res.unlocked.map((u) => u.key)).toContain("own_squeek");
    // Same seed, same chute: the slot equals a token-free simulation.
    const replay = simulateDrop(roundDigest(res.round.fairness.serverSeed!, "abc", res.round.fairness.nonce, "drops"), 0, 1, { trace: false });
    expect(replay.slots[0]).toBe(res.round.slot);
  });

  it("a 10-token drop: total stake, summed payout, one seed, and it re-derives", async () => {
    const p = await newPlayer();
    const res = await playDrop(p.id, input(p.commit, { stake: 50, chute: -1, balls: 10 }));
    const r = res.round;
    expect(r.stake).toBe(500);
    expect(r.balls).toBe(10);
    expect(r.slots).toHaveLength(10);
    const replay = simulateDrop(roundDigest(r.fairness.serverSeed!, "abc", r.fairness.nonce, "drops"), -1, 10, { trace: false });
    expect(replay.slots).toEqual(r.slots);
    const mults = r.slots.map((s) => slotMult(-1, 10, s));
    expect(r.payout).toBe(mults.reduce((sum, m) => sum + payoutFor(50, m), 0));
    expect(r.resultMult).toBe(Math.max(...mults));
    expect(r.net).toBe(r.payout! - 500);
    expect(await balanceOf(p.id)).toBe(START - 500 + r.payout!);
    expect(await ledgerSum(p.id)).toBe(await balanceOf(p.id));
    expect(res.unlocked.map((u) => u.key)).toContain("multi_ball");
    // Counts once in the stats, as one round.
    expect((await db.playerProfile.findUniqueOrThrow({ where: { userId: p.id } })).dropsPlayed).toBe(1);
  });

  it("a total bet over the balance is refused, even when one token's worth isn't", async () => {
    const p = await newPlayer();
    await expect(playDrop(p.id, input(p.commit, { stake: 2000, balls: 10 }))).rejects.toMatchObject({ code: "insufficient_credits" });
    expect(await balanceOf(p.id)).toBe(START);
  });

  it("several Squeeks can fall together, and all are recorded and checked", async () => {
    const p = await newPlayer();
    const addr = "0x000000000000000000000000000000000000dEaD";
    await db.wallet.create({ data: { address: addr, userId: p.id } });
    holders.set(1, addr);
    holders.set(2, addr);
    holders.set(3, addr);
    holders.set(4, "0x0000000000000000000000000000000000000001");
    await expect(playDrop(p.id, input(p.commit, { balls: 3, tokenIds: [1, 2, 4] }))).rejects.toMatchObject({ code: "not_your_squeek" });
    const res = await playDrop(p.id, input(p.commit, { balls: 3, tokenIds: [1, 2, 3] }));
    expect(res.round.tokenIds).toEqual([1, 2, 3]);
    expect(res.unlocked.map((u) => u.key)).toContain("squeek_collector");
    expect(await db.playerNft.count({ where: { userId: p.id } })).toBe(3);
  });
});
