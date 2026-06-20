import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  acceptInvitationThroughUi,
  collectDirectUploadCredentialLeaks,
  collectApiRequestsWithAuthorization,
  createNotebookDocumentThroughUi,
  createProjectDocumentThroughUi,
  createProjectThroughUi,
  identityFor,
  saveFormalRevision,
  waitForDraftSave
} from "./helpers";

const figureFixturePath = new URL("./fixtures/figure.svg", import.meta.url).pathname;
const pastedImageBytes = [60, 115, 118, 103, 32, 47, 62];

test("uploads an image block and resolves it after document reload", async ({ page }, testInfo) => {
  const authorizationHeaderRequests = collectApiRequestsWithAuthorization(page);
  const directUploadCredentialLeaks = collectDirectUploadCredentialLeaks(page);
  const identity = identityFor(testInfo, "attachment-upload");

  await acceptInvitationThroughUi(page, identity);
  await createProjectThroughUi(page, "Attachment smoke project");
  await createProjectDocumentThroughUi(page, "Attachment smoke document");

  await insertNativeFileBlock(page, "image");

  const intentResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/attachments/upload-intents" && response.request().method() === "POST";
  });
  const objectUploadResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.startsWith("/local-object-storage/upload/") && response.request().method() === "PUT";
  });
  const confirmResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.match(/^\/api\/attachments\/upload-intents\/[^/]+\/confirm$/) !== null && response.request().method() === "POST";
  });

  await uploadThroughNativeFilePanel(page, "image", figureFixturePath);

  expect((await intentResponse).status()).toBe(200);
  expectSuccessfulDirectUpload(await objectUploadResponse);
  expect((await confirmResponse).status()).toBe(200);
  await expect(page.getByRole("img", { name: "figure.svg" })).toBeVisible();
  expect(directUploadCredentialLeaks).toEqual([]);

  await waitForDraftSave(page);
  await saveFormalRevision(page);
  await page.reload();
  await expect(page.getByRole("img", { name: "figure.svg" })).toBeVisible();
  await expect(page.getByText(/storageKey|objectKey|x-amz|signature/i)).toHaveCount(0);

  const downloadResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.match(/^\/api\/attachments\/[^/]+\/download$/) !== null && response.request().method() === "POST";
  });
  const popupPromise = page.waitForEvent("popup", { timeout: 2_000 }).catch(() => null);
  await page.getByRole("img", { name: "figure.svg" }).click();
  expect((await downloadResponse).status()).toBe(200);
  const popup = await popupPromise;
  if (popup) {
    await popup.waitForURL("**/local-object-storage/download/**", { timeout: 2_000 });
    const popupUrl = new URL(popup.url());
    expect(popupUrl.pathname).toMatch(/^\/local-object-storage\/download\//);
    expect(popupUrl.searchParams.has("signature")).toBe(true);
  }
  await popup?.close();

  expect(authorizationHeaderRequests).toEqual([]);
});

test("uploads through native file panel and persists safe metadata", async ({ page }, testInfo) => {
  const authorizationHeaderRequests = collectApiRequestsWithAuthorization(page);
  const directUploadCredentialLeaks = collectDirectUploadCredentialLeaks(page);
  const identity = identityFor(testInfo, "attachment-card-click");

  await openNewProjectDocument(page, identity, "Attachment click project", "Attachment click document");

  const [intentResponse, objectUploadResponse, confirmResponse] = await Promise.all([
    waitForUploadIntent(page),
    waitForObjectUpload(page),
    waitForUploadConfirm(page),
    insertNativeFileBlock(page, "file").then(() => uploadThroughNativeFilePanel(page, "file", figureFixturePath))
  ]);

  expect(intentResponse.status()).toBe(200);
  expectSuccessfulDirectUpload(objectUploadResponse);
  expect(confirmResponse.status()).toBe(200);
  await expect(page.getByText("figure.svg")).toBeVisible();
  expect(directUploadCredentialLeaks).toEqual([]);

  await saveFormalRevision(page);
  await page.reload();
  await expect(page.getByText("figure.svg")).toBeVisible();
  await expectNoPersistedStorageSecrets(page);
  expect(authorizationHeaderRequests).toEqual([]);
});

test("uses the same upload path from notebook documents", async ({ page }, testInfo) => {
  const authorizationHeaderRequests = collectApiRequestsWithAuthorization(page);
  const directUploadCredentialLeaks = collectDirectUploadCredentialLeaks(page);
  const identity = identityFor(testInfo, "notebook-attachment-upload");

  await acceptInvitationThroughUi(page, identity);
  await createNotebookDocumentThroughUi(page, "Notebook attachment document");

  const [intentResponse, objectUploadResponse, confirmResponse] = await Promise.all([
    waitForUploadIntent(page),
    waitForObjectUpload(page),
    waitForUploadConfirm(page),
    insertNativeFileBlock(page, "image").then(() => uploadThroughNativeFilePanel(page, "image", figureFixturePath))
  ]);

  expect(intentResponse.status()).toBe(200);
  expectSuccessfulDirectUpload(objectUploadResponse);
  expect(confirmResponse.status()).toBe(200);
  await expect(page.getByRole("img", { name: "figure.svg" })).toBeVisible();
  await saveFormalRevision(page);
  await page.reload();
  await expect(page.getByRole("img", { name: "figure.svg" })).toBeVisible();
  await expectNoPersistedStorageSecrets(page);
  expect(directUploadCredentialLeaks).toEqual([]);
  expect(authorizationHeaderRequests).toEqual([]);
});

test("pastes an image into the editor as a private attachment block", async ({ page }, testInfo) => {
  const authorizationHeaderRequests = collectApiRequestsWithAuthorization(page);
  const directUploadCredentialLeaks = collectDirectUploadCredentialLeaks(page);
  const identity = identityFor(testInfo, "attachment-paste");

  await openNewProjectDocument(page, identity, "Attachment paste project", "Attachment paste document");

  const editor = blockNoteEditable(page);
  await editor.click();
  const [intentResponse, objectUploadResponse, confirmResponse] = await Promise.all([
    waitForUploadIntent(page),
    waitForObjectUpload(page),
    waitForUploadConfirm(page),
    dispatchFilePaste(editor, {
      bytes: pastedImageBytes,
      fileName: "pasted-figure.svg",
      mimeType: "image/svg+xml"
    })
  ]);

  expect(intentResponse.status()).toBe(200);
  expectSuccessfulDirectUpload(objectUploadResponse);
  expect(confirmResponse.status()).toBe(200);
  await expect(page.getByRole("img", { name: "pasted-figure.svg" })).toBeVisible();
  await saveFormalRevision(page);
  await page.reload();
  await expect(page.getByRole("img", { name: "pasted-figure.svg" })).toBeVisible();
  await expectNoPersistedStorageSecrets(page);
  expect(directUploadCredentialLeaks).toEqual([]);
  expect(authorizationHeaderRequests).toEqual([]);
});

test("drops a file into the editor as a private attachment block", async ({ page }, testInfo) => {
  const authorizationHeaderRequests = collectApiRequestsWithAuthorization(page);
  const directUploadCredentialLeaks = collectDirectUploadCredentialLeaks(page);
  const identity = identityFor(testInfo, "attachment-drop");

  await openNewProjectDocument(page, identity, "Attachment drop project", "Attachment drop document");

  const editor = blockNoteEditable(page);
  await editor.click();
  const [intentResponse, objectUploadResponse, confirmResponse] = await Promise.all([
    waitForUploadIntent(page),
    waitForObjectUpload(page),
    waitForUploadConfirm(page),
    dispatchFileDrop(editor, {
      bytes: [100, 114, 111, 112, 112, 101, 100],
      fileName: "dropped-notes.txt",
      mimeType: "text/plain"
    })
  ]);

  expect(intentResponse.status()).toBe(200);
  expectSuccessfulDirectUpload(objectUploadResponse);
  expect(confirmResponse.status()).toBe(200);
  await expect(page.getByText("dropped-notes.txt")).toBeVisible();
  await saveFormalRevision(page);
  await page.reload();
  await expect(page.getByText("dropped-notes.txt")).toBeVisible();
  await expectNoPersistedStorageSecrets(page);
  expect(directUploadCredentialLeaks).toEqual([]);
  expect(authorizationHeaderRequests).toEqual([]);
});

test("hides attachment mutations in archived documents", async ({ page }, testInfo) => {
  const authorizationHeaderRequests = collectApiRequestsWithAuthorization(page);
  const identity = identityFor(testInfo, "attachment-readonly");

  await openNewProjectDocument(page, identity, "Attachment read-only project", "Attachment read-only document");
  const [intentResponse, objectUploadResponse, confirmResponse] = await Promise.all([
    waitForUploadIntent(page),
    waitForObjectUpload(page),
    waitForUploadConfirm(page),
    insertNativeFileBlock(page, "file").then(() => uploadThroughNativeFilePanel(page, "file", figureFixturePath))
  ]);

  expect(intentResponse.status()).toBe(200);
  expectSuccessfulDirectUpload(objectUploadResponse);
  expect(confirmResponse.status()).toBe(200);
  await saveFormalRevision(page);

  const archiveResponse = await page.evaluate(async () => {
    const pathParts = new URL(window.location.href).pathname.split("/").filter(Boolean);
    const documentId = pathParts[pathParts.length - 1] ?? "";
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/archive`, {
      method: "POST",
      credentials: "include"
    });
    return response.status;
  });
  expect(archiveResponse).toBe(200);

  await page.reload();
  await expect(page.getByText("Archived documents are read-only.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save revision" })).toBeDisabled();
  await expect(page.getByLabel("Insert block type")).toBeDisabled();
  await expect(page.getByText("Add file")).toHaveCount(0);
  await expect(page.getByPlaceholder("Upload file")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove block" })).toHaveCount(0);
  await expect(page.getByText("figure.svg")).toBeVisible();
  expect(authorizationHeaderRequests).toEqual([]);
});

function blockNoteEditable(page: Page): Locator {
  return page.locator('.jixia-blocknote-shell .ProseMirror[contenteditable="true"]').first();
}

async function insertNativeFileBlock(page: Page, type: "image" | "file"): Promise<void> {
  await page.getByLabel("Insert block type").selectOption(type);
  await page.getByRole("button", { name: "Insert block" }).click();
}

async function uploadThroughNativeFilePanel(page: Page, type: "image" | "file", fixturePath: string): Promise<void> {
  await page.getByText(type === "image" ? "Add image" : "Add file").last().click();
  await page.locator(".bn-tab-panel input[type='file']").setInputFiles(fixturePath);
}

async function openNewProjectDocument(
  page: Page,
  identity: ReturnType<typeof identityFor>,
  projectName: string,
  documentTitle: string
): Promise<void> {
  await acceptInvitationThroughUi(page, identity);
  await createProjectThroughUi(page, projectName);
  await createProjectDocumentThroughUi(page, documentTitle);
}

function waitForUploadIntent(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/attachments/upload-intents" && response.request().method() === "POST";
  });
}

function waitForObjectUpload(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.startsWith("/local-object-storage/upload/") && response.request().method() === "PUT";
  });
}

function expectSuccessfulDirectUpload(response: Awaited<ReturnType<typeof waitForObjectUpload>>): void {
  expect(response.status()).toBe(200);
  const requestHeaders = response.request().headers();
  const headers = response.headers();
  expect(response.request().method()).toBe("PUT");
  expect(requestHeaders.authorization).toBeUndefined();
  expect(requestHeaders.cookie).toBeUndefined();
  expect(headers["access-control-allow-origin"]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(headers["access-control-allow-methods"]).toContain("PUT");
  expect(headers["access-control-expose-headers"]).toContain("ETag");
  expect(headers["access-control-expose-headers"]).toContain("X-Jixia-E2E-Preflight-Seen");
  expect(headers["x-jixia-e2e-preflight-seen"]).toBe("true");
  expect(headers.etag).toBeTruthy();
}

function waitForUploadConfirm(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.match(/^\/api\/attachments\/upload-intents\/[^/]+\/confirm$/) !== null && response.request().method() === "POST";
  });
}

async function expectNoPersistedStorageSecrets(page: Page): Promise<void> {
  await expect(page.getByText(/storageKey|objectKey|bucket|x-amz|signature/i)).toHaveCount(0);
}

async function dispatchFilePaste(
  target: Locator,
  file: { readonly bytes: readonly number[]; readonly fileName: string; readonly mimeType: string }
): Promise<void> {
  await target.evaluate((element, { bytes, fileName, mimeType }) => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File([new Uint8Array(bytes)], fileName, { type: mimeType }));
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData
    });
    element.dispatchEvent(event);
  }, file);
}

async function dispatchFileDrop(
  target: Locator,
  file: { readonly bytes: readonly number[]; readonly fileName: string; readonly mimeType: string }
): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  const clientX = box ? Math.floor(box.x + box.width / 2) : 20;
  const clientY = box ? Math.floor(box.y + box.height / 2) : 20;
  const dataTransfer = await dataTransferWithFile(target.page(), file);
  await target.dispatchEvent("dragover", { clientX, clientY, dataTransfer });
  await target.dispatchEvent("drop", { clientX, clientY, dataTransfer });
  await dataTransfer.dispose();
}

async function dataTransferWithFile(
  page: Page,
  file: { readonly bytes: readonly number[]; readonly fileName: string; readonly mimeType: string }
) {
  return page.evaluateHandle(({ bytes, fileName, mimeType }) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([new Uint8Array(bytes)], fileName, { type: mimeType }));
    return dataTransfer;
  }, file);
}
