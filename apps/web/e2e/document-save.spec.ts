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
  expect(aiRequests.filter((request) => !allowedDocumentCopilotBootstrapRequest(request))).toEqual([]);
  expect(authorizationHeaderRequests).toEqual([]);
});

test("creates default BlockNote code blocks and persists safe code metadata", async ({ page }, testInfo) => {
  const identity = identityFor(testInfo, "default-code-block");

  await acceptInvitationThroughUi(page, identity);
  await createProjectThroughUi(page, "Default code block smoke project");
  const documentId = await createProjectDocumentThroughUi(page, "Default code block smoke document");

  await expect(page.getByLabel("Insert block type")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Insert block" })).toHaveCount(0);

  await insertDefaultCodeBlock(page, "print('saved through BlockNote')");
  await waitForDraftSave(page);
  await saveFormalRevision(page);

  await expectSavedCodeBlock(page, documentId, "print('saved through BlockNote')");
  await page.reload();
  await expect(page.getByTestId("jixia-blocknote-view").getByText("print('saved through BlockNote')", { exact: true })).toBeVisible();
});

function allowedDocumentCopilotBootstrapRequest(request: string): boolean {
  return request === "GET /api/ai/configs" || request === "GET /api/ai/conversations";
}

async function insertDefaultCodeBlock(page: Parameters<typeof fillDocumentEditor>[0], code: string): Promise<void> {
  const editor = page.getByLabel("Jixia BlockNote editor");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type("```");
  await page.keyboard.press("Space");
  await page.keyboard.type(code);
}

async function expectSavedCodeBlock(
  page: Parameters<typeof fillDocumentEditor>[0],
  documentId: string,
  code: string
): Promise<void> {
  const snapshot = await page.evaluate(async (input) => {
    const response = await fetch(`/api/documents/${encodeURIComponent(input.documentId)}`, { credentials: "include" });
    const body = await response.json();
    return body.currentSnapshot;
  }, { documentId });

  expect(snapshot).toEqual(expect.objectContaining({
    blocks: expect.arrayContaining([
      expect.objectContaining({
        type: "codeBlock",
        text: code
      })
    ])
  }));
  expect(JSON.stringify(snapshot)).not.toMatch(/jixiaCodeBlock|storageKey|signature|authorization|Bearer/i);
}
