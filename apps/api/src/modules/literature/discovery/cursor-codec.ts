/// <reference types="node" />

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  literatureDiscoveryMaxLimit,
  literatureDiscoveryMinLimit,
  literatureSearchProviderKeys,
  type LiteratureSearchProviderKey
} from "@jixia/shared";
import { z } from "zod";

import { LiteratureCursorError } from "./provider-errors.js";

export type LiteratureCursorSeenIdentity =
  | { readonly kind: "doi"; readonly doi: string }
  | {
      readonly kind: "provider";
      readonly providerKey: LiteratureSearchProviderKey;
      readonly recordKey: string;
    };

export type LiteratureCursorProviderState =
  | { readonly status: "active"; readonly continuation: string | null }
  | { readonly status: "exhausted"; readonly continuation: null }
  | {
      readonly status: "rate_limited" | "unavailable" | "unconfigured";
      readonly continuation: null;
    };

export type LiteratureCursorState = {
  readonly version: 1;
  readonly expiresAt: number;
  readonly requestFingerprint: string;
  readonly limit: number;
  readonly page: number;
  readonly providers: Readonly<Record<LiteratureSearchProviderKey, LiteratureCursorProviderState>>;
  readonly seenIdentities: readonly LiteratureCursorSeenIdentity[];
};

export type LiteratureCursorEncodeInput = Omit<LiteratureCursorState, "version" | "expiresAt">;

export type LiteratureCursorCodec = {
  readonly encode: (input: LiteratureCursorEncodeInput) => string;
  readonly decode: (
    cursor: string,
    expected: { readonly requestFingerprint: string; readonly limit: number }
  ) => LiteratureCursorState;
};

const cursorLifetimeMs = 15 * 60 * 1_000;
const maximumCursorBytes = 128 * 1024;
const maximumContinuationBytes = 2 * 1024;
export const literatureDiscoveryMaximumSeenIdentities = 100;
const maximumCursorPage = 5;
const minimumCursorSecretBytes = 32;
const textEncoder = new TextEncoder();
const base64UrlPattern = /^[A-Za-z0-9_-]+$/u;

const boundedContinuationSchema = z.string().refine(
  (value) => textEncoder.encode(value).byteLength <= maximumContinuationBytes
);
const providerStateSchema = z.union([
  z.object({
    status: z.literal("active"),
    continuation: boundedContinuationSchema.nullable()
  }).strict(),
  z.object({ status: z.literal("exhausted"), continuation: z.null() }).strict(),
  z.object({
    status: z.enum(["rate_limited", "unavailable", "unconfigured"]),
    continuation: z.null()
  }).strict()
]);
const seenIdentitySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("doi"),
    doi: z.string().trim().min(1).refine((value) => textEncoder.encode(value).byteLength <= 512)
  }).strict(),
  z.object({
    kind: z.literal("provider"),
    providerKey: z.enum(literatureSearchProviderKeys),
    recordKey: z.string().trim().min(1).refine(
      (value) => textEncoder.encode(value).byteLength <= 512
    )
  }).strict()
]);
const cursorEncodeInputSchema = z.object({
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  limit: z.number().int().min(literatureDiscoveryMinLimit).max(literatureDiscoveryMaxLimit),
  page: z.number().int().min(1).max(maximumCursorPage),
  providers: z.object({
    openalex: providerStateSchema,
    crossref: providerStateSchema,
    pubmed: providerStateSchema
  }).strict(),
  seenIdentities: z.array(seenIdentitySchema).max(literatureDiscoveryMaximumSeenIdentities)
}).strict();
const cursorStateSchema = cursorEncodeInputSchema.extend({
  version: z.literal(1),
  expiresAt: z.number().int().nonnegative()
}).strict();

export function fingerprintLiteratureDiscoveryRequest(input: {
  readonly normalizedQuery: string;
  readonly limit: number;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([input.normalizedQuery, input.limit]), "utf8")
    .digest("hex");
}

export function createLiteratureCursorCodec(input: {
  readonly secret: string;
  readonly now?: () => number;
}): LiteratureCursorCodec {
  if (textEncoder.encode(input.secret).byteLength < minimumCursorSecretBytes) {
    throw new LiteratureCursorError();
  }
  const now = input.now ?? Date.now;

  return {
    encode(value) {
      const parsed = cursorEncodeInputSchema.safeParse(value);
      if (!parsed.success) {
        throw new LiteratureCursorError();
      }
      const state: LiteratureCursorState = {
        version: 1,
        expiresAt: now() + cursorLifetimeMs,
        ...parsed.data
      };
      const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
      const cursor = `${payload}.${signCursorPayload(payload, input.secret)}`;
      if (textEncoder.encode(cursor).byteLength > maximumCursorBytes) {
        throw new LiteratureCursorError();
      }
      return cursor;
    },
    decode(cursor, expected) {
      if (textEncoder.encode(cursor).byteLength > maximumCursorBytes) {
        throw new LiteratureCursorError();
      }
      const parts = cursor.split(".");
      const payload = parts[0];
      const signature = parts[1];
      if (
        parts.length !== 2 || payload === undefined || signature === undefined ||
        !base64UrlPattern.test(payload) || !base64UrlPattern.test(signature)
      ) {
        throw new LiteratureCursorError();
      }
      const payloadBytes = Buffer.from(payload, "base64url");
      if (payloadBytes.toString("base64url") !== payload) {
        throw new LiteratureCursorError();
      }
      const expectedSignature = signCursorPayload(payload, input.secret);
      if (!cursorSignaturesMatch(signature, expectedSignature)) {
        throw new LiteratureCursorError();
      }

      let decoded: unknown;
      try {
        decoded = JSON.parse(payloadBytes.toString("utf8"));
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new LiteratureCursorError();
        }
        throw error;
      }
      const parsed = cursorStateSchema.safeParse(decoded);
      if (
        !parsed.success || parsed.data.expiresAt <= now() ||
        parsed.data.requestFingerprint !== expected.requestFingerprint ||
        parsed.data.limit !== expected.limit
      ) {
        throw new LiteratureCursorError();
      }
      return parsed.data;
    }
  };
}

function signCursorPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function cursorSignaturesMatch(received: string, expected: string): boolean {
  const receivedBytes = Buffer.from(received, "base64url");
  if (receivedBytes.toString("base64url") !== received) {
    return false;
  }
  const expectedBytes = Buffer.from(expected, "base64url");
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}
