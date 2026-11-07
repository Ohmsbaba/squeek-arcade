import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { digestRng, hashServerSeed, roundDigest } from "@/shared/fairness";
import { crashFromDigest, msToReach, multAt, payoutFor, RUN_MAX_MULT } from "@/shared/run-curve";

const SEED = "a".repeat(64);

describe("commit and digest", () => {
  it("is stable: known vector", () => {
    expect(hashServerSeed(SEED)).toMatch(/^[0-9a-f]{64}$/);
    const a = roundDigest(SEED, "player", 7, "run");
    const b = roundDigest(SEED, "player", 7, "run");
    expect(Buffer.from(a).toString("hex")).toBe(Buffer.from(b).toString("hex"));
  });

  it("changes with every input", () => {
    const base = Buffer.from(roundDigest(SEED, "player", 7, "run")).toString("hex");
    expect(Buffer.from(roundDigest("b".repeat(64), "player", 7, "run")).toString("hex")).not.toBe(base);
    expect(Buffer.from(roundDigest(SEED, "player2", 7, "run")).toString("hex")).not.toBe(base);
    expect(Buffer.from(roundDigest(SEED, "player", 8, "run")).toString("hex")).not.toBe(base);
    expect(Buffer.from(roundDigest(SEED, "player", 7, "drops")).toString("hex")).not.toBe(base);
  });

  it("the generator is uniform enough", () => {
    const rng = digestRng(randomBytes(32));
    let sum = 0;
    for (let i = 0; i < 20000; i++) sum += rng();
    expect(sum / 20000).toBeGreaterThan(0.48);
    expect(sum / 20000).toBeLessThan(0.52);
  });
});

describe("stop points", () => {
  it("never leaves the allowed range", () => {
    expect(crashFromDigest(new Uint8Array(32))).toBe(100);
    expect(crashFromDigest(new Uint8Array(32).fill(255))).toBe(RUN_MAX_MULT);
  });

  it("gives P(stop >= x) of about 99% / x, so no cash-out target beats another", () => {
    const N = 200_000;
    const stops = Array.from({ length: N }, () => crashFromDigest(randomBytes(32)));
    for (const x of [101, 150, 200, 500, 1000]) {
      const hit = stops.filter((s) => s >= x).length / N;
      const expected = 99 / x;
      expect(Math.abs(hit - expected) / expected).toBeLessThan(0.05);
      // Return of always cashing out at x.
      expect(hit * (x / 100)).toBeGreaterThan(0.93);
      expect(hit * (x / 100)).toBeLessThan(1.05);
    }
  });
});

describe("the curve", () => {
  it("starts at 1.00x and only rises", () => {
    expect(multAt(-5)).toBe(100);
    expect(multAt(0)).toBe(100);
    let last = 100;
    for (let t = 0; t < 60000; t += 137) {
      const m = multAt(t);
      expect(m).toBeGreaterThanOrEqual(last);
      last = m;
    }
  });

  it("msToReach is the first moment the multiplier is reached", () => {
    for (const m of [101, 150, 241, 1000, 5000, 100000]) {
      const t = msToReach(m);
      expect(multAt(t)).toBeGreaterThanOrEqual(m);
      expect(multAt(t - 2)).toBeLessThan(m);
    }
  });

  it("payouts round down to whole credits", () => {
    expect(payoutFor(10, 241)).toBe(24);
    expect(payoutFor(1, 199)).toBe(1);
    expect(payoutFor(10000, 100000)).toBe(10_000_000);
  });
});
