import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  acceptInvitationThroughUi,
  collectDirectUploadCredentialLeaks,
  collectApiRequestsWithAuthorization,
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

  await page.getByLabel("Insert block type").selectOption("image");
  await page.getByRole("button", { name: "Insert block" }).click();
  const uploadInput = page.locator('input[aria-label="Block 2 image upload"]');

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

  await uploadInput.setInputFiles(figureFixturePath);

  expect((await intentResponse).status()).toBe(200);
  expect((await objectUploadResponse).status()).toBe(200);
  expect((await confirmResponse).status()).toBe(200);
  await expect(page.getByText("Attachment uploaded and linked to this block.")).toBeVisible();
  await expect(page.getByText("Private attachment linked")).toBeVisible();
  await expect(page.getByText("figure.svg")).toBeVisible();
  expect(directUploadCredentialLeaks).toEqual([]);

  await waitForDraftSave(page);
  await saveFormalRevision(page);
  await page.reload();
  await expect(page.getByText("Private attachment linked")).toBeVisible();
  await expect(page.getByText("figure.svg")).toBeVisible();
  await expect(page.getByText(/storageKey|objectKey|x-amz|signature/i)).toHaveCount(0);

  const downloadResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.match(/^\/api\/attachments\/[^/]+\/download$/) !== null && response.request().method() === "POST";
  });
  const popupPromise = page.waitForEvent("popup", { timeout: 2_000 }).catch(() => null);
  await page.getByRole("button", { name: "Open attachment" }).click();
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

test("uploads through attachment card click and persists safe metadata", async ({ page }, testInfo) => {
  const authorizationHeaderRequests = collectApiRequestsWithAuthorization(page);
  const directUploadCredentialLeaks = collectDirectUploadCredentialLeaks(page);
  const identity = identityFor(testInfo, "attachment-card-click");

  await openNewProjectDocument(page, identity, "Attachment click project", "Attachment click document");

  await page.getByLabel("Insert block type").selectOption("file");
  await page.getByRole("button", { name: "Insert block" }).click();

  await page.getByLabel("Block 2 file attachment").click();
  const [intentResponse, objectUploadResponse, confirmResponse] = await Promise.all([
    waitForUploadIntent(page),
    waitForObjectUpload(page),
    waitForUploadConfirm(page),
    page.locator('input[aria-label="Block 2 file upload"]').setInputFiles(figureFixturePath)
  ]);

  expect(intentResponse.status()).toBe(200);
  expect(objectUploadResponse.status()).toBe(200);
  expect(confirmResponse.status()).toBe(200);
  await expect(page.getByText("Attachment uploaded and linked to this block.")).toBeVisible();
  await expect(page.getByText("Private attachment linked")).toBeVisible();
  await expect(page.getByText("figure.svg")).toBeVisible();
  expect(directUploadCredentialLeaks).toEqual([]);

  await saveFormalRevision(page);
  await page.reload();
  await expect(page.getByText("Private attachment linked")).toBeVisible();
  await expect(page.getByText("figure.svg")).toBeVisible();
  await expectNoPersistedStorageSecrets(page);
  expect(authorizationHeaderRequests).toEqual([]);
});

test("pastes an image into the editor as a private attachment block", async ({ page }, testInfo) => {
  const authorizationHeaderRequests = collectApiRequestsWithAuthorization(page);
  const directUploadCredentialLeaks = collectDirectUploadCredentialLeaks(page);
  const identity = identityFor(testInfo, "attachment-paste");

  await openNewProjectDocument(page, identity, "Attachment paste project", "Attachment paste document");

  const editor = page.getByLabel("Jixia BlockNote editor");
  await editor.click();
  const editorShell = page.locator(".jixia-blocknote-shell");
  const [intentResponse, objectUploadResponse, confirmResponse] = await Promise.all([
    waitForUploadIntent(page),
    waitForObjectUpload(page),
    waitForUploadConfirm(page),
    dispatchFilePaste(editorShell, {
      bytes: pastedImageBytes,
      fileName: "pasted-figure.svg",
      mimeType: "image/svg+xml"
    })
  ]);

  expect(intentResponse.status()).toBe(200);
  expect(objectUploadResponse.status()).toBe(200);
  expect(confirmResponse.status()).toBe(200);
  await expect(page.getByText("Attachment uploaded and linked to this block.")).toBeVisible();
  await expect(page.getByText("Private attachment linked")).toBeVisible();
  await expect(page.getByText("pasted-figure.svg")).toBeVisible();
  await saveFormalRevision(page);
  await page.reload();
  await expect(page.getByText("pasted-figure.svg")).toBeVisible();
  await expectNoPersistedStorageSecrets(page);
  expect(directUploadCredentialLeaks).toEqual([]);
  expect(authorizationHeaderRequests).toEqual([]);
});

test("drops a file into the editor as a private attachment block", async ({ page }, testInfo) => {
  const authorizationHeaderRequests = collectApiRequestsWithAuthorization(page);
  const directUploadCredentialLeaks = collectDirectUploadCredentialLeaks(page);
  const identity = identityFor(testInfo, "attachment-drop");

  await openNewProjectDocument(page, identity, "Attachment drop project", "Attachment drop document");

  const editor = page.getByLabel("Jixia BlockNote editor");
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
  expect(objectUploadResponse.status()).toBe(200);
  expect(confirmResponse.status()).toBe(200);
  await expect(page.getByText("Attachment uploaded and linked to this block.")).toBeVisible();
  await expect(page.getByText("Private attachment linked")).toBeVisible();
  await expect(page.getByText("dropped-notes.txt")).toBeVisible();
  await saveFormalRevision(page);
  await page.reload();
  await expect(page.getByText("dropped-notes.txt")).toBeVisible();
  await expectNoPersistedStorageSecrets(page);
  expect(directUploadCredentialLeaks).toEqual([]);
  expect(authorizationHeaderRequests).toEqual([]);
});

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
  const dataTransfer = await dataTransferWithFile(target.page(), file);
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
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
