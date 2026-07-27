import { describe, expect, it } from "vitest";

import {
  createLiteratureLibraryCursorCodec,
  fingerprintLiteratureLibraryRequest,
  LiteratureLibraryCursorError
} from "./literature.library-cursor.js";

const secret = "library-cursor-secret-that-is-at-least-32-bytes";
const nowMs = Date.parse("2026-07-20T12:00:00.000Z");
const actor = { userId: "user-1", spaceId: "space-1", spaceRole: "SpaceMember" as const };

function fingerprint(input: {
  readonly userId?: string;
  readonly scope?: { readonly kind: "personal" } | { readonly kind: "project"; readonly projectId: string };
  readonly limit?: number;
} = {}): string {
  return fingerprintLiteratureLibraryRequest({
    actor: { ...actor, userId: input.userId ?? actor.userId },
    scope: input.scope ?? { kind: "personal" },
    limit: input.limit ?? 20
  });
}

function expectCursorError(operation: () => unknown): void {
  expect(operation).toThrow(LiteratureLibraryCursorError);
}

describe("literature library cursor codec", () => {
  it("round-trips a signed descending keyset anchor", () => {
    // Given
    const codec = createLiteratureLibraryCursorCodec({ secret, now: () => nowMs });
    const requestFingerprint = fingerprint();
    const anchor = {
      createdAt: new Date("2026-07-20T11:00:00.000Z"),
      id: "literature-20"
    };

    // When
    const cursor = codec.encode({ requestFingerprint, limit: 20, anchor });
    const decoded = codec.decode(cursor, { requestFingerprint, limit: 20 });

    // Then
    expect(decoded).toEqual(anchor);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
  });

  it("rejects signature tampering, expiry, and malformed envelopes", () => {
    // Given
    const encoder = createLiteratureLibraryCursorCodec({ secret, now: () => nowMs });
    const requestFingerprint = fingerprint();
    const cursor = encoder.encode({
      requestFingerprint,
      limit: 20,
      anchor: { createdAt: new Date(nowMs), id: "literature-1" }
    });
    const replacement = cursor.endsWith("A") ? "B" : "A";
    const expired = createLiteratureLibraryCursorCodec({
      secret,
      now: () => nowMs + 15 * 60 * 1_000
    });

    // When / Then
    expectCursorError(() => encoder.decode(`${cursor.slice(0, -1)}${replacement}`, {
      requestFingerprint,
      limit: 20
    }));
    expectCursorError(() => expired.decode(cursor, { requestFingerprint, limit: 20 }));
    expectCursorError(() => encoder.decode("not-a-valid-envelope", {
      requestFingerprint,
      limit: 20
    }));
    expectCursorError(() => encoder.decode("a".repeat(8_193), {
      requestFingerprint,
      limit: 20
    }));
  });

  it("binds cursors to actor, scope, project, and limit", () => {
    // Given
    const codec = createLiteratureLibraryCursorCodec({ secret, now: () => nowMs });
    const requestFingerprint = fingerprint({
      scope: { kind: "project", projectId: "project-1" }
    });
    const cursor = codec.encode({
      requestFingerprint,
      limit: 20,
      anchor: { createdAt: new Date(nowMs), id: "literature-1" }
    });

    // When / Then
    for (const mismatch of [
      fingerprint({ userId: "user-2", scope: { kind: "project", projectId: "project-1" } }),
      fingerprint({ scope: { kind: "personal" } }),
      fingerprint({ scope: { kind: "project", projectId: "project-2" } })
    ]) {
      expectCursorError(() => codec.decode(cursor, {
        requestFingerprint: mismatch,
        limit: 20
      }));
    }
    expectCursorError(() => codec.decode(cursor, { requestFingerprint, limit: 19 }));
  });

  it("rejects weak secrets and invalid anchors before emitting a cursor", () => {
    // Given
    const codec = createLiteratureLibraryCursorCodec({ secret, now: () => nowMs });

    // When / Then
    expectCursorError(() => createLiteratureLibraryCursorCodec({ secret: "short" }));
    expectCursorError(() => codec.encode({
      requestFingerprint: fingerprint(),
      limit: 20,
      anchor: { createdAt: new Date(Number.NaN), id: "literature-1" }
    }));
  });
});
