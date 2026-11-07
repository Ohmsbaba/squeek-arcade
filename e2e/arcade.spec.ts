import { expect, test } from "@playwright/test";
import { ready, watchErrors } from "./helpers";
import { readFileSync } from "node:fs";

test("the lobby shows both machines and walks into a game", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await ready(page);
  await expect(page.getByRole("heading", { name: "Squeek Arcade" })).toBeVisible();
  await expect(page.getByTestId("portal-drops")).toBeVisible();
  await expect(page.getByTestId("portal-run")).toBeVisible();
  await expect(page.getByLabel("Leaderboards")).toBeVisible();
  await expect(page.getByTestId("challenges").locator("li")).toHaveCount(3);
  await page.getByTestId("portal-run").click();
  await expect(page).toHaveURL(/\/run$/, { timeout: 30_000 });
  await expect(page.getByTestId("start-run")).toBeEnabled();
  await page.goto("/");
  await page.getByTestId("portal-drops").click();
  await expect(page).toHaveURL(/\/drops$/, { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("nothing overflows sideways", async ({ page }) => {
  for (const path of ["/", "/drops", "/run", "/profile", "/leaderboards", "/fairness"]) {
    await page.goto(path);
    await ready(page);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, path).toBeLessThanOrEqual(0);
  }
});

test("the cash-out and drop buttons are big enough to hit", async ({ page }) => {
  await page.goto("/drops");
  await ready(page);
  const b = (await page.getByTestId("drop").boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(60);
  expect(b.y + b.height).toBeLessThanOrEqual(page.viewportSize()!.height + 400);
  await page.goto("/run");
  await ready(page);
  const r = (await page.getByTestId("start-run").boundingBox())!;
  expect(r.height).toBeGreaterThanOrEqual(60);
});

test("a new player starts with 10,000, and today's claim is already used", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await expect(page.getByTestId("balance")).toContainText("10,000");
  await expect(page.getByTestId("daily-claim")).toHaveCount(0);
  const again = await page.request.post("/api/credits/daily", { data: {} });
  expect(again.status()).toBe(409);
});

test("a username, a result link and a public page", async ({ page, context }) => {
  await page.goto("/drops");
  await ready(page);
  await page.getByTestId("balls-1").click();
  const play = page.waitForResponse((r) => r.url().includes("/api/drops/play"));
  await page.getByTestId("drop").click();
  const { round } = await (await play).json();
  await expect(page.getByTestId("result-card")).toBeVisible({ timeout: 25_000 });

  const name = `Hammy_${Date.now().toString(36).slice(-6)}`;
  await page.goto("/profile");
  await page.getByTestId("username-input").fill(name);
  await page.getByTestId("username-save").click();
  await expect(page.getByTestId("profile-name")).toHaveText(name);
  await expect(page.getByTestId("achievements").locator('[data-earned="true"]').first()).toContainText("First Drop");
  await expect(page.getByTestId("ledger")).toContainText("Welcome points");

  // A stranger sees the same result, with the seed public and no private data.
  const stranger = await context.browser()!.newContext();
  const other = await stranger.newPage();
  await other.goto(`/r/${round.shareId}`);
  await expect(other.getByRole("heading", { level: 1 })).toContainText("Landed on");
  await expect(other.locator("body")).toContainText(name);
  const card = await other.request.get(`/r/${round.shareId}/opengraph-image`);
  expect(card.ok()).toBe(true);
  expect(card.headers()["content-type"]).toContain("image/png");
  await stranger.close();
  // Boards show the top 25, which a shared test database fills up. Tests in tests/player.test.ts cover the ranking.
  await page.goto("/leaderboards");
  await page.getByTestId("board-games").click();
  await expect(page.getByTestId("leaderboard").locator("li").first()).toBeVisible();
});

test("admin is closed without the password, and shows numbers with it", async ({ page }) => {
  const denied = await page.request.get("/api/admin/stats");
  expect(denied.status()).toBe(401);
  await page.goto("/admin");
  await page.getByTestId("admin-password").fill("wrong");
  await page.getByTestId("admin-login").click();
  await expect(page.locator("form [role=alert]")).toBeVisible();
  const password = readFileSync(".env", "utf8").match(/^ADMIN_PASSWORD=(.*)$/m)![1];
  await page.getByTestId("admin-password").fill(password);
  await page.getByTestId("admin-login").click();
  await expect(page.getByTestId("admin-panel")).toContainText("Points issued");
  const stats = await page.request.get("/api/admin/stats").then((r) => r.json());
  expect(JSON.stringify(stats)).not.toMatch(/serverSeed|ipHash/);
});

test("Lite mode swaps to the 2D scene and still plays", async ({ page }) => {
  await page.goto("/drops");
  await ready(page);
  await page.evaluate(() => localStorage.setItem("sa_lite", "1"));
  await page.reload();
  await ready(page);
  await expect(page.getByTestId("drops-stage").locator('canvas[role="img"]')).toBeVisible();
  await page.getByTestId("drop").click();
  await expect(page.getByTestId("drop-result")).toBeVisible({ timeout: 25_000 });
  await page.goto("/run");
  await ready(page);
  await expect(page.locator('svg[aria-label="Squeektoshi running in the wheel"]')).toBeVisible();
});

test("sound can be muted and stays muted", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Mute sound" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Turn sound on" })).toBeVisible();
});
