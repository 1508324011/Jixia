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
  }, 15_000);

  it("keeps HTTP scope inputs authoritative over stale compatibility fields", async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), "jixia-http-phase3-scope-"));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, "jixia-http-phase3-scope.db")}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, "user-alice");

        const firstSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: "shared", name: "HTTP Scope First" }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then((response) => response.json() as Promise<{ id: string }>);
        const secondSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: "shared", name: "HTTP Scope Second" }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then((response) => response.json() as Promise<{ id: string }>);
        const firstProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: "HTTP Scope First Project",
            spaceId: firstSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then(
          (response) =>
            response.json() as Promise<{ project: { id: string; spaceId: string } }>,
        );
        const secondProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: "HTTP Scope Second Project",
            spaceId: secondSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then(
          (response) =>
            response.json() as Promise<{ project: { id: string; spaceId: string } }>,
        );

        const projectImportResponse = await fetch(`${server.url}/api/import/paper`, {
          body: JSON.stringify({
            projectId: secondProject.project.id,
            scope: { id: firstProject.project.id, type: "project" },
            sourceLocator: "10.1000/http-scope-authority",
            sourceType: "doi",
            spaceId: firstSpace.id,
            visibility: "private",
          }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        });
        const personalImportResponse = await fetch(`${server.url}/api/import/paper`, {
          body: JSON.stringify({
            projectId: firstProject.project.id,
            scope: { id: "user-alice", type: "user" },
            sourceLocator: "10.1000/http-personal-authority",
            sourceType: "doi",
            spaceId: secondSpace.id,
            visibility: "published_to_project",
          }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        });

        expect(projectImportResponse.status).toBe(200);
        expect(personalImportResponse.status).toBe(200);

        const projectImport = await projectImportResponse.json() as {
          entry: {
            id: string;
            scope: { id: string; type: "project" | "user" };
            spaceId: string;
            visibility: string;
          };
        };
        const personalImport = await personalImportResponse.json() as {
          entry: {
            id: string;
            scope: { id: string; type: "project" | "user" };
            spaceId: string;
            visibility: string;
          };
        };

        expect(projectImport.entry).toMatchObject({
          scope: { id: firstProject.project.id, type: "project" },
          spaceId: firstSpace.id,
          visibility: "published_to_project",
        });
        expect(personalImport.entry).toMatchObject({
          scope: { id: "user-alice", type: "user" },
          spaceId: "",
          visibility: "private",
        });

        const projectListResponse = await fetch(
          `${server.url}/api/library?scopeType=project&scopeId=${firstProject.project.id}&projectId=${secondProject.project.id}&spaceId=${firstSpace.id}`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const projectListWithLegacyActorSpaceResponse = await fetch(
          `${server.url}/api/library?scopeType=project&scopeId=${firstProject.project.id}&projectId=${secondProject.project.id}&spaceId=${secondSpace.id}&actorSpaceId=${firstSpace.id}`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const personalListResponse = await fetch(
          `${server.url}/api/library?scopeType=user&scopeId=user-alice&projectId=${firstProject.project.id}&spaceId=${secondSpace.id}`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const mismatchedSpaceResponse = await fetch(
          `${server.url}/api/library?scopeType=project&scopeId=${firstProject.project.id}&spaceId=${secondSpace.id}`,
          { headers: withSessionCookie(aliceCookie) },
        );

        expect(projectListResponse.status).toBe(200);
        expect(projectListWithLegacyActorSpaceResponse.status).toBe(400);
        expect(personalListResponse.status).toBe(200);
        expect(mismatchedSpaceResponse.status).toBe(400);

        const projectList = await projectListResponse.json() as Array<{
          entry: { id: string };
        }>;
        const personalList = await personalListResponse.json() as Array<{
          entry: { id: string };
        }>;
        const projectListWithLegacyActorSpace =
          await projectListWithLegacyActorSpaceResponse.json() as { error: string };
        const mismatchedSpace = await mismatchedSpaceResponse.json() as { error: string };

        expect(projectList.map((entry) => entry.entry.id)).toContain(
          projectImport.entry.id,
        );
        expect(projectListWithLegacyActorSpace.error).toMatch(/not accepted for protected routes/i);
        expect(projectList.map((entry) => entry.entry.id)).not.toContain(
          personalImport.entry.id,
        );
        expect(personalList.map((entry) => entry.entry.id)).toContain(
          personalImport.entry.id,
        );
        expect(personalList.map((entry) => entry.entry.id)).not.toContain(
          projectImport.entry.id,
        );
        expect(mismatchedSpace.error).toMatch(/space context/i);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 15_000);
});
