import { expect, test } from "@playwright/test";

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

test("uploads an image block and resolves it after document reload", async ({ page }, testInfo) => {
  const authorizationHeaderRequests = collectApiRequestsWithAuthorization(page);
  const directUploadCredentialLeaks = collectDirectUploadCredentialLeaks(page);
  const identity = identityFor(testInfo, "attachment-upload");

  await acceptInvitationThroughUi(page, identity);
  await createProjectThroughUi(page, "Attachment smoke project");
  await createProjectDocumentThroughUi(page, "Attachment smoke document");

  await page.getByLabel("Insert block type").selectOption("image");
  await page.getByRole("button", { name: "Insert block" }).click();
  const uploadInput = page.getByLabel("Block 2 image upload");
  await expect(uploadInput).toBeVisible();

  const intentResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/attachments/upload-intents" && response.request().method() === "POST";
  });
  const objectUploadResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.startsWith("/api/e2e-storage/upload/") && response.request().method() === "PUT";
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
  await popup?.close();

  expect(authorizationHeaderRequests).toEqual([]);
});
