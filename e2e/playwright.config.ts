import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:4173";
const ci = Boolean(process.env.CI);

export default defineConfig({
  testMatch: "**/*.spec.ts",
  testIgnore: "prod/**",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
    { name: "iphone-14", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: "node serve.ts",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !ci,
    timeout: 120_000,
  },
});
