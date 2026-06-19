import { expect, type Page, type TestInfo } from "@playwright/test";

export const e2eSessionCookieName = "jixia_e2e_session";

export type E2EIdentity = {
  readonly invitationToken: string;
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
};

export function identityFor(testInfo: TestInfo, label: string): E2EIdentity {
  const suffix = safeSlug(`${label}-${testInfo.workerIndex}-${testInfo.retry}-${testInfo.repeatEachIndex}-${testInfo.title}`);

  return {
    invitationToken: `e2e-invitation-${suffix}`,
    email: `${suffix}@e2e.jixia.test`,
    displayName: `E2E ${label}`,
    password: `Jixia-${suffix}-pass`
  };
}

export function collectApiRequestsWithAuthorization(page: Page): readonly string[] {
  const requests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) {
      return;
    }

    if (request.headers().authorization) {
      requests.push(`${request.method()} ${url.pathname}`);
    }
  });

  return requests;
}

export function collectApiPathRequests(page: Page, prefix: string): readonly string[] {
  const requests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith(prefix)) {
      requests.push(`${request.method()} ${url.pathname}`);
    }
  });

  return requests;
}

export function collectDirectUploadCredentialLeaks(page: Page): readonly string[] {
  const requests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/e2e-storage/upload/")) {
      return;
    }

    const headers = request.headers();
    if (headers.authorization || headers.cookie) {
      requests.push(`${request.method()} ${url.pathname}`);
    }
  });

  return requests;
}

export async function acceptInvitationThroughUi(page: Page, identity: E2EIdentity): Promise<void> {
  await page.goto(`/accept-invitation?token=${encodeURIComponent(identity.invitationToken)}`);
  await expect(page.getByRole("heading", { name: "Join your lab workspace." })).toBeVisible();
  await expect(page).toHaveURL((url) => !url.searchParams.has("token") && !url.searchParams.has("invitationToken"));

  await expect(page.getByLabel("Invitation token")).toHaveValue(identity.invitationToken);
  await page.getByLabel("Email").fill(identity.email);
  await page.getByLabel("Display name").fill(identity.displayName);
  await page.getByLabel("Password").fill(identity.password);

  await Promise.all([
    page.waitForURL("**/workspace"),
    page.getByRole("button", { name: "Accept invitation" }).click()
  ]);
  await expect(page.getByRole("heading", { name: "Server-authorized research projects" })).toBeVisible();
  await expect(page.getByLabel("Current session")).toContainText(identity.email);
  await expectHttpOnlySessionCookie(page);
  await expectNoBrowserTokenStorage(page);
}

export async function loginThroughUi(page: Page, identity: E2EIdentity): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to the research workbench." })).toBeVisible();
  await page.getByLabel("Email").fill(identity.email);
  await page.getByLabel("Password").fill(identity.password);

  await Promise.all([
    page.waitForURL("**/workspace"),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);
  await expect(page.getByRole("heading", { name: "Server-authorized research projects" })).toBeVisible();
  await expect(page.getByLabel("Current session")).toContainText(identity.email);
  await expectHttpOnlySessionCookie(page);
  await expectNoBrowserTokenStorage(page);
}

export async function logoutCurrentDeviceThroughApi(page: Page): Promise<void> {
  const logoutStatus = await page.evaluate(async () => {
    const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    return response.status;
  });
  expect(logoutStatus).toBe(200);

  const sessionStatus = await authMeStatus(page);
  expect(sessionStatus).toBe(401);
  await expectNoSessionCookie(page);
  await expectNoBrowserTokenStorage(page);
}

export async function authMeStatus(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/me", { credentials: "include" });
    return response.status;
  });
}

export async function createProjectThroughUi(page: Page, projectName: string): Promise<string> {
  await expect(page.getByRole("heading", { name: "Server-authorized research projects" })).toBeVisible();
  await page.getByLabel("Project name").fill(projectName);

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/projects" && response.request().method() === "POST";
  });

  await page.getByRole("button", { name: "Create project" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { readonly project?: { readonly id?: string } };
  const projectId = body.project?.id;
  if (!projectId) {
    throw new Error("Project create response did not include an id.");
  }

  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  return projectId;
}

export async function createProjectDocumentThroughUi(page: Page, documentTitle: string): Promise<string> {
  await page.getByLabel("New project document").fill(documentTitle);

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/documents/project" && response.request().method() === "POST";
  });

  await page.getByRole("button", { name: "Create", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { readonly document?: { readonly id?: string } };
  const documentId = body.document?.id;
  if (!documentId) {
    throw new Error("Document create response did not include an id.");
  }

  await expect(page.getByLabel("Document title")).toHaveValue(documentTitle);
  return documentId;
}

export async function waitForDraftSave(page: Page): Promise<void> {
  const response = await page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname.match(/^\/api\/documents\/[^/]+\/draft$/) !== null && candidate.request().method() === "PUT";
  });
  expect(response.status()).toBe(200);
  await expect(page.getByText(/Draft saved/)).toBeVisible();
}

export async function fillDocumentEditor(page: Page, text: string): Promise<void> {
  const editor = page.getByLabel("Jixia BlockNote editor");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type(text);
}

export async function saveFormalRevision(page: Page): Promise<void> {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.match(/^\/api\/documents\/[^/]+\/revisions$/) !== null && response.request().method() === "POST";
  });

  await page.getByRole("button", { name: "Save revision" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page.getByText("Formal revision saved.")).toBeVisible();
}

export async function expectNoBrowserTokenStorage(page: Page): Promise<void> {
  const storage = await page.evaluate((cookieName) => {
    return {
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
      visibleCookies: document.cookie,
      cookieName
    };
  }, e2eSessionCookieName);

  expect(storage.localStorageKeys).toEqual([]);
  expect(storage.sessionStorageKeys).toEqual([]);
  expect(storage.visibleCookies).not.toContain(storage.cookieName);
  expect(storage.visibleCookies).not.toMatch(/token|session/i);
}

async function expectHttpOnlySessionCookie(page: Page): Promise<void> {
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name === e2eSessionCookieName);

  expect(sessionCookie?.httpOnly).toBe(true);
}

async function expectNoSessionCookie(page: Page): Promise<void> {
  const cookies = await page.context().cookies();

  expect(cookies.some((cookie) => cookie.name === e2eSessionCookieName)).toBe(false);
}

function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}
