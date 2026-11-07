import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Golden results computed by the server's runtime (Node, V8). Every browser engine must reproduce them.
const golden = JSON.parse(readFileSync("e2e/determinism-golden.json", "utf8")) as { digest: string; chute: number; balls: number; slots: number[]; catchFrames: number[]; hash: string }[];

test("this browser's physics matches the server's, frame for frame", async ({ page }) => {
  await page.goto("/fairness");
  await page.waitForFunction(() => "__arcadeSim" in window, null, { timeout: 60_000 });
  const results = await page.evaluate(async (cases) => {
    const w = window as unknown as { __arcadeSim?: (d: string, c: number, n: number) => Promise<{ slots: number[]; catchFrames: number[]; hash: string }> };
    if (!w.__arcadeSim) throw new Error("__arcadeSim missing");
    const out = [];
    for (const c of cases) out.push(await w.__arcadeSim(c.digest, c.chute, c.balls));
    return out;
  }, golden);
  results.forEach((r, i) => {
    expect(r).toEqual({ slots: golden[i].slots, catchFrames: golden[i].catchFrames, hash: golden[i].hash });
  });
});
