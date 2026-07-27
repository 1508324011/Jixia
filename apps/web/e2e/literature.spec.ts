import { expect, test, type Page } from "@playwright/test";

import {
  acceptInvitationThroughUi,
  collectApiRequestsWithAuthorization,
  createProjectThroughUi,
  expectNoBrowserTokenStorage,
  identityFor
} from "./helpers";

const literatureTitle = "Glioblastoma evidence synthesis";
const expiredLiteratureTitle = "Lease recovery evidence";
const evidenceDirectory = decodeURIComponent(new URL("../../../.omo/evidence/task25-phase2-discovery-library/task-15-browser/", import.meta.url).pathname);

test.describe("literature discovery and library", () => {
  test("imports personal literature after a partial-provider failure and explicit retry", async ({ page }, testInfo) => {
    // Given: an authenticated researcher on the literature search surface.
    const browserErrors = collectBrowserErrors(page);
    const authorizationLeaks = collectApiRequestsWithAuthorization(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await acceptInvitationThroughUi(page, identityFor(testInfo, "literature-personal"));
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // When: a partial search result fails its first import and the researcher retries it.
    await page.getByTestId("literature-search-query").fill("glioblastoma");
    await page.getByTestId("literature-search-submit").click();
    await expect(page.getByRole("alert").filter({ hasText: "Crossref" })).toBeVisible();
    const candidate = page.getByRole("button", { name: literatureTitle });
    await expect(candidate).toHaveCount(1);
    await expect(candidate).toContainText("10.1000/alpha");
    await candidate.focus();
    await page.keyboard.press("Enter");
    await expect(candidate).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("literature-import-submit").click();
    await expect(page.getByRole("alert").filter({ hasText: "Import failed: seed_unavailable." })).toBeVisible();
    await page.screenshot({ path: `${evidenceDirectory}personal-import-failed-retry-1280x900.png` });
    await Promise.all([
      page.waitForURL((url) =>
        url.pathname === "/library" &&
        url.searchParams.get("scope") === "personal" &&
        url.searchParams.has("literatureId")
      ),
      page.getByTestId("literature-import-retry").click()
    ]);

    // Then: the personal library exposes the server projection, conflict, and three-provider provenance.
    await expect(page.getByRole("heading", { name: "Personal literature", level: 1 })).toBeVisible();
    await expect(page.getByTestId("personal-library-list")).toBeVisible();
    const personalLibraryRow = page.getByRole("button", { name: literatureTitle });
    await personalLibraryRow.click();
    await expectCompleteProjection(page);
    await expect(page.getByRole("heading", { name: "DOI conflicts" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Assertion history" })).toBeVisible();
    await expectProviderProvenance(page);
    await expect(personalLibraryRow).toBeInViewport({ ratio: 0.95 });
    await expectViewportWithoutHorizontalOverflow(page);
    await page.screenshot({ path: `${evidenceDirectory}personal-library-detail-1280x900.png` });
    await expectNoBrowserTokenStorage(page);
    expect(authorizationLeaks).toEqual([]);
    expect(browserErrors).toEqual([]);

    await Promise.all([
      page.waitForURL("**/notebook"),
      page.getByRole("button", { name: "Notebook", exact: true }).click()
    ]);
    await expect(page.getByRole("heading", { name: "Notebook", level: 1 })).toBeVisible();
    await expect(page.getByTestId("personal-library-list")).toBeVisible();
    await expect(page.getByRole("button", { name: literatureTitle })).toBeVisible();
    await expectViewportWithoutHorizontalOverflow(page);
    await page.screenshot({ path: `${evidenceDirectory}notebook-personal-library-1280x900.png` });
    await expectNoBrowserTokenStorage(page);
    expect(browserErrors).toEqual([]);
  });

  test("imports into a project and renders project-scoped provenance", async ({ page }, testInfo) => {
    // Given: a researcher owns a project and opens literature search.
    const browserErrors = collectBrowserErrors(page);
    const authorizationLeaks = collectApiRequestsWithAuthorization(page);
    await page.setViewportSize({ width: 768, height: 900 });
    await acceptInvitationThroughUi(page, identityFor(testInfo, "literature-project"));
    const projectName = "Literature evidence project";
    const projectId = await createProjectThroughUi(page, projectName);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // When: the researcher selects that project and imports a deterministic search result.
    await page.getByTestId("literature-target-project").click();
    await page.getByTestId("literature-project-selector").selectOption(projectId);
    await page.getByTestId("literature-search-query").fill("glioblastoma");
    await page.getByTestId("literature-search-submit").click();
    const projectLibraryRow = page.getByRole("button", { name: literatureTitle });
    await projectLibraryRow.click();
    await Promise.all([
      page.waitForURL((url) =>
        url.pathname === "/library" &&
        url.searchParams.get("scope") === "project" &&
        url.searchParams.get("projectId") === projectId &&
        url.searchParams.has("literatureId")
      ),
      page.getByTestId("literature-import-submit").click()
    ]);
    await page.goto(`/projects/${encodeURIComponent(projectId)}`);

    // Then: only the selected project's library exposes the imported aggregate and provenance.
    await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();
    await expect(page.getByText("Project literature", { exact: true })).toBeVisible();
    await expect(page.getByTestId("project-library-list")).toBeVisible();
    await page.getByRole("button", { name: literatureTitle }).click();
    await expect(page.getByRole("heading", { name: "DOI conflicts" })).toBeVisible();
    await expectProviderProvenance(page);
    await expectCollapsedLibrarySplit(page, "project-library-list");
    await expectVisibleLibraryControlsAtLeast44px(page);
    await expect(projectLibraryRow).toBeInViewport({ ratio: 0.95 });
    await expectViewportWithoutHorizontalOverflow(page);
    await page.screenshot({ path: `${evidenceDirectory}project-library-detail-768x900.png` });
    await expectNoBrowserTokenStorage(page);
    expect(authorizationLeaks).toEqual([]);
    expect(browserErrors).toEqual([]);
  });

  test("renders a partial literature search in Simplified Chinese at mobile width", async ({ page }, testInfo) => {
    // Given: an authenticated researcher using the 375px mobile workbench in Simplified Chinese.
    const browserErrors = collectBrowserErrors(page);
    const authorizationLeaks = collectApiRequestsWithAuthorization(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await acceptInvitationThroughUi(page, identityFor(testInfo, "literature-mobile"));
    await page.getByRole("combobox", { name: "Language" }).selectOption("zh-CN");
    await page.getByRole("button", { name: "搜索", exact: true }).click();

    // When: the researcher performs a search while one provider is rate limited.
    await page.getByTestId("literature-search-query").fill("glioblastoma");
    await page.getByTestId("literature-search-submit").click();
    await expect(page.getByRole("alert").filter({ hasText: "Crossref" })).toBeVisible();
    await page.getByRole("button", { name: literatureTitle }).click();

    // Then: the responsive search surface remains readable, localized, and free of browser leaks.
    await expect(page.getByRole("heading", { name: "检索文献", level: 1 })).toBeVisible();
    await expectViewportWithoutHorizontalOverflow(page);
    await page.screenshot({ path: `${evidenceDirectory}literature-search-zh-CN-375x812.png` });
    await expectNoBrowserTokenStorage(page);
    expect(authorizationLeaks).toEqual([]);
    expect(browserErrors).toEqual([]);
  });

  test("recovers an expired running import into a populated mobile Library only after explicit retry", async ({ page }, testInfo) => {
    // Given: an authenticated researcher searching from the 375px workbench.
    const browserErrors = collectBrowserErrors(page);
    const authorizationLeaks = collectApiRequestsWithAuthorization(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await acceptInvitationThroughUi(page, identityFor(testInfo, "literature-expired-running"));
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByTestId("literature-search-query").fill("lease recovery");
    await page.getByTestId("literature-search-submit").click();
    await page.getByRole("button", { name: expiredLiteratureTitle }).click();

    // When: the admitted operation has an expired running lease.
    await page.getByTestId("literature-import-submit").click();

    // Then: recovery remains an explicit user action and no automatic takeover occurs.
    await expect(page.getByTestId("literature-import-retry")).toBeVisible();
    await expect(page.getByTestId("literature-import-submit")).toBeDisabled();
    await expect(page).toHaveURL(/\/search$/u);
    await expectViewportWithoutHorizontalOverflow(page);
    await page.screenshot({ path: `${evidenceDirectory}expired-running-recovery-375x812.png` });

    await Promise.all([
      page.waitForURL((url) =>
        url.pathname === "/library" &&
        url.searchParams.get("scope") === "personal" &&
        url.searchParams.has("literatureId")
      ),
      page.getByTestId("literature-import-retry").click()
    ]);

    // Then: the populated mobile Library exposes the complete typed detail without overflow or browser leaks.
    await expect(page.getByRole("heading", { name: "Personal literature", level: 1 })).toBeVisible();
    const personalLibraryRow = page.getByRole("button", { name: expiredLiteratureTitle });
    await personalLibraryRow.click();
    await expectCompleteProjection(page);
    await expect(page.getByRole("region", { name: "Current metadata" }).getByText("Open access · https://example.test/task25/open · License: CC BY 4.0 · Version: published · Host type: publisher", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "DOI conflicts" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Assertion history" })).toBeVisible();
    await expectProviderProvenance(page);
    await expectViewportWithoutHorizontalOverflow(page);
    await page.screenshot({ path: `${evidenceDirectory}personal-library-detail-375x812.png`, fullPage: true });
    await expectNoBrowserTokenStorage(page);
    expect(authorizationLeaks).toEqual([]);
    expect(browserErrors).toEqual([]);
  });
});

function collectBrowserErrors(page: Page): readonly string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectProviderProvenance(page: Page): Promise<void> {
  const providerRows = [
    /^openalex · WALPHA$/,
    /^crossref · 10\.1000\/alpha$/,
    /^pubmed · 98765432$/
  ];
  for (const providerRow of providerRows) {
    await expect(page.getByRole("listitem").filter({ hasText: providerRow })).toBeVisible();
  }
}

async function expectCompleteProjection(page: Page): Promise<void> {
  const projection = page.getByRole("region", { name: "Current metadata" });
  const fieldLabels = [
    "Title",
    "Abstract",
    "Publication year",
    "DOI",
    "Publication date",
    "Venue",
    "Publication type",
    "Authors",
    "Identifiers",
    "Open access",
    "Publisher"
  ];
  for (const label of fieldLabels) {
    await expect(projection.getByRole("heading", { exact: true, name: label })).toBeVisible();
  }
  await expect(projection.getByText("Lin Qiao (0000-0002-1825-0097), Mira Chen", { exact: true })).toBeVisible();
  await expect(projection.getByText("https://example.test/task25/open", { exact: false })).toBeVisible();
  await expect(projection.getByText("Jixia Evidence Press", { exact: false })).toBeVisible();
  const conflicts = projection.getByRole("status", { name: "Conflicts" });
  await expect(conflicts).toContainText("1 conflict");
  await expect(conflicts).toContainText("DOI");
}

async function expectViewportWithoutHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectCollapsedLibrarySplit(
  page: Page,
  listTestId: "personal-library-list" | "project-library-list"
): Promise<void> {
  const listBox = await page.getByTestId(listTestId).boundingBox();
  const detailBox = await page.locator(".jixia-literature-library__detail").boundingBox();
  expect(listBox).not.toBeNull();
  expect(detailBox).not.toBeNull();
  if (listBox === null || detailBox === null) return;
  expect(detailBox.y).toBeGreaterThanOrEqual(listBox.y + listBox.height);
}

async function expectVisibleLibraryControlsAtLeast44px(page: Page): Promise<void> {
  const controls = page.locator(".jixia-literature-library button:visible");
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await controls.nth(index).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
}
