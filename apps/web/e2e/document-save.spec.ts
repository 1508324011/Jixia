import { expect, test } from "@playwright/test";

import {
  acceptInvitationThroughUi,
  collectApiPathRequests,
  collectApiRequestsWithAuthorization,
  createProjectDocumentThroughUi,
  createProjectThroughUi,
  fillDocumentEditor,
  identityFor,
  saveFormalRevision,
  waitForDraftSave
} from "./helpers";

test("saves project document drafts and formal revisions without AI writeback", async ({ page }, testInfo) => {
  const authorizationHeaderRequests = collectApiRequestsWithAuthorization(page);
  const aiRequests = collectApiPathRequests(page, "/api/ai");
  const identity = identityFor(testInfo, "document-save");

  await acceptInvitationThroughUi(page, identity);
  await createProjectThroughUi(page, "Draft and revision smoke project");
  const documentId = await createProjectDocumentThroughUi(page, "Draft and revision smoke document");

  const draftSavePromise = waitForDraftSave(page);
  await fillDocumentEditor(page, "Draft text saved through the document draft API.");
  await draftSavePromise;

  await saveFormalRevision(page);
  await expect(page.getByText("Base revision 1")).toBeVisible();

  const secondDraftPromise = waitForDraftSave(page);
  await fillDocumentEditor(page, "Local edit should conflict after a newer server revision.");
  await secondDraftPromise;

  const externalSaveStatus = await page.evaluate(async (input) => {
    const response = await fetch(`/api/documents/${encodeURIComponent(input.documentId)}/revisions`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        baseRevision: 1,
        title: "Draft and revision smoke document",
        contentSnapshot: {
          editorSchemaVersion: 1,
          blocks: [
            {
              id: "external-conflict-block",
              type: "paragraph",
              text: "A newer server revision exists."
            }
          ]
        }
      })
    });

    return response.status;
  }, { documentId });
  expect(externalSaveStatus).toBe(200);

  const conflictResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.match(/^\/api\/documents\/[^/]+\/revisions$/) !== null && response.status() === 409;
  });
  await page.getByRole("button", { name: "Save revision" }).click();
  await conflictResponse;

  await expect(page.getByRole("heading", { name: "Revision conflict" })).toBeVisible();
  await expect(page.getByText("Human merge required")).toBeVisible();
  await expect(page.getByText("Jixia does not call AI or auto-merge conflicts.")).toBeVisible();
  expect(aiRequests).toEqual([]);
  expect(authorizationHeaderRequests).toEqual([]);
});

test("shows code block controls without hover and persists safe code metadata", async ({ page }, testInfo) => {
  const identity = identityFor(testInfo, "code-controls");

  await acceptInvitationThroughUi(page, identity);
  await createProjectThroughUi(page, "Code controls smoke project");
  await createProjectDocumentThroughUi(page, "Code controls smoke document");

  await page.getByLabel("Insert block type").selectOption("codeBlock");
  await page.getByRole("button", { name: "Insert block" }).click();
  await expect(page.getByLabel("Code block language")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy code block" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enable code wrapping" })).toBeVisible();

  await page.getByLabel("Code block language").selectOption("python");
  await page.getByRole("button", { name: "Enable code wrapping" }).click();
  await expect(page.getByRole("button", { name: "Disable code wrapping" })).toBeVisible();
  await waitForDraftSave(page);
  await saveFormalRevision(page);
  await page.reload();
  await expect(page.getByLabel("Code block language")).toHaveValue("python");
  await expect(page.getByRole("button", { name: "Disable code wrapping" })).toBeVisible();
});
