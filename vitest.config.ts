import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://adebayodaniel@localhost:5432/squeek_arcade_test",
      SESSION_SECRET: "test-session-secret-test-session-secret",
      ADMIN_PASSWORD: "test-admin-password",
      GUEST_LIMIT_PER_HOUR: "20",
    },
  },
});
