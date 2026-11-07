import { expect, test } from "@playwright/test";
import { balance, ready, watchErrors } from "./helpers";

const multText = (page: import("@playwright/test").Page) => page.getByTestId("multiplier-text").first();
const readMult = async (page: import("@playwright/test").Page) => parseFloat((await multText(page).textContent()) ?? "0");

test.beforeEach(async ({ page }) => {
  await page.goto("/run");
  await ready(page);
});

test("cash out before the stop: paid by the server, shown everywhere", async ({ page }) => {
  const errors = watchErrors(page);
  // A stop within seconds is common, so try until one round is caught still running.
  for (let attempt = 0; attempt < 12; attempt++) {
    const before = await balance(page);
    const started = page.waitForResponse((r) => r.url().includes("/api/run/start"));
    await page.getByTestId("start-run").click();
    await started;
    const cash = page.getByTestId("cash-out");
    const result = page.getByTestId("round-result");
    await expect(cash.or(result)).toBeVisible({ timeout: 15_000 });
    if (await cash.isVisible()) {
      const [res] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/cashout"), { timeout: 6_000 }),
        // The button goes the moment the wheel stops, so don't wait around for it.
        cash.click({ timeout: 3_000 }).catch(() => {}),
      ]).catch(() => [null]);
      await expect(result).toBeVisible();
      if (res && (await result.textContent())!.includes("Cashed out")) {
        const body = await res.json();
        expect(body.round.status).toBe("WON");
        expect(body.round.payout).toBeGreaterThanOrEqual(body.round.stake);
        await expect.poll(() => balance(page)).toBe(before - body.round.stake + body.round.payout);
        await expect(page.getByTestId("run-history-row").first()).toContainText("Cashed");
        expect(errors).toEqual([]);
        return;
      }
    }
    await expect(page.getByTestId("start-run")).toBeEnabled();
  }
  throw new Error("12 rounds in a row stopped before a click landed");
});

test("the wheel stopping first loses the stake, and the next round starts at once", async ({ page }) => {
  const before = await balance(page);
  await page.getByTestId("start-run").click();
  const result = page.getByTestId("round-result");
  await expect(result).toBeVisible({ timeout: 80_000 });
  await expect(result).toContainText("Wheel stopped at");
  await expect(result).toContainText("snack");
  await expect.poll(() => balance(page)).toBe(before - 100);
  await expect(page.getByTestId("start-run")).toHaveText("Run again");
  await page.getByTestId("start-run").click();
  await expect(page.getByTestId("cash-out").or(page.getByTestId("round-result"))).toBeVisible({ timeout: 15_000 });
});

test("auto cash-out fires on the server at its target", async ({ page }) => {
  await page.getByTestId("auto-toggle").click();
  await page.getByTestId("auto-value").fill("1.05");
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.getByTestId("start-run").click();
    const result = page.getByTestId("round-result");
    await expect(result).toBeVisible({ timeout: 20_000 });
    const text = (await result.textContent())!;
    if (text.includes("Cashed out")) {
      expect(text).toContain("1.05x");
      return;
    }
    await expect(page.getByTestId("start-run")).toBeEnabled();
  }
  throw new Error("10 rounds in a row stopped before 1.05x");
});

test("refreshing mid-round picks the same round back up", async ({ page }) => {
  let id: string | null = null;
  for (let attempt = 0; attempt < 10 && !id; attempt++) {
    const started = page.waitForResponse((r) => r.url().includes("/api/run/start"));
    await page.getByTestId("start-run").click();
    const res = await (await started).json();
    id = res.round.id;
    await page.reload();
    await ready(page);
    const active = await page.request.get("/api/run/active").then((r) => r.json());
    if (active.active?.id === id) {
      expect(active.active.crashMult).toBeNull();
      expect(active.active.fairness.serverSeed).toBeNull();
      await expect(page.getByTestId("cash-out").or(page.getByRole("button", { name: "Get ready" })).or(page.getByTestId("round-result"))).toBeVisible();
      await expect(page.getByTestId("round-result")).toBeVisible({ timeout: 80_000 });
      return;
    }
    id = null;
    await expect(page.getByTestId("start-run")).toBeEnabled();
  }
  throw new Error("Couldn't catch a round in flight");
});

test("going offline mid-round: the round carries on and reports back", async ({ page, context }) => {
  await page.getByTestId("auto-toggle").click();
  await page.getByTestId("auto-value").fill("1.20");
  const started = page.waitForResponse((r) => r.url().includes("/api/run/start"));
  await page.getByTestId("start-run").click();
  const { round } = await (await started).json();
  await context.setOffline(true);
  await page.waitForTimeout(6000);
  await context.setOffline(false);
  await expect(page.getByTestId("round-result")).toBeVisible({ timeout: 30_000 });
  const state = await page.request.get(`/api/run/${round.id}`).then((r) => r.json());
  expect(state.finished).toBe(true);
  expect(state.round.status === "LOST" || state.round.resultMult === 120).toBe(true);
});

test("the live panel shows the real wheel, and the server decides the bonus", async ({ page }) => {
  await expect(page.getByTestId("live-panel")).toBeVisible();
  await expect(page.getByTestId("live-status")).toContainText(/real Squeektoshi/, { timeout: 15_000 });
  await expect(page.getByTestId("live-terms")).toContainText(/on-chain|contract/i, { timeout: 15_000 });
  const live = await page.request.get("/api/squeekchain/live").then((r) => r.json());
  expect(typeof live.available).toBe("boolean");
  const me = await page.request.get("/api/me").then((r) => r.json());
  // A client trying to claim a boost is ignored.
  const res = await page.request.post("/api/run/start", { data: { stake: 10, clientSeed: "boost", commitHash: me.commit.hash, requestKey: `boost${Date.now()}`, boostBp: 100000, liveRpm: 9999, blocksMined: 99 } });
  const { round } = await res.json();
  expect(round.live.boostBp).toBeLessThanOrEqual(1000);
  expect(round.live.rpm).toBeLessThan(1000);
  expect(round.live.blocksMined).toBe(0);
});

test("the API can't be talked into a better result", async ({ page }) => {
  const me = await page.request.get("/api/me").then((r) => r.json());
  const res = await page.request.post("/api/run/start", {
    data: { stake: 10, clientSeed: "tamper", commitHash: me.commit.hash, requestKey: `tamper${Date.now()}`, crashMult: 100000, multiplier: 999, payout: 1e9 },
  });
  expect(res.ok()).toBe(true);
  const { round } = await res.json();
  expect(round.crashMult).toBeNull();
  // During the countdown a cash-out is refused, however it's dressed up.
  const early = await page.request.post(`/api/run/${round.id}/cashout`, { data: { multiplier: 100000, mult: 100000, payout: 1e9 } });
  expect(early.status()).toBe(409);
  // After it, any payout comes from the server's clock.
  await page.waitForTimeout(3100);
  const out = await page.request.post(`/api/run/${round.id}/cashout`, { data: { multiplier: 100000 } }).then((r) => r.json());
  expect(out.round.resultMult).toBeLessThan(300);
  // Three times the stake at most, plus live bonuses of up to 35%.
  expect(out.round.payout).toBeLessThan(41);
  // Replaying it moves nothing.
  const again = await page.request.post(`/api/run/${round.id}/cashout`, { data: {} }).then((r) => r.json());
  expect(again.settledNow).toBe(false);
  expect(again.balance).toBe(out.balance);
});

test("bad stakes are refused", async ({ page }) => {
  const me = await page.request.get("/api/me").then((r) => r.json());
  for (const stake of [0, -5, 1.5, 9999999, "10"]) {
    const res = await page.request.post("/api/run/start", { data: { stake, clientSeed: "x", commitHash: me.commit.hash, requestKey: `bad${Math.random()}` } });
    expect(res.status()).toBe(400);
  }
  const over = await page.request.post("/api/run/start", { data: { stake: 99999, clientSeed: "x", commitHash: me.commit.hash, requestKey: `over${Date.now()}` } });
  expect(over.status()).toBe(409);
});

test("a cross-site request is turned away", async ({ page }) => {
  const res = await page.request.post("/api/credits/daily", { data: {}, headers: { Origin: "https://evil.example" } });
  expect(res.status()).toBe(403);
});
