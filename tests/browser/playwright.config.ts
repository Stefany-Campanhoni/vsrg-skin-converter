import { defineConfig } from "@playwright/test"
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.ts",
  timeout: 120000,
  workers: 1,
  reporter: "list",
  use: {
    browserName: "chromium",
    headless: true,
    channel: Bun.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: {
    cwd: "../..",
    command: "bun .ci/web/serve-web.ts --site --parity --pages",
    url: "http://127.0.0.1:4173/vsrg-skin-converter/image-backend.html",
    reuseExistingServer: false,
  },
})
