declare const process: {
  readonly env: Readonly<Record<string, string | undefined>>;
};

const host = "127.0.0.1";
const webPort = Number(process.env.JIXIA_E2E_WEB_PORT ?? 5173);
const apiPort = Number(process.env.JIXIA_E2E_API_PORT ?? 4174);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${host}:${webPort}`;
const startLocalServers = process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1";
const webPackageRoot = new URL("./apps/web", import.meta.url).pathname;
const testApiPath = new URL("./apps/web/e2e/test-api.mjs", import.meta.url).pathname;

export default {
  testDir: "apps/web/e2e",
  outputDir: "test-results/e2e",
  timeout: 30_000,
  expect: {
    timeout: 7_500
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1366, height: 900 }
      }
    }
  ],
  webServer: startLocalServers
    ? [
        {
          command: `JIXIA_E2E_API_PORT=${apiPort} JIXIA_E2E_WEB_PORT=${webPort} node "${testApiPath}"`,
          url: `http://${host}:${apiPort}/health`,
          reuseExistingServer: false,
          timeout: 20_000
        },
        {
          command: `JIXIA_E2E_API_URL=http://${host}:${apiPort} pnpm --dir "${webPackageRoot}" exec vite --host ${host} --port ${webPort} --strictPort`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 30_000
        }
      ]
    : undefined
};
