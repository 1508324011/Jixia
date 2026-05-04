import { mkdtempSync, rmSync } from "node:fs";
import { once } from "node:events";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { createHttpServer } from "../../src/server/http-server";

async function startTestServer(storageRoot: string) {
  const httpServer = createHttpServer({
    env: { JIXIA_STORAGE_ROOT: storageRoot },
  });

  httpServer.server.listen(0, "127.0.0.1");
  await once(httpServer.server, "listening");
  const address = httpServer.server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server.");
  }

  return {
    close: async () => {
      httpServer.server.close();
      await once(httpServer.server, "close");
    },
    url: `http://127.0.0.1:${address.port}`,
  };
}

describe("http server phase 4 reader slice", () => {
  it("serves reading detail, note creation, and generated insight endpoints", async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), "jixia-http-phase4-"));

    try {
      const server = await startTestServer(storageRoot);

      try {
        const createdSpace = await fetch(
          `${server.url}/api/spaces?actorUserId=user-alice`,
          {
            body: JSON.stringify({ kind: "shared", name: "Phase 4 Shared" }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
        ).then((response) => response.json() as Promise<{ id: string }>);

        const importedRecord = await fetch(`${server.url}/api/import/paper`, {
          body: JSON.stringify({
            requestedByUserId: "user-alice",
            sourceLocator: "10.1000/reading-demo",
            sourceType: "doi",
            spaceId: createdSpace.id,
            visibility: "space_shared",
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }).then(
          (response) => response.json() as Promise<{ entry: { id: string } }>,
        );

        const detail = await fetch(
          `${server.url}/api/reading/${importedRecord.entry.id}?actorSpaceId=${createdSpace.id}&actorUserId=user-alice`,
        ).then(
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
            actorSpaceId: createdSpace.id,
            authorUserId: "user-alice",
            body: "This paper matters for the shared review.",
            libraryEntryId: importedRecord.entry.id,
            visibility: "space_shared",
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }).then(
          (response) =>
            response.json() as Promise<{ id: string; visibility: string }>,
        );
        expect(note.visibility).toBe("space_shared");

        const insight = await fetch(`${server.url}/api/reading/insights`, {
          body: JSON.stringify({
            actorSpaceId: createdSpace.id,
            evidenceSpans: [
              { endOffset: 18, quote: "shared review data", startOffset: 0 },
            ],
            libraryEntryId: importedRecord.entry.id,
            startedByUserId: "user-alice",
            summary: "The imported paper supports the shared review workflow.",
            title: "AI summary",
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }).then((response) => response.json() as Promise<{ summary: string }>);
        expect(insight.summary).toContain("shared review workflow");

        const updatedDetail = await fetch(
          `${server.url}/api/reading/${importedRecord.entry.id}?actorSpaceId=${createdSpace.id}&actorUserId=user-alice`,
        ).then(
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
