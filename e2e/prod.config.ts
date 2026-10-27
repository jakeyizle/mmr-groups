import { defineConfig } from "@playwright/test";

// Smoke tests against a live deployment: `SMOKE_URL=https://… playwright test -c prod.config.ts`.
const baseURL = process.env.SMOKE_URL;
if (!baseURL) throw new Error("SMOKE_URL is required");

export default defineConfig({
  testDir: "prod",
  retries: 2,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL },
});
