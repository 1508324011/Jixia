import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  acceptInvitationThroughUi,
  createProjectDocumentThroughUi,
  createProjectThroughUi,
  identityFor
} from "./helpers";

test.describe("responsive workbench foundation", () => {
  test("keeps login and every primary navigation destination reachable at 390px", async ({ page }, testInfo) => {
    const browserErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Continue your research." })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expectViewportWithoutHorizontalOverflow(page);
    await expectElementWithinViewport(page.getByLabel("Email"), 390);
    await expectElementWithinViewport(page.getByRole("button", { name: "Sign in" }), 390);

    const identity = identityFor(testInfo, "responsive-mobile");
    await acceptInvitationThroughUi(page, identity);

    const destinations = [
      { label: "Home", path: /\/home$/ },
      { label: "Search", path: /\/search$/ },
      { label: "Library", path: /\/library$/ },
      { label: "Projects", path: /\/workspace$/ },
      { label: "Notebook", path: /\/notebook$/ },
      { label: "AI", path: /\/ai$/ },
      { label: "Settings", path: /\/settings\/account$/ }
    ] as const;

    for (const destination of destinations) {
      await page.getByRole("button", { name: destination.label, exact: true }).click();
      await expect(page).toHaveURL(destination.path);
      await expect(page.locator(".jixia-shell__rail-button[aria-current='page']")).toBeVisible();
      await expectElementWithinViewport(page.locator(".jixia-shell__rail-button[aria-current='page']"), 390);
      await expectViewportWithoutHorizontalOverflow(page);
    }

    await expect(page.getByRole("navigation", { name: "Workbench navigation" })).toHaveJSProperty("scrollLeft", 0);
    const languageSelect = page.getByLabel("Language");
    await expect(languageSelect).toHaveValue("en");
    await expect(languageSelect.getByRole("option", { name: "EN" })).toBeAttached();

    await languageSelect.selectOption("zh-CN");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.getByRole("button", { name: "首页", exact: true }).click();
    await expect(page.getByRole("heading", { name: "首页正在为你的研究日程做准备。" })).toBeVisible();
    await expect(page.getByRole("button", { name: "打开项目" })).toBeVisible();
    await expectViewportWithoutHorizontalOverflow(page);
    await expectElementWithinViewport(page.getByRole("button", { name: "打开项目" }), 390);

    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await page.goBack();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "首页正在为你的研究日程做准备。" })).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole("heading", { name: "搜索正在为文献发现做准备。" })).toBeVisible();
    expect(browserErrors).toEqual([]);
  });

  test("keeps document canvas and Copilot usable side by side at 1100px", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    const identity = identityFor(testInfo, "responsive-compact-desktop");
    await acceptInvitationThroughUi(page, identity);
    const projectId = await createProjectThroughUi(page, "Responsive geometry project");
    const documentId = await createProjectDocumentThroughUi(page, "Responsive geometry document");

    await page.goto(`/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`);
    await expect(page.getByLabel("Document title")).toHaveValue("Responsive geometry document");

    const artifactCanvas = page.getByLabel("Document artifact canvas");
    const inspector = page.getByLabel("Document inspector");
    await expect(artifactCanvas).toBeVisible();
    await expect(inspector).toBeVisible();
    await expect(inspector.getByLabel("Document copilot composer")).toBeVisible();
    await expectInspectorControlsWithinBounds(inspector);

    const geometry = await splitGeometry(artifactCanvas, inspector);
    expect(geometry.artifact.width).toBeGreaterThanOrEqual(520);
    expect(geometry.inspector.width).toBeGreaterThanOrEqual(360);
    expect(Math.abs(geometry.artifact.y - geometry.inspector.y)).toBeLessThanOrEqual(1);
    expect(geometry.artifact.x + geometry.artifact.width).toBeLessThanOrEqual(geometry.inspector.x + 1);
    await expectViewportWithoutHorizontalOverflow(page);
  });

  test("keeps intermediate-width document panes inside the workspace at 1200px", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    const identity = identityFor(testInfo, "responsive-intermediate-desktop");
    await acceptInvitationThroughUi(page, identity);
    const projectId = await createProjectThroughUi(page, "Intermediate geometry project");
    const documentId = await createProjectDocumentThroughUi(page, "Intermediate geometry document");

    await page.goto(`/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`);
    await expect(page.getByRole("complementary", { name: "Context sidebar" })).toBeHidden();

    const workspaceFrame = page.locator(".jixia-workspace-frame");
    const artifactCanvas = page.getByLabel("Document artifact canvas");
    const inspector = page.getByLabel("Document inspector");
    const geometry = await splitGeometry(artifactCanvas, inspector);

    expect(geometry.artifact.width).toBeGreaterThanOrEqual(520);
    expect(geometry.inspector.width).toBeGreaterThanOrEqual(360);
    expect(geometry.artifact.x + geometry.artifact.width).toBeLessThanOrEqual(geometry.inspector.x + 1);
    await expectElementWithinContainer(artifactCanvas, workspaceFrame);
    await expectElementWithinContainer(inspector, workspaceFrame);
    await expectViewportWithoutHorizontalOverflow(page);
  });

  test("keeps the full desktop shell and document split free of page overflow at 1366px", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    const identity = identityFor(testInfo, "responsive-wide-desktop");
    await acceptInvitationThroughUi(page, identity);
    const projectId = await createProjectThroughUi(page, "Wide workbench project");
    const documentId = await createProjectDocumentThroughUi(page, "Wide workbench document");

    await page.goto(`/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`);
    await expect(page.getByRole("complementary", { name: "Activity rail" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Context sidebar" })).toBeVisible();

    const artifactCanvas = page.getByLabel("Document artifact canvas");
    const inspector = page.getByLabel("Document inspector");
    await expect(artifactCanvas).toBeVisible();
    await expect(inspector).toBeVisible();
    await expectInspectorControlsWithinBounds(inspector);

    const geometry = await splitGeometry(artifactCanvas, inspector);
    expect(geometry.artifact.width).toBeGreaterThanOrEqual(520);
    expect(geometry.inspector.width).toBeGreaterThanOrEqual(360);
    expect(geometry.artifact.x + geometry.artifact.width).toBeLessThanOrEqual(geometry.inspector.x + 1);
    await expectViewportWithoutHorizontalOverflow(page);
  });
});

async function expectViewportWithoutHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectElementWithinViewport(locator: Locator, viewportWidth: number): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewportWidth);
}

async function expectInspectorControlsWithinBounds(inspector: Locator): Promise<void> {
  const controls = [
    inspector.getByRole("button", { name: "Copilot" }),
    inspector.getByRole("button", { name: "Metadata" }),
    inspector.getByRole("button", { name: "Versions" }),
    inspector.getByRole("button", { name: "Attachments" }),
    inspector.getByRole("button", { name: "Open AI provider settings" }),
    inspector.getByRole("button", { name: "Send" })
  ];

  for (const control of controls) {
    await expectElementWithinContainer(control, inspector);
  }

  await inspector.getByText(/Document context · on/).click();
  await expectElementWithinContainer(inspector.getByText("Bounded context preview"), inspector);
}

async function expectElementWithinContainer(locator: Locator, container: Locator): Promise<void> {
  const [box, containerBox] = await Promise.all([locator.boundingBox(), container.boundingBox()]);
  expect(box).not.toBeNull();
  expect(containerBox).not.toBeNull();

  if (!box || !containerBox) {
    throw new Error("Responsive control did not render a bounding box.");
  }

  expect(box.x).toBeGreaterThanOrEqual(containerBox.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(containerBox.x + containerBox.width + 1);
}

async function splitGeometry(
  artifactCanvas: Locator,
  inspector: Locator
): Promise<{ readonly artifact: NonNullable<Awaited<ReturnType<typeof artifactCanvas.boundingBox>>>; readonly inspector: NonNullable<Awaited<ReturnType<typeof inspector.boundingBox>>> }> {
  const [artifact, inspectorBox] = await Promise.all([artifactCanvas.boundingBox(), inspector.boundingBox()]);
  expect(artifact).not.toBeNull();
  expect(inspectorBox).not.toBeNull();

  if (!artifact || !inspectorBox) {
    throw new Error("Document split panes did not render bounding boxes.");
  }

  return { artifact, inspector: inspectorBox };
}
