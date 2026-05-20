import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  loginAs,
  startTestServer,
  withSessionCookie,
} from "./http-session-test-helpers";

describe("http server phase 2 api", () => {
  it("serves browser-facing jobs, spaces, and credentials APIs through session cookies", async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), "jixia-http-phase2-"));

    try {
      const server = await startTestServer({ JIXIA_STORAGE_ROOT: storageRoot });

      try {
        const aliceCookie = await loginAs(server.url, "user-alice");

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: "shared", name: "Phase 2 Shared" }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then((response) => response.json() as Promise<{ id: string }>);
        expect(createdSpace.id).toEqual(expect.any(String));
        expect(createdSpace.id).not.toHaveLength(0);

        const listedSpaces = await fetch(`${server.url}/api/spaces`, {
          headers: withSessionCookie(aliceCookie),
        }).then((response) => response.json() as Promise<Array<{ id: string }>>);
        expect(listedSpaces.map((space) => space.id)).toContain(createdSpace.id);

        const credential = await fetch(`${server.url}/api/credentials`, {
          body: JSON.stringify({
            provider: "openai",
            rawSecret: "http-phase2-credential-placeholder",
          }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
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
            scope: { id: 'user-alice', type: 'user' },
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then(
          (response) => response.json() as Promise<{ id: string; status: string }>,
        );
        expect(createdJob.status).toBe("queued");

        const jobs = await fetch(
          `${server.url}/api/jobs?scopeType=user&scopeId=user-alice&spaceId=${createdSpace.id}`,
          {
            headers: withSessionCookie(aliceCookie),
          },
        ).then((response) => response.json() as Promise<Array<{ id: string }>>);
        expect(jobs.map((job) => job.id)).toContain(createdJob.id);

        const completedJob = await fetch(`${server.url}/api/jobs/${createdJob.id}/run`, {
          headers: withSessionCookie(aliceCookie),
          method: "POST",
        }).then((response) => response.json() as Promise<{ status: string }>);
        expect(completedJob.status).toBe("succeeded");

        const events = await fetch(`${server.url}/api/jobs/${createdJob.id}/events`, {
          headers: withSessionCookie(aliceCookie),
        }).then(
          (response) => response.json() as Promise<Array<{ status: string }>>,
        );
        expect(events.map((event) => event.status)).toEqual([
          "queued",
          "running",
          "succeeded",
        ]);

        const cancellableJob = await fetch(`${server.url}/api/jobs`, {
          body: JSON.stringify({
            credentialRef: credential.credentialRef,
            kind: "ai.summary",
            payload: { prompt: "Phase 2 cancellation over HTTP." },
            scope: { id: "user-alice", type: "user" },
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            "Content-Type": "application/json",
          }),
          method: "POST",
        }).then(
          (response) => response.json() as Promise<{ id: string; status: string }>,
        );
        const cancelledJob = await fetch(`${server.url}/api/jobs/${cancellableJob.id}/cancel`, {
          headers: withSessionCookie(aliceCookie),
          method: "POST",
        }).then((response) => response.json() as Promise<{ status: string }>);
        expect(cancelledJob.status).toBe("cancelled");

        const cancelledEvents = await fetch(`${server.url}/api/jobs/${cancellableJob.id}/events`, {
          headers: withSessionCookie(aliceCookie),
        }).then(
          (response) => response.json() as Promise<Array<{ status: string }>>,
        );
        expect(cancelledEvents.map((event) => event.status)).toEqual([
          "queued",
          "cancelled",
        ]);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
