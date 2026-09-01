import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Keep the database outside Playwright's outputDir, which it clears between runs.
const database = join(
  mkdtempSync(join(tmpdir(), "notespace-e2e-")),
  "notespace.db",
);

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 12_000 },
  workers: 1,
  use: {
    baseURL: process.env.NOTESPACE_TEST_URL || "http://127.0.0.1:8081",
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.NOTESPACE_CHROMIUM
      ? {
          executablePath: process.env.NOTESPACE_CHROMIUM,
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--no-zygote",
            "--in-process-gpu",
            "--use-gl=angle",
            "--use-angle=swiftshader",
          ],
        }
      : undefined,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: process.env.NOTESPACE_TEST_URL
    ? undefined
    : {
        command: "go run ./cmd/notespace",
        cwd: "./apps/server",
        env: {
          NOTESPACE_DB: database,
          NOTESPACE_ADDR: "127.0.0.1:8081",
          NOTESPACE_WEB_DIR: "../web/dist/client",
        },
        url: "http://127.0.0.1:8081/api/health",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
