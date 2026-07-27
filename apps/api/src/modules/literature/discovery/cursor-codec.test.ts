import { describe, expect, it } from "vitest";

import {
  createLiteratureCursorCodec,
  fingerprintLiteratureDiscoveryRequest,
  type LiteratureCursorEncodeInput
} from "./cursor-codec.js";
import { LiteratureCursorError } from "./provider-errors.js";

const secret = "cursor-test-secret-that-is-at-least-32-bytes";
const nowMs = Date.parse("2026-07-18T12:00:00.000Z");
const query = "glioblastoma private query";

function cursorInput(): LiteratureCursorEncodeInput {
  return {
    requestFingerprint: fingerprintLiteratureDiscoveryRequest({
      normalizedQuery: query,
      limit: 20
    }),
    limit: 20,
    page: 2,
    providers: {
      openalex: { status: "active", continuation: "openalex-next" },
      crossref: { status: "exhausted", continuation: null },
      pubmed: { status: "unavailable", continuation: null }
    },
    seenIdentities: [
      { kind: "doi", doi: "10.1000/alpha" },
      { kind: "provider", providerKey: "pubmed", recordKey: "12345678" }
    ]
  };
}

function captureCursorError(operation: () => unknown): LiteratureCursorError {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(LiteratureCursorError);
    if (error instanceof LiteratureCursorError) {
      expect(error.code).toBe("invalid_cursor");
      return error;
    }
    throw error;
  }
  throw new LiteratureCursorError();
}

function decodeBase64UrlText(value: string): string {
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const paddingLength = (4 - base64.length % 4) % 4;
  return atob(`${base64}${"=".repeat(paddingLength)}`);
}

describe("literature discovery cursor codec", () => {
  it("round-trips signed typed state with a fixed fifteen-minute expiry", () => {
    // Given
    const input = cursorInput();
    const codec = createLiteratureCursorCodec({ secret, now: () => nowMs });

    // When
    const cursor = codec.encode(input);
    const decoded = codec.decode(cursor, {
      requestFingerprint: input.requestFingerprint,
      limit: input.limit
    });

    // Then
    expect(decoded).toEqual({
      version: 1,
      expiresAt: nowMs + 15 * 60 * 1_000,
      ...input
    });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
  });

  it("rejects a tampered signature", () => {
    // Given
    const input = cursorInput();
    const codec = createLiteratureCursorCodec({ secret, now: () => nowMs });
    const cursor = codec.encode(input);
    const replacement = cursor.endsWith("A") ? "B" : "A";
    const tampered = `${cursor.slice(0, -1)}${replacement}`;

    // When
    const error = captureCursorError(() => codec.decode(tampered, {
      requestFingerprint: input.requestFingerprint,
      limit: input.limit
    }));

    // Then
    expect(JSON.stringify(error)).not.toContain(secret);
  });

  it("rejects a non-canonical signature that decodes to the authentic bytes", () => {
    // Given
    const input = cursorInput();
    const codec = createLiteratureCursorCodec({ secret, now: () => nowMs });
    const cursor = codec.encode(input);
    const separator = cursor.indexOf(".");
    const payload = cursor.slice(0, separator);
    const signature = cursor.slice(separator + 1);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const lastCharacter = signature[signature.length - 1];
    const lastIndex = lastCharacter === undefined ? -1 : alphabet.indexOf(lastCharacter);
    if (lastIndex < 0 || (lastIndex & 15) !== 0) {
      throw new LiteratureCursorError();
    }
    const replacement = alphabet[lastIndex + 1];
    if (replacement === undefined) {
      throw new LiteratureCursorError();
    }
    const nonCanonicalSignature = `${signature.slice(0, -1)}${replacement}`;
    const nonCanonicalCursor = `${payload}.${nonCanonicalSignature}`;
    expect(Buffer.from(nonCanonicalSignature, "base64url")).toEqual(
      Buffer.from(signature, "base64url")
    );

    // When
    const error = captureCursorError(() => codec.decode(nonCanonicalCursor, {
      requestFingerprint: input.requestFingerprint,
      limit: input.limit
    }));

    // Then
    expect(error.code).toBe("invalid_cursor");
  });

  it("rejects expiry and normalized-request or limit mismatch", () => {
    // Given
    const input = cursorInput();
    const encoder = createLiteratureCursorCodec({ secret, now: () => nowMs });
    const cursor = encoder.encode(input);
    const expired = createLiteratureCursorCodec({
      secret,
      now: () => nowMs + 15 * 60 * 1_000 + 1
    });
    const mismatchedFingerprint = fingerprintLiteratureDiscoveryRequest({
      normalizedQuery: "different query",
      limit: 20
    });

    // When
    const errors = [
      captureCursorError(() => expired.decode(cursor, {
        requestFingerprint: input.requestFingerprint,
        limit: input.limit
      })),
      captureCursorError(() => encoder.decode(cursor, {
        requestFingerprint: mismatchedFingerprint,
        limit: input.limit
      })),
      captureCursorError(() => encoder.decode(cursor, {
        requestFingerprint: input.requestFingerprint,
        limit: 19
      }))
    ];

    // Then
    expect(errors).toHaveLength(3);
  });

  it("rejects oversized encoded input before decoding", () => {
    // Given
    const codec = createLiteratureCursorCodec({ secret, now: () => nowMs });

    // When
    const error = captureCursorError(() => codec.decode("a".repeat(128 * 1024 + 1), {
      requestFingerprint: cursorInput().requestFingerprint,
      limit: 20
    }));

    // Then
    expect(error.code).toBe("invalid_cursor");
  });

  it.each([1, 2])("rejects aggregate discovery cursors below the three-provider minimum (%i)", (limit) => {
    const codec = createLiteratureCursorCodec({ secret, now: () => nowMs });
    const input = cursorInput();

    const error = captureCursorError(() => codec.encode({ ...input, limit }));

    expect(error.code).toBe("invalid_cursor");
  });

  it("enforces page, seen-identity, continuation, and secret bounds", () => {
    // Given
    const codec = createLiteratureCursorCodec({ secret, now: () => nowMs });
    const input = cursorInput();
    const tooManySeen = Array.from(
      { length: 101 },
      (_, index) => ({ kind: "doi" as const, doi: `10.1000/${index}` })
    );

    // When
    const errors = [
      captureCursorError(() => codec.encode({ ...input, page: 6 })),
      captureCursorError(() => codec.encode({ ...input, seenIdentities: tooManySeen })),
      captureCursorError(() => codec.encode({
        ...input,
        providers: {
          ...input.providers,
          openalex: { status: "active", continuation: "é".repeat(1_025) }
        }
      })),
      captureCursorError(() => createLiteratureCursorCodec({ secret: "short" }))
    ];

    // Then
    expect(errors).toHaveLength(4);
  });

  it("stores only a request fingerprint, never query text or provider payload", () => {
    // Given
    const input = cursorInput();
    const codec = createLiteratureCursorCodec({ secret, now: () => nowMs });

    // When
    const cursor = codec.encode(input);
    const payloadPart = cursor.slice(0, cursor.indexOf("."));
    const decodedEnvelope = decodeBase64UrlText(payloadPart);

    // Then
    expect(decodedEnvelope).toContain(input.requestFingerprint);
    expect(decodedEnvelope).not.toContain(query);
    expect(decodedEnvelope).not.toMatch(/providerPayload|responseBody|headers|secret/i);
  });
});
