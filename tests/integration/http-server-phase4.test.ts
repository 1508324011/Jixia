import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  loginAs,
  startTestServer,
  withSessionCookie,
} from "./http-session-test-helpers";

describe("http server phase 4 reader slice", () => {
  it("serves reading detail, note creation, and generated insight endpoints", async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), "jixia-http-phase4-"));

    try {
      const server = await startTestServer({ JIXIA_STORAGE_ROOT: storageRoot });

      try {
        const aliceCookie = await loginAs(server.url, "user-alice");

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: "shared", name: "Phase 4 Shared" }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then((response) => response.json() as Promise<{ id: string }>);
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: "Phase 4 Project",
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then(
          (response) =>
            response.json() as Promise<{ project: { id: string; spaceId: string } }>,
        );

        const importedRecord = await fetch(`${server.url}/api/import/paper`, {
          body: JSON.stringify({
            scope: { id: project.project.id, type: "project" },
            sourceLocator: "10.1000/reading-demo",
            sourceType: "doi",
            spaceId: createdSpace.id,
            visibility: "space_shared",
          }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then(
          (response) => response.json() as Promise<{ entry: { id: string } }>,
        );

        const detail = await fetch(`${server.url}/api/reading/${importedRecord.entry.id}`, {
          headers: withSessionCookie(aliceCookie),
        }).then(
          (response) =>
            response.json() as Promise<{
              asset: { canonicalId: string };
              insights: unknown[];
              notes: unknown[];
            }>,
        );
        expect(detail.asset.canonicalId).toBe("doi:10.1000/reading-demo");
        expect(detail.notes).toHaveLength(0);
        expect(detail.insights).toHaveLength(0);

        const note = await fetch(`${server.url}/api/reading/notes`, {
          body: JSON.stringify({
            body: "This paper matters for the shared review.",
            libraryEntryId: importedRecord.entry.id,
            visibility: "space_shared",
          }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then(
          (response) => response.json() as Promise<{ id: string; visibility: string }>,
        );
        expect(note.visibility).toBe("space_shared");

        const insight = await fetch(`${server.url}/api/reading/insights`, {
          body: JSON.stringify({
            evidenceSpans: [
              { endOffset: 18, quote: "shared review data", startOffset: 0 },
            ],
            libraryEntryId: importedRecord.entry.id,
            summary: "The imported paper supports the shared review workflow.",
            title: "AI summary",
          }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then((response) => response.json() as Promise<{ summary: string }>);
        expect(insight.summary).toContain("shared review workflow");

        const updatedDetail = await fetch(`${server.url}/api/reading/${importedRecord.entry.id}`, {
          headers: withSessionCookie(aliceCookie),
        }).then(
          (response) =>
            response.json() as Promise<{
              insights: unknown[];
              notes: unknown[];
            }>,
        );
        expect(updatedDetail.notes).toHaveLength(1);
        expect(updatedDetail.insights).toHaveLength(1);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
