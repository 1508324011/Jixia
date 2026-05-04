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

describe("http server phase 2 api", () => {
  it("serves browser-facing jobs, spaces, and credentials APIs", async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), "jixia-http-phase2-"));

    try {
      const server = await startTestServer(storageRoot);

      try {
        const createdSpace = await fetch(
          `${server.url}/api/spaces?actorUserId=user-alice`,
          {
            body: JSON.stringify({ kind: "shared", name: "Phase 2 Shared" }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
        ).then((response) => response.json() as Promise<{ id: string }>);
        expect(createdSpace.id).toMatch(/^space-/);

        const listedSpaces = await fetch(
          `${server.url}/api/spaces?actorUserId=user-alice`,
        ).then((response) => response.json() as Promise<Array<{ id: string }>>);
        expect(listedSpaces.map((space) => space.id)).toContain(
          createdSpace.id,
        );

        const credential = await fetch(`${server.url}/api/credentials`, {
          body: JSON.stringify({
            provider: "openai",
            rawSecret: "http-phase2-credential-placeholder",
            userId: "user-alice",
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }).then(
          (response) => response.json() as Promise<{ credentialRef: string }>,
        );
        expect(credential.credentialRef).toMatch(/^cred-/);

        const createdJob = await fetch(`${server.url}/api/jobs`, {
          body: JSON.stringify({
            credentialRef: credential.credentialRef,
            kind: "ai.summary",
            payload: { prompt: "Phase 2 over HTTP." },
            requestedByUserId: "user-alice",
            spaceId: createdSpace.id,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }).then(
          (response) =>
            response.json() as Promise<{ id: string; status: string }>,
        );
        expect(createdJob.status).toBe("queued");

        const jobs = await fetch(
          `${server.url}/api/jobs?actorSpaceId=${createdSpace.id}&actorUserId=user-alice`,
        ).then((response) => response.json() as Promise<Array<{ id: string }>>);
        expect(jobs.map((job) => job.id)).toContain(createdJob.id);

        const completedJob = await fetch(
          `${server.url}/api/jobs/${createdJob.id}/run`,
          {
            body: JSON.stringify({
              actorSpaceId: createdSpace.id,
              actorUserId: "user-alice",
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
        ).then((response) => response.json() as Promise<{ status: string }>);
        expect(completedJob.status).toBe("succeeded");

        const events = await fetch(
          `${server.url}/api/jobs/${createdJob.id}/events?actorSpaceId=${createdSpace.id}&actorUserId=user-alice`,
        ).then(
          (response) => response.json() as Promise<Array<{ status: string }>>,
        );
        expect(events.map((event) => event.status)).toEqual([
          "queued",
          "running",
          "succeeded",
        ]);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
