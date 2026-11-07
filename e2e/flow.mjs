// Manual visual check of play. node e2e/flow.mjs <outDir> [width] [height]
import { chromium } from "@playwright/test";
const [out = ".", w = "1280", h = "800"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const fps = () => page.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; performance.now() - t < 1500 ? requestAnimationFrame(f) : r(Math.round(n / 1.5)); }; requestAnimationFrame(f); }));
const tag = `${w}x${h}`;
await page.goto(`${process.env.E2E_BASE_URL ?? "http://localhost:3400"}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
console.log("lobby fps", await fps());
await page.screenshot({ path: `${out}/lobby-${tag}.png` });
await page.goto(`${process.env.E2E_BASE_URL ?? "http://localhost:3400"}/drops`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="drop"]:not([disabled])', { timeout: 60000 });
await page.waitForTimeout(5000);
console.log("drops fps", await fps());
await page.screenshot({ path: `${out}/drops-idle-${tag}.png` });
const first = page.waitForResponse((r) => r.url().includes("/api/drops/play"));
await page.click('[data-testid="drop"]');
await first;
await page.click('[data-testid="drop"]');
await page.waitForTimeout(2400);
console.log("drops falling fps", await fps());
await page.screenshot({ path: `${out}/drops-fall-${tag}.png` });
await page.waitForSelector('[data-testid="drop-result"]', { timeout: 30000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/drops-land-${tag}.png` });
await page.goto(`${process.env.E2E_BASE_URL ?? "http://localhost:3400"}/run`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="start-run"]:not([disabled])', { timeout: 60000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/run-idle-${tag}.png` });
await page.click('[data-testid="start-run"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/run-count-${tag}.png` });
await page.waitForFunction(() => document.querySelector('[data-testid="cash-out"]') || document.querySelector('[data-testid="round-result"]'), null, { timeout: 15000 });
await page.waitForTimeout(3500);
console.log("run fps", await fps());
await page.screenshot({ path: `${out}/run-mid-${tag}.png` });
if (await page.$('[data-testid="cash-out"]')) await page.click('[data-testid="cash-out"]').catch(() => {});
await page.waitForSelector('[data-testid="round-result"]', { timeout: 60000 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/run-end-${tag}.png` });
console.log("result", await page.textContent('[data-testid="round-result"]'));
if (await page.$('[data-testid="overtime-live"]').catch(() => null)) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/run-overtime-${tag}.png` });
}
const verdict = await page.waitForSelector('[data-testid="overtime-verdict"]', { timeout: 40000 }).catch(() => null);
if (verdict) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/run-verdict-${tag}.png` });
  console.log("verdict", await verdict.textContent());
}
console.log("errors", JSON.stringify(errors.slice(0, 10), null, 1));
await browser.close();
