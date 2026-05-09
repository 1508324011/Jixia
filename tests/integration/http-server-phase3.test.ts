import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  loginAs,
  startTestServer,
  withSessionCookie,
} from "./http-session-test-helpers";

describe("http server phase 3 library slice", () => {
  it("serves import and library list/get endpoints for the browser", async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), "jixia-http-phase3-"));

    try {
      const server = await startTestServer({ JIXIA_STORAGE_ROOT: storageRoot });

      try {
        const aliceCookie = await loginAs(server.url, "user-alice");

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: "shared", name: "Phase 3 Shared" }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then((response) => response.json() as Promise<{ id: string }>);
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: "Phase 3 Project",
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
            sourceLocator: "10.1000/jixia-demo",
            sourceType: "doi",
            spaceId: createdSpace.id,
            visibility: "space_shared",
          }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then(
          (response) =>
            response.json() as Promise<{
              asset: { canonicalId: string };
              entry: { id: string; spaceId: string };
            }>,
        );

        expect(importedRecord.asset.canonicalId).toBe("doi:10.1000/jixia-demo");
        expect(importedRecord.entry.spaceId).toBe(createdSpace.id);

        const libraryEntries = await fetch(
          `${server.url}/api/library?scopeType=project&scopeId=${project.project.id}&spaceId=${createdSpace.id}`,
          { headers: withSessionCookie(aliceCookie) },
        ).then(
          (response) =>
            response.json() as Promise<Array<{ entry: { id: string } }>>,
        );
        expect(libraryEntries.map((entry) => entry.entry.id)).toContain(
          importedRecord.entry.id,
        );

        const libraryEntry = await fetch(
          `${server.url}/api/library/${importedRecord.entry.id}`,
          { headers: withSessionCookie(aliceCookie) },
        ).then(
          (response) =>
            response.json() as Promise<{ asset: { canonicalId: string } }>,
        );
        expect(libraryEntry.asset.canonicalId).toBe("doi:10.1000/jixia-demo");
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
