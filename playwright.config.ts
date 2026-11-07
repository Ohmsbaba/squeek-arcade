import { defineConfig, devices } from "@playwright/test";

const gl = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3400", trace: "off", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1280, height: 800 }, launchOptions: { args: gl } } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome", launchOptions: { args: gl } } },
    { name: "webkit", testMatch: "determinism.spec.ts", use: { ...devices["Desktop Safari"] } },
  ],
});
