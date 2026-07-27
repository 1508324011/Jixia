import type { Prisma } from "@jixia/db/generated";

import { AuditError } from "./audit.errors.js";

type MetadataOnlyAuditPayload = Record<string, unknown> & Prisma.InputJsonObject;

const forbiddenExactKeys = new Set([
  "apikey",
  "attachmentbody",
  "attachmentcontent",
  "authorization",
  "authorizationheader",
  "body",
  "content",
  "contentsnapshot",
  "cookie",
  "credentials",
  "documentbody",
  "documentcontent",
  "documentsnapshot",
  "draftcontent",
  "encryptedapikey",
  "filebody",
  "filecontent",
  "headers",
  "objectkey",
  "objectstoragecredentials",
  "password",
  "providerpayloadbody",
  "rawtoken",
  "requestbody",
  "requestheaders",
  "requiredheaders",
  "response",
  "selectedcontextbody",
  "sessionid",
  "signedurl",
  "storagecredentials",
  "storagekey",
  "token",
  "versionsnapshot"
]);

const forbiddenKeyFragments = [
  "apikey",
  "authorization",
  "body",
  "content",
  "credential",
  "cookie",
  "encryptedapikey",
  "header",
  "password",
  "prompt",
  "response",
  "signedurl",
  "token"
] as const;

const forbiddenStringFragments = [
  "awsaccesskeyid=",
  "bearer ",
  "x-amz-credential=",
  "x-amz-signature=",
  "x-goog-signature="
] as const;

function invalidPayload(message = "Invalid audit payload"): AuditError {
  return new AuditError(message, 400);
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainRecordObject(value: unknown): value is Record<string, unknown> {
  if (!isRecordObject(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isForbiddenAuditKey(key: string): boolean {
  const normalizedKey = key
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  return (
    forbiddenExactKeys.has(normalizedKey) ||
    forbiddenKeyFragments.some((fragment) => normalizedKey.includes(fragment))
  );
}

function assertJsonScalar(value: unknown): void {
  if (typeof value === "string") {
    const normalizedValue = value.normalize("NFKC").toLowerCase();
    if (forbiddenStringFragments.some((fragment) => normalizedValue.includes(fragment))) {
      throw invalidPayload("Audit payload contains forbidden data");
    }
    return;
  }

  if (value === null || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return;
  }

  throw invalidPayload();
}

export function ensureMetadataOnlyAuditPayload(
  payload: Record<string, unknown>
): asserts payload is MetadataOnlyAuditPayload {
  const visited = new WeakSet<object>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      if (visited.has(value)) {
        throw invalidPayload();
      }
      visited.add(value);
      value.forEach(visit);
      return;
    }

    if (!isRecordObject(value)) {
      assertJsonScalar(value);
      return;
    }

    if (!isPlainRecordObject(value) || visited.has(value)) {
      throw invalidPayload();
    }
    visited.add(value);

    for (const [key, child] of Object.entries(value)) {
      if (isForbiddenAuditKey(key)) {
        throw invalidPayload("Audit payload contains forbidden data");
      }
      visit(child);
    }
  };

  if (!isPlainRecordObject(payload)) {
    throw invalidPayload();
  }
  visit(payload);
}

export function parseMetadataOnlyAuditPayload(value: unknown): MetadataOnlyAuditPayload {
  if (!isRecordObject(value)) {
    throw new AuditError("Audit event unavailable", 500);
  }
  ensureMetadataOnlyAuditPayload(value);
  return value;
}
