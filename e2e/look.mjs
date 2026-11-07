// Manual visual check: node e2e/look.mjs <path> <out.png> [width] [height] [waitMs]
import { chromium } from "@playwright/test";
const [path = "/", out = "/tmp/shot.png", w = "1280", h = "800", wait = "3000"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://localhost:3400${path}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log("errors", JSON.stringify(errors.slice(0, 8), null, 1));
await browser.close();
