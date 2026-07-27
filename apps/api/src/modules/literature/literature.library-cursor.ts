/// <reference types="node" />

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { literatureLibraryMaxLimit } from "@jixia/shared";
import { z } from "zod";

import type { LiteratureActor, LiteratureListAnchor, LiteratureListScope } from "./literature.repository.js";

const cursorLifetimeMs = 15 * 60 * 1_000;
const maximumCursorBytes = 8 * 1_024;
const minimumCursorSecretBytes = 32;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/u;
const textEncoder = new TextEncoder();

const cursorStateSchema = z.object({
  version: z.literal(1),
  expiresAt: z.number().int().nonnegative(),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  limit: z.number().int().min(1).max(literatureLibraryMaxLimit),
  createdAt: z.iso.datetime().refine((value) => new Date(value).toISOString() === value),
  id: z.string().min(1).max(64)
}).strict();

export type LiteratureLibraryCursorCodec = {
  readonly encode: (input: {
    readonly requestFingerprint: string;
    readonly limit: number;
    readonly anchor: LiteratureListAnchor;
  }) => string;
  readonly decode: (
    cursor: string,
    expected: { readonly requestFingerprint: string; readonly limit: number }
  ) => LiteratureListAnchor;
};

export class LiteratureLibraryCursorError extends Error {
  readonly name = "LiteratureLibraryCursorError";
}

export function fingerprintLiteratureLibraryRequest(input: {
  readonly actor: LiteratureActor;
  readonly scope: LiteratureListScope;
  readonly limit: number;
}): string {
  const projectId = input.scope.kind === "project" ? input.scope.projectId : null;
  return createHash("sha256")
    .update(JSON.stringify([input.actor.userId, input.scope.kind, projectId, input.limit]), "utf8")
    .digest("hex");
}

export function createLiteratureLibraryCursorCodec(input: {
  readonly secret: string;
  readonly now?: () => number;
}): LiteratureLibraryCursorCodec {
  if (textEncoder.encode(input.secret).byteLength < minimumCursorSecretBytes) {
    throw new LiteratureLibraryCursorError();
  }
  const now = input.now ?? Date.now;

  return {
    encode(value) {
      if (
        !(value.anchor.createdAt instanceof Date) ||
        !Number.isFinite(value.anchor.createdAt.getTime())
      ) {
        throw new LiteratureLibraryCursorError();
      }
      const parsed = cursorStateSchema.safeParse({
        version: 1,
        expiresAt: now() + cursorLifetimeMs,
        requestFingerprint: value.requestFingerprint,
        limit: value.limit,
        createdAt: value.anchor.createdAt.toISOString(),
        id: value.anchor.id
      });
      if (!parsed.success) {
        throw new LiteratureLibraryCursorError();
      }
      const payload = Buffer.from(JSON.stringify(parsed.data), "utf8").toString("base64url");
      const cursor = `${payload}.${sign(payload, input.secret)}`;
      if (textEncoder.encode(cursor).byteLength > maximumCursorBytes) {
        throw new LiteratureLibraryCursorError();
      }
      return cursor;
    },
    decode(cursor, expected) {
      const state = decodeCursor(cursor, input.secret);
      if (
        state.expiresAt <= now() ||
        state.requestFingerprint !== expected.requestFingerprint ||
        state.limit !== expected.limit
      ) {
        throw new LiteratureLibraryCursorError();
      }
      return { createdAt: new Date(state.createdAt), id: state.id };
    }
  };
}

function decodeCursor(cursor: string, secret: string): z.infer<typeof cursorStateSchema> {
  if (textEncoder.encode(cursor).byteLength > maximumCursorBytes) {
    throw new LiteratureLibraryCursorError();
  }
  const parts = cursor.split(".");
  const payload = parts[0];
  const signature = parts[1];
  if (
    parts.length !== 2 || payload === undefined || signature === undefined ||
    !base64UrlPattern.test(payload) || !base64UrlPattern.test(signature)
  ) {
    throw new LiteratureLibraryCursorError();
  }
  const payloadBytes = Buffer.from(payload, "base64url");
  if (
    payloadBytes.toString("base64url") !== payload ||
    !signaturesMatch(signature, sign(payload, secret))
  ) {
    throw new LiteratureLibraryCursorError();
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(payloadBytes.toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new LiteratureLibraryCursorError();
    }
    throw error;
  }
  const parsed = cursorStateSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new LiteratureLibraryCursorError();
  }
  return parsed.data;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function signaturesMatch(received: string, expected: string): boolean {
  const receivedBytes = Buffer.from(received, "base64url");
  const expectedBytes = Buffer.from(expected, "base64url");
  return receivedBytes.toString("base64url") === received &&
    receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}
