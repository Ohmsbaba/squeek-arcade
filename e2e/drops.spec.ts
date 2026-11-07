import { expect, test } from "@playwright/test";
import { balance, installMockWallet, ready, TEST_ACCOUNT, watchErrors } from "./helpers";

test("a token falls, lands, pays, and the history and verifier agree", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/drops");
  await ready(page);
  const before = await balance(page);
  await page.getByTestId("balls-1").click();
  const play = page.waitForResponse((r) => r.url().includes("/api/drops/play"));
  await page.getByTestId("drop").click();
  const { round } = await (await play).json();
  expect(round.fairness.serverSeed).toMatch(/^[0-9a-f]{64}$/);

  // The stake leaves at once, but the payout isn't shown until the token lands.
  await expect.poll(() => balance(page)).toBe(before - round.stake);
  await expect(page.getByTestId("drop-result")).toHaveCount(0);

  await expect(page.getByTestId("drop-result")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("result-card")).toContainText(`Slot ${round.slot + 1} of 11`);
  await expect.poll(() => balance(page)).toBe(before - round.stake + round.payout);
  await expect(page.getByTestId("drop-history-row").first()).toBeVisible();
  expect(errors).toEqual([]);

  // Check it with the public tool, running the physics in the browser.
  await page.goto(`/fairness?round=${round.shareId}`);
  await expect(page.getByTestId("v-server-seed")).toHaveValue(round.fairness.serverSeed);
  await page.getByTestId("v-check").click();
  const result = page.getByTestId("v-result");
  await expect(result).toContainText("Matches the commitment");
  await expect(result).toContainText("Same as the recorded round");
  await expect(result).toContainText(`Slot ${round.slot + 1} (`);
});

test("rapid drops all settle, and the ledger adds up", async ({ page }) => {
  await page.goto("/drops");
  await ready(page);
  await page.getByTestId("balls-1").click();
  const before = await balance(page);
  const plays: Promise<{ round: { stake: number; payout: number } }>[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/drops/play")) plays.push(r.json());
  });
  for (let i = 0; i < 6; i++) {
    await page.getByTestId("drop").click();
    await page.waitForTimeout(120);
  }
  await expect.poll(() => plays.length, { timeout: 30_000 }).toBe(6);
  const results = await Promise.all(plays);
  const net = results.reduce((n, r) => n + r.round.payout - r.round.stake, 0);
  await expect.poll(() => balance(page), { timeout: 30_000 }).toBe(before + net);
});

test("ten tokens at once: they all land, the tally counts up, and the verifier agrees", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/drops");
  await ready(page);
  const before = await balance(page);
  await page.getByTestId("balls-10").click();
  await expect(page.getByTestId("total-bet")).toContainText("1,000");
  const play = page.waitForResponse((r) => r.url().includes("/api/drops/play"));
  await page.getByTestId("drop").click();
  const { round } = await (await play).json();
  expect(round.balls).toBe(10);
  expect(round.slots).toHaveLength(10);
  expect(round.stake).toBe(1000);
  await expect(page.getByTestId("drop-tally")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("ball-results").locator("li")).toHaveCount(10, { timeout: 30_000 });
  await expect.poll(() => balance(page)).toBe(before - round.stake + round.payout);
  expect(errors).toEqual([]);
  await page.goto(`/fairness?round=${round.shareId}`);
  await expect(page.getByTestId("v-server-seed")).toHaveValue(round.fairness.serverSeed);
  await page.getByTestId("v-check").click();
  await expect(page.getByTestId("v-result")).toContainText("Same as the recorded round");
});

test("the chute re-prices the slots and the choice is what's sent", async ({ page }) => {
  await page.goto("/drops");
  await ready(page);
  const pays = page.getByLabel("Pay table");
  const centre = await pays.textContent();
  await page.getByTestId("chute--3").click();
  await expect(page.getByTestId("chute--3")).toHaveAttribute("aria-checked", "true");
  expect(await pays.textContent()).not.toBe(centre);
  const play = page.waitForResponse((r) => r.url().includes("/api/drops/play"));
  await page.getByTestId("drop").click();
  expect((await (await play).json()).round.chute).toBe(-3);
});

test("no wallet: the arcade token plays and nothing asks for a wallet", async ({ page }) => {
  await page.goto("/drops");
  await ready(page);
  await expect(page.getByTestId("faller-name")).toHaveText("Arcade token");
  await page.getByTestId("pick-squeek").click();
  await expect(page.getByRole("dialog")).toContainText("Connect a wallet");
});

test("a real Squeek, read from Sepolia: pick it, drop it, keep it", async ({ page, context }) => {
  test.skip(process.env.E2E_LIVE_NFT !== "1", "Needs DEV_NFT_ALIAS on the server and network access. Set E2E_LIVE_NFT=1.");
  const errors = watchErrors(page);
  await installMockWallet(context);
  await page.goto("/drops");
  await ready(page);
  await page.getByTestId("pick-squeek").click();
  await page.getByRole("dialog").getByRole("button", { name: "Connect wallet" }).click();
  // A wallet that's already authorised reconnects by itself and skips straight to signing.
  const signIn = page.getByRole("button", { name: "Sign in" });
  const pick = page.getByRole("button", { name: /Mock Wallet/ });
  await expect(signIn.or(pick).first()).toBeVisible({ timeout: 30_000 });
  if (await pick.isVisible()) await pick.click();
  await signIn.click();
  await expect(page.getByRole("dialog", { name: "Connect wallet" })).toHaveCount(0, { timeout: 90_000 });
  const me = await page.request.get("/api/me").then((r) => r.json());
  expect(me.wallet).toBe(TEST_ACCOUNT.address);

  await page.getByTestId("pick-squeek").click();
  const option = page.getByTestId("squeek-option").first();
  await expect(option).toBeVisible({ timeout: 40_000 });
  const img = option.locator("img");
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await option.hover();
  await expect(page.getByTestId("squeek-detail")).toContainText("Level");
  await expect(page.getByTestId("squeek-detail")).toContainText("Palette");
  await option.click();
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("squeek-option").nth(1).click();
  await page.getByTestId("picker-done").click();
  await expect(page.getByTestId("faller-name")).toContainText("2 Squeeks");
  await page.getByTestId("balls-3").click();

  const play = page.waitForResponse((r) => r.url().includes("/api/drops/play"));
  await page.getByTestId("drop").click();
  const res = await (await play).json();
  expect(res.round.tokenIds).toHaveLength(2);
  expect(res.round.tokenLevel).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: process.env.E2E_SHOT ?? "test-results/squeek-falling.png" });
  await expect(page.getByTestId("result-card")).toContainText("2 Squeeks", { timeout: 25_000 });
  expect(errors).toEqual([]);

  // Someone else's token is refused on the server, however the request is made.
  const after = await page.request.get("/api/me").then((r) => r.json());
  const refused = await page.request.post("/api/drops/play", { data: { stake: 1, chute: 0, tokenIds: [1], clientSeed: "x", commitHash: after.commit.hash, requestKey: `nope${Date.now()}` } });
  expect([403, 503]).toContain(refused.status());
});
