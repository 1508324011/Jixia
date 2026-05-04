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

async function createSharedSpace(serverUrl: string, actorUserId: string) {
  const response = await fetch(`${serverUrl}/api/spaces`, {
    body: JSON.stringify({ kind: "shared", name: `${actorUserId} shared` }),
    headers: {
      "Content-Type": "application/json",
      "x-jixia-actor": actorUserId,
    },
    method: "POST",
  });

  return (await response.json()) as { id: string };
}

async function createCredential(serverUrl: string, actorUserId: string) {
  const response = await fetch(`${serverUrl}/api/credentials`, {
    body: JSON.stringify({
      provider: "openai",
      rawSecret: `${actorUserId}-credential-placeholder`,
    }),
    headers: {
      "Content-Type": "application/json",
      "x-jixia-actor": actorUserId,
    },
    method: "POST",
  });

  return (await response.json()) as { credentialRef: string };
}

async function importPaper(
  serverUrl: string,
  actorUserId: string,
  spaceId: string,
) {
  const response = await fetch(`${serverUrl}/api/import/paper`, {
    body: JSON.stringify({
      sourceLocator: `10.1000/${actorUserId}-actor-boundary`,
      sourceType: "doi",
      spaceId,
      visibility: "space_shared",
    }),
    headers: {
      "Content-Type": "application/json",
      "x-jixia-actor": actorUserId,
    },
    method: "POST",
  });

  return (await response.json()) as { entry: { id: string } };
}

async function createJob(
  serverUrl: string,
  actorUserId: string,
  credentialRef: string,
  spaceId: string,
) {
  const response = await fetch(`${serverUrl}/api/jobs`, {
    body: JSON.stringify({
      credentialRef,
      kind: "ai.summary",
      payload: { prompt: `Summarize for ${actorUserId}.` },
      spaceId,
    }),
    headers: {
      "Content-Type": "application/json",
      "x-jixia-actor": actorUserId,
    },
    method: "POST",
  });

  return (await response.json()) as { id: string };
}

describe("http server actor boundary cleanup", () => {
  it("rejects conflicting actor transport headers on protected routes", async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), "jixia-http-actor-conflict-"));

    try {
      const server = await startTestServer(storageRoot);

      try {
        const response = await fetch(`${server.url}/api/spaces`, {
          headers: {
            Authorization: "Bearer user-bob",
            "x-jixia-actor": " user-alice ",
          },
        });

        expect(response.status).toBe(400);
        expect(response.headers.get("content-type")).toContain(
          "application/json",
        );
        await expect(response.json()).resolves.toMatchObject({
          error: expect.stringMatching(/conflicting actor sessions/i),
        });
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it("returns 401 when protected routes have no server-derived actor", async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), "jixia-http-actor-401-"));

    try {
      const server = await startTestServer(storageRoot);

      try {
        const [
          spaces,
          memberships,
          credentials,
          libraryList,
          libraryEntry,
          importPaperResponse,
          reading,
          note,
          insight,
          jobs,
          createJobResponse,
          jobDetail,
          jobRun,
          jobEvents,
          jobAudit,
          jobStream,
        ] =
          await Promise.all([
            fetch(`${server.url}/api/spaces`),
            fetch(`${server.url}/api/spaces/space-1/memberships`),
            fetch(`${server.url}/api/credentials`),
            fetch(`${server.url}/api/library?spaceId=space-1`),
            fetch(`${server.url}/api/library/entry-1`),
            fetch(`${server.url}/api/import/paper`, {
              body: JSON.stringify({
                sourceLocator: "10.1000/unauthorized",
                sourceType: "doi",
                spaceId: "space-1",
                visibility: "space_shared",
              }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            }),
            fetch(`${server.url}/api/reading/entry-1`),
            fetch(`${server.url}/api/reading/notes`, {
              body: JSON.stringify({
                body: "Unauthorized note",
                libraryEntryId: "entry-1",
                visibility: "private",
              }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            }),
            fetch(`${server.url}/api/reading/insights`, {
              body: JSON.stringify({
                evidenceSpans: [],
                libraryEntryId: "entry-1",
                summary: "Unauthorized insight",
                title: "Unauthorized",
              }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            }),
            fetch(`${server.url}/api/jobs`),
            fetch(`${server.url}/api/jobs`, {
              body: JSON.stringify({
                credentialRef: "cred-1",
                kind: "ai.summary",
                payload: { prompt: "Unauthorized" },
                spaceId: "space-1",
              }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            }),
            fetch(`${server.url}/api/jobs/job-1`),
            fetch(`${server.url}/api/jobs/job-1/run`, {
              method: "POST",
            }),
            fetch(`${server.url}/api/jobs/job-1/events`),
            fetch(`${server.url}/api/jobs/job-1/audit`),
            fetch(`${server.url}/api/jobs/job-1/stream`),
          ]);

        for (const response of [
          spaces,
          memberships,
          credentials,
          libraryList,
          libraryEntry,
          importPaperResponse,
          reading,
          note,
          insight,
          jobs,
          createJobResponse,
          jobDetail,
          jobRun,
          jobEvents,
          jobAudit,
          jobStream,
        ]) {
          expect(response.status).toBe(401);
        }
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it("rejects spoofed legacy actor fields and actor query authority across protected routes", async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), "jixia-http-actor-400-"));

    try {
      const server = await startTestServer(storageRoot);

      try {
        const createdSpace = await createSharedSpace(server.url, "user-alice");
        const importedRecord = await importPaper(
          server.url,
          "user-alice",
          createdSpace.id,
        );
        const credential = await createCredential(server.url, "user-alice");
        const job = await createJob(
          server.url,
          "user-alice",
          credential.credentialRef,
          createdSpace.id,
        );

        const responses = await Promise.all([
          fetch(`${server.url}/api/spaces?actorUserId=user-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/spaces?actorUserId=user-bob`, {
            body: JSON.stringify({
              actorUserId: "user-bob",
              kind: "shared",
              name: "Mismatch",
            }),
            headers: {
              "Content-Type": "application/json",
              "x-jixia-actor": "user-alice",
            },
            method: "POST",
          }),
          fetch(`${server.url}/api/library?spaceId=${createdSpace.id}&actorUserId=user-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/library?spaceId=${createdSpace.id}&actorSpaceId=space-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/library/${importedRecord.entry.id}?actorUserId=user-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/library/${importedRecord.entry.id}?actorSpaceId=space-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/import/paper`, {
            body: JSON.stringify({
              requestedByUserId: "user-bob",
              sourceLocator: "10.1000/spoof-import",
              sourceType: "doi",
              spaceId: createdSpace.id,
              visibility: "space_shared",
            }),
            headers: {
              "Content-Type": "application/json",
              "x-jixia-actor": "user-alice",
            },
            method: "POST",
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}?actorUserId=user-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}?actorSpaceId=space-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/reading/notes`, {
            body: JSON.stringify({
              authorUserId: "user-bob",
              body: "Spoofed note",
              libraryEntryId: importedRecord.entry.id,
              visibility: "private",
            }),
            headers: {
              "Content-Type": "application/json",
              "x-jixia-actor": "user-alice",
            },
            method: "POST",
          }),
          fetch(`${server.url}/api/reading/notes`, {
            body: JSON.stringify({
              actorSpaceId: "space-bob",
              body: "Wrong space note",
              libraryEntryId: importedRecord.entry.id,
              visibility: "private",
            }),
            headers: {
              "Content-Type": "application/json",
              "x-jixia-actor": "user-alice",
            },
            method: "POST",
          }),
          fetch(`${server.url}/api/reading/insights`, {
            body: JSON.stringify({
              evidenceSpans: [],
              libraryEntryId: importedRecord.entry.id,
              startedByUserId: "user-bob",
              summary: "Spoofed insight",
              title: "Spoofed",
            }),
            headers: {
              "Content-Type": "application/json",
              "x-jixia-actor": "user-alice",
            },
            method: "POST",
          }),
          fetch(`${server.url}/api/reading/insights`, {
            body: JSON.stringify({
              actorSpaceId: "space-bob",
              evidenceSpans: [],
              libraryEntryId: importedRecord.entry.id,
              summary: "Wrong space insight",
              title: "Wrong Space",
            }),
            headers: {
              "Content-Type": "application/json",
              "x-jixia-actor": "user-alice",
            },
            method: "POST",
          }),
          fetch(`${server.url}/api/credentials?userId=user-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/credentials`, {
            body: JSON.stringify({
              provider: "openai",
              rawSecret: "spoofed-secret",
              userId: "user-bob",
            }),
            headers: {
              "Content-Type": "application/json",
              "x-jixia-actor": "user-alice",
            },
            method: "POST",
          }),
          fetch(`${server.url}/api/jobs?actorUserId=user-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/jobs?spaceId=${createdSpace.id}&actorSpaceId=space-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/jobs?actorSpaceId=space-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/jobs`, {
            body: JSON.stringify({
              credentialRef: credential.credentialRef,
              kind: "ai.summary",
              payload: { prompt: "Spoofed job" },
              requestedByUserId: "user-bob",
              spaceId: createdSpace.id,
            }),
            headers: {
              "Content-Type": "application/json",
              "x-jixia-actor": "user-alice",
            },
            method: "POST",
          }),
          fetch(`${server.url}/api/jobs/${job.id}?actorUserId=user-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/jobs/${job.id}?actorSpaceId=space-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/jobs/${job.id}/run`, {
            body: JSON.stringify({ actorUserId: "user-bob" }),
            headers: {
              "Content-Type": "application/json",
              "x-jixia-actor": "user-alice",
            },
            method: "POST",
          }),
          fetch(`${server.url}/api/jobs/${job.id}/run`, {
            body: JSON.stringify({ actorSpaceId: "space-bob" }),
            headers: {
              "Content-Type": "application/json",
              "x-jixia-actor": "user-alice",
            },
            method: "POST",
          }),
          fetch(`${server.url}/api/jobs/${job.id}/events?actorUserId=user-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/jobs/${job.id}/events?actorSpaceId=space-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/jobs/${job.id}/audit?actorUserId=user-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/jobs/${job.id}/audit?actorSpaceId=space-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/jobs/${job.id}/stream?actorUserId=user-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/jobs/${job.id}/stream?actorSpaceId=space-bob`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
        ]);

        for (const response of responses) {
          expect(response.status).toBe(400);
        }
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it("allows protected routes with only server-derived actor headers and blocks non-member membership reads", async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), "jixia-http-actor-success-"));

    try {
      const server = await startTestServer(storageRoot);

      try {
        const createdSpace = await createSharedSpace(server.url, "user-alice");
        const importedRecord = await importPaper(
          server.url,
          "user-alice",
          createdSpace.id,
        );
        const credential = await createCredential(server.url, "user-alice");
        const job = await createJob(
          server.url,
          "user-alice",
          credential.credentialRef,
          createdSpace.id,
        );

        const [
          spaces,
          memberships,
          credentials,
          library,
          reading,
          note,
          insight,
          jobs,
          jobRecord,
          runJob,
          events,
          audit,
        ] = await Promise.all([
          fetch(`${server.url}/api/spaces`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/spaces/${createdSpace.id}/memberships`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/credentials`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/library?spaceId=${createdSpace.id}`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/reading/notes`, {
            body: JSON.stringify({
              body: "Actor-owned note",
              libraryEntryId: importedRecord.entry.id,
              visibility: "private",
            }),
            headers: {
              "Content-Type": "application/json",
              "x-jixia-actor": "user-alice",
            },
            method: "POST",
          }),
          fetch(`${server.url}/api/reading/insights`, {
            body: JSON.stringify({
              evidenceSpans: [],
              libraryEntryId: importedRecord.entry.id,
              summary: "Actor-owned insight",
              title: "Insight",
            }),
            headers: {
              "Content-Type": "application/json",
              "x-jixia-actor": "user-alice",
            },
            method: "POST",
          }),
          fetch(`${server.url}/api/jobs?spaceId=${createdSpace.id}`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/jobs/${job.id}`, {
            headers: { Authorization: "Bearer user-alice" },
          }),
          fetch(`${server.url}/api/jobs/${job.id}/run`, {
            headers: { Authorization: "Bearer user-alice" },
            method: "POST",
          }),
          fetch(`${server.url}/api/jobs/${job.id}/events`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
          fetch(`${server.url}/api/jobs/${job.id}/audit`, {
            headers: { "x-jixia-actor": "user-alice" },
          }),
        ]);

        const stream = await fetch(`${server.url}/api/jobs/${job.id}/stream`, {
          headers: { "x-jixia-actor": "user-alice" },
        });
        const unauthorizedStream = await fetch(
          `${server.url}/api/jobs/${job.id}/stream`,
          { headers: { "x-jixia-actor": "user-bob" } },
        );

        expect(spaces.status).toBe(200);
        expect(memberships.status).toBe(200);
        expect(credentials.status).toBe(200);
        expect(library.status).toBe(200);
        expect(reading.status).toBe(200);
        expect(note.status).toBe(200);
        expect(insight.status).toBe(200);
        expect(jobs.status).toBe(200);
        expect(jobRecord.status).toBe(200);
        expect(runJob.status).toBe(200);
        expect(events.status).toBe(200);
        expect(audit.status).toBe(200);
        expect(stream.status).toBe(200);
        expect(unauthorizedStream.status).toBe(403);
        expect(unauthorizedStream.headers.get("content-type")).toContain(
          "application/json",
        );
        stream.body?.cancel().catch(() => undefined);

        const membershipsPayload = (await memberships.json()) as Array<{ userId: string }>;
        expect(membershipsPayload.map((entry) => entry.userId)).toEqual(["user-alice"]);

        const notePayload = (await note.json()) as { authorUserId: string };
        expect(notePayload.authorUserId).toBe("user-alice");

        const insightPayload = (await insight.json()) as { summary: string };
        expect(insightPayload.summary).toBe("Actor-owned insight");

        const unauthorizedMemberships = await fetch(
          `${server.url}/api/spaces/${createdSpace.id}/memberships`,
          { headers: { "x-jixia-actor": "user-bob" } },
        );
        expect(unauthorizedMemberships.status).toBe(403);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 10_000);
});
