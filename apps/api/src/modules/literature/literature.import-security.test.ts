import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { RecordingImportService } from "./literature.import-routes.test-fixture.js";
import {
  createInjectedLiteratureImportRouteApp,
  literatureTestCookieName
} from "./literature.routes.test-fixture.js";

const cookie = `${literatureTestCookieName}=session-user-1`;
const idempotencyKey = "99c7be0a-c3ea-4d6e-bd90-c3fca918a1d1";

describe("literature import route security", () => {
  it.each([
    {
      caseName: "prefixed Crossref DOI",
      seed: { providerKey: "crossref", recordKey: "DOI:10.1000/ALPHA(2024)/PART" }
    },
    {
      caseName: "whitespace-padded Crossref DOI",
      seed: { providerKey: "crossref", recordKey: " 10.1000/alpha(2024)/part " }
    },
    {
      caseName: "OpenAlex URL alias",
      seed: { providerKey: "openalex", recordKey: "https://openalex.org/W1" }
    },
    {
      caseName: "prefixed PubMed identifier",
      seed: { providerKey: "pubmed", recordKey: "PMID:42" }
    }
  ] as const)("rejects a noncanonical $caseName before admission", async ({ seed }) => {
    // Given
    const importService = new RecordingImportService();
    const app = await createInjectedLiteratureImportRouteApp(importService);

    try {
      // When
      const response = await app.inject({
        method: "POST",
        url: "/literature/imports",
        headers: { cookie, "idempotency-key": idempotencyKey },
        payload: {
          target: { scope: "personal" },
          seed
        }
      });

      // Then
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "Invalid request" });
      expect(importService.createCalls).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("admits a canonical Crossref seed unchanged", async () => {
    // Given
    const importService = new RecordingImportService();
    const app = await createInjectedLiteratureImportRouteApp(importService);

    try {
      // When
      const response = await app.inject({
        method: "POST",
        url: "/literature/imports",
        headers: { cookie, "idempotency-key": idempotencyKey },
        payload: {
          target: { scope: "personal" },
          seed: {
            providerKey: "crossref",
            recordKey: "10.1000/alpha(2024)/part"
          }
        }
      });

      // Then
      expect(response.statusCode).toBe(201);
      expect(importService.createCalls[0]?.request.seed).toEqual({
        providerKey: "crossref",
        recordKey: "10.1000/alpha(2024)/part"
      });
    } finally {
      await app.close();
    }
  });

  it("does not write unexpected error details to logs", async () => {
    // Given
    const sensitiveMarker = "SECRET_PROVIDER_PAYLOAD_MARKER";
    const sensitiveNameMarker = "SECRET_PROVIDER_ERROR_NAME_MARKER";
    const logChunks: string[] = [];
    const logStream = new Writable({
      write(chunk, _encoding, callback) {
        logChunks.push(chunk.toString());
        callback();
      }
    });
    const importService = new RecordingImportService();
    const unexpectedError = new Error(sensitiveMarker);
    unexpectedError.name = sensitiveNameMarker;
    importService.error = unexpectedError;
    const app = await createInjectedLiteratureImportRouteApp(
      importService,
      { level: "error", stream: logStream }
    );

    try {
      // When
      const response = await app.inject({
        method: "GET",
        url: "/literature/imports/operation-1",
        headers: { cookie }
      });

      // Then
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "Internal Server Error" });
      const serializedLogs = logChunks.join("");
      expect(logChunks.length).toBeGreaterThan(0);
      expect(serializedLogs).toContain('"errorCategory":"unexpected_error"');
      expect(serializedLogs).not.toContain(sensitiveMarker);
      expect(serializedLogs).not.toContain(sensitiveNameMarker);
    } finally {
      await app.close();
    }
  });
});
