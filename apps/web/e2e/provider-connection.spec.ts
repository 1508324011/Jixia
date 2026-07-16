import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import type { AIModelProfileView, AIProviderConfigView } from "@jixia/shared";

import { acceptInvitationThroughUi, identityFor } from "./helpers";

const timestamp = "2026-07-14T08:00:00.000Z";

test.describe("provider connection and capability discovery", () => {
  test("connects, verifies, and synchronizes observed capabilities through Jixia only", async ({ page }, testInfo) => {
    const browserFailures = monitorBrowserFailures(page);
    const apiRequests: Request[] = [];
    const browserRequests = monitorBrowserRequests(page);
    let config: ProviderFixture | null = null;

    await page.route("**/api/ai/**", async (route) => {
      apiRequests.push(route.request());
      const request = route.request();
      const path = new URL(request.url()).pathname;

      if (request.method() === "GET" && path === "/api/ai/configs") {
        await json(route, { configs: config ? [config] : [] });
        return;
      }

      if (request.method() === "POST" && path === "/api/ai/configs") {
        const body = request.postDataJSON() as Record<string, unknown>;
        expect(body).toMatchObject({
          provider: "openrouter",
          providerKind: "openrouter",
          baseURL: "https://openrouter.ai/api/v1",
          apiKey: "browser-write-only-key"
        });
        config = providerFixture({
          name: String(body.name),
          provider: "openrouter",
          providerKind: "openrouter",
          baseURL: "https://openrouter.ai/api/v1"
        });
        await json(route, { config });
        return;
      }

      if (request.method() === "POST" && path === "/api/ai/configs/provider-e2e/test") {
        expect(request.postDataJSON()).toEqual({});
        config = providerFixture({
          name: config?.name ?? "OpenRouter research",
          provider: "openrouter",
          providerKind: "openrouter",
          baseURL: "https://openrouter.ai/api/v1",
          connection: verifiedConnection()
        });
        await json(route, {
          healthCheck: {
            ok: true,
            category: null,
            message: "Connection verified without running a model.",
            latencyMs: 18,
            provider: "openrouter",
            model: "",
            baseURL: "https://openrouter.ai/api/v1",
            checkedAt: timestamp,
            connection: verifiedConnection()
          }
        });
        return;
      }

      if (request.method() === "POST" && path === "/api/ai/configs/provider-e2e/capabilities/sync") {
        expect(request.postData()).toBeNull();
        config = synchronizedProviderFixture();
        await json(route, {
          config,
          transport: "reachable",
          authentication: "verified",
          discovery: "available",
          freshness: "fresh",
          discovered: 2,
          created: 2,
          updated: 0,
          skipped: 0,
          warnings: []
        });
        return;
      }

      await route.abort("failed");
    });

    await page.setViewportSize({ width: 1366, height: 900 });
    await acceptInvitationThroughUi(page, identityFor(testInfo, "provider-lifecycle"));
    await page.goto("/settings/ai");

    await expect(page.getByText("1. Choose provider")).toBeVisible();
    await page.getByRole("button", { name: /OpenRouter/ }).click();
    await page.getByLabel("Connection name").fill("OpenRouter research");
    await page.getByLabel("API key").fill("browser-write-only-key");
    await page.getByRole("button", { name: "Save connection" }).click();

    await expect(page.getByText("Connection saved.")).toBeVisible();
    await expect(page.getByLabel("Replacement API key")).toHaveValue("");
    await expect(page.getByText("browser-write-only-key")).toHaveCount(0);

    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Connection verified without running a model.");
    await expect(page.getByText("Authentication verified", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Sync capabilities", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Synchronized 2 models.");
    await expect(page.getByText("OpenAI GPT-4o mini", { exact: true })).toBeVisible();
    await expect(page.getByText("Claude 3.5 Sonnet", { exact: true })).toBeVisible();
    await expect(page.getByText("Context: 128,000", { exact: true })).toBeVisible();
    await expect(page.getByText("Max output: Unknown", { exact: true })).toBeVisible();

    for (const viewport of [
      { width: 1366, height: 900 },
      { width: 1100, height: 800 },
      { width: 390, height: 844 }
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole("heading", { name: "5. Choose model" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectPrimaryContentWithinViewport(page, viewport.width);
      const screenshotPath = testInfo.outputPath(`provider-settings-${viewport.width}px.png`);
      await page.screenshot({ animations: "disabled", path: screenshotPath });
      await testInfo.attach(`provider-settings-${viewport.width}px`, {
        contentType: "image/png",
        path: screenshotPath
      });
    }

    expect(browserFailures).toEqual([]);
    expect(apiRequests.some((request) => request.url().includes("/chat/completions") || request.url().includes("/messages"))).toBe(false);
    expect(apiRequests.some((request) => request.url().endsWith("/test") && request.postData() === "{}")).toBe(true);
    assertJixiaOnlyApiTraffic(apiRequests, browserRequests);
  });

  test("treats unsupported custom discovery as a recoverable advanced fallback", async ({ page }, testInfo) => {
    const browserFailures = monitorBrowserFailures(page);
    const apiRequests: Request[] = [];
    const browserRequests = monitorBrowserRequests(page);
    let config = providerFixture({
      name: "Institution gateway",
      provider: "openai-compatible",
      providerKind: "openai_compatible",
      baseURL: "https://models.institution.example/v1",
      connection: verifiedConnection()
    });

    await page.route("**/api/ai/**", async (route) => {
      apiRequests.push(route.request());
      const request = route.request();
      const path = new URL(request.url()).pathname;

      if (request.method() === "GET" && path === "/api/ai/configs") {
        await json(route, { configs: [config] });
        return;
      }

      if (request.method() === "POST" && path === "/api/ai/configs/provider-e2e/capabilities/sync") {
        config = {
          ...config,
          sync: {
            discovery: "unsupported",
            freshness: "stale",
            lastAttemptAt: timestamp,
            lastSuccessfulSyncAt: null,
            errorCode: null,
            message: "Automatic model discovery is not supported by this endpoint."
          }
        };
        await json(route, {
          config,
          transport: "reachable",
          authentication: "unverified",
          discovery: "unsupported",
          freshness: "stale",
          discovered: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          warnings: ["Automatic discovery is unsupported. Add models in Advanced only when needed."]
        });
        return;
      }

      await route.abort("failed");
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await acceptInvitationThroughUi(page, identityFor(testInfo, "provider-unsupported"));
    await page.goto("/settings/ai");
    await page.getByRole("button", { name: /^Institution gateway Custom OpenAI-compatible/ }).click();
    await page.getByRole("button", { name: "Sync capabilities", exact: true }).click();

    await expect(page.getByText(/Advanced/).first()).toBeVisible();
    await expect(page.getByText(/unsupported/i).first()).toBeVisible();
    await expect(page.locator("details.jixia-provider-settings__advanced")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const screenshotPath = testInfo.outputPath("provider-settings-unsupported-390px.png");
    await page.screenshot({ animations: "disabled", path: screenshotPath });
    await testInfo.attach("provider-settings-unsupported-390px", {
      contentType: "image/png",
      path: screenshotPath
    });
    expect(browserFailures).toEqual([]);
    assertJixiaOnlyApiTraffic(apiRequests, browserRequests);
  });
});

type ProviderFixture = AIProviderConfigView;

function providerFixture(overrides: Partial<AIProviderConfigView> = {}): AIProviderConfigView {
  return {
    id: "provider-e2e",
    ownerUserId: "user-e2e",
    name: "Provider connection",
    provider: "openai",
    providerKind: "openai",
    baseURL: "https://api.openai.com/v1",
    endpointDisplay: "api.openai.com/v1",
    hasKey: true,
    isDefault: true,
    connection: {
      transport: "not_checked",
      authentication: "not_checked",
      lastAttemptAt: null,
      lastVerifiedAt: null,
      errorCode: null,
      message: null
    },
    sync: {
      discovery: "not_attempted",
      freshness: "never",
      lastAttemptAt: null,
      lastSuccessfulSyncAt: null,
      errorCode: null,
      message: null
    },
    modelProfiles: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function verifiedConnection(): NonNullable<AIProviderConfigView["connection"]> {
  return {
    transport: "reachable",
    authentication: "verified",
    lastAttemptAt: timestamp,
    lastVerifiedAt: timestamp,
    errorCode: null,
    message: "Connection verified without running a model."
  };
}

function synchronizedProviderFixture() {
  const modelProfiles = [
    modelFixture({
      id: "model-openai-mini",
      model: "openai/gpt-4o-mini",
      displayName: "OpenAI GPT-4o mini",
      isDefault: true,
      contextWindowTokens: 128_000,
      inputModalities: ["text", "image"],
      supportedParameters: ["temperature", "max_tokens"]
    }),
    modelFixture({
      id: "model-claude-sonnet",
      model: "anthropic/claude-3.5-sonnet",
      displayName: "Claude 3.5 Sonnet",
      maxOutputTokens: 8192
    })
  ];

  return providerFixture({
    name: "OpenRouter research",
    provider: "openrouter",
    providerKind: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    endpointDisplay: "openrouter.ai/api/v1",
    connection: verifiedConnection(),
    sync: {
      discovery: "available",
      freshness: "fresh",
      lastAttemptAt: timestamp,
      lastSuccessfulSyncAt: timestamp,
      errorCode: null,
      message: "Synchronized 2 models."
    },
    modelProfiles
  });
}

function modelFixture(input: {
  readonly id: string;
  readonly model: string;
  readonly displayName: string;
  readonly isDefault?: boolean;
  readonly contextWindowTokens?: number;
  readonly maxOutputTokens?: number;
  readonly inputModalities?: readonly string[];
  readonly supportedParameters?: readonly string[];
}): AIModelProfileView {
  return {
    id: input.id,
    providerConfigId: "provider-e2e",
    model: input.model,
    displayName: input.displayName,
    temperature: 0.2,
    maxTokens: 4096,
    enabled: true,
    isDefault: input.isDefault ?? false,
    origin: "discovered",
    availability: "available",
    lastSeenAt: timestamp,
    capabilities: {
      contextWindowTokens: input.contextWindowTokens === undefined
        ? { state: "unknown", value: null }
        : { state: "observed", value: input.contextWindowTokens },
      maxOutputTokens: input.maxOutputTokens === undefined
        ? { state: "unknown", value: null }
        : { state: "observed", value: input.maxOutputTokens },
      inputModalities: input.inputModalities === undefined
        ? { state: "unknown", values: [] }
        : { state: "observed", values: input.inputModalities },
      outputModalities: { state: "observed", values: ["text"] },
      supportedParameters: input.supportedParameters === undefined
        ? { state: "unknown", values: [] }
        : { state: "observed", values: input.supportedParameters }
    },
    provenance: { source: "openrouter", observedAt: timestamp },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function monitorBrowserFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("requestfailed", (request) => failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`));
  return failures;
}

function monitorBrowserRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  return requests;
}

function assertJixiaOnlyApiTraffic(apiRequests: readonly Request[], browserRequests: readonly Request[]): void {
  expect(apiRequests.length).toBeGreaterThan(0);
  for (const request of apiRequests) {
    const url = new URL(request.url());
    expect(url.pathname.startsWith("/api/ai/")).toBe(true);
    expect(request.headers().authorization).toBeUndefined();
  }
  const providerHosts = new Set(["api.openai.com", "openrouter.ai", "api.anthropic.com", "models.institution.example"]);
  expect(browserRequests.filter((request) => providerHosts.has(new URL(request.url()).hostname))).toEqual([]);
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ contentType: "application/json", status, body: JSON.stringify(body) });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectPrimaryContentWithinViewport(page: Page, viewportWidth: number): Promise<void> {
  const box = await page.locator(".jixia-provider-settings").boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewportWidth + 1);
}
