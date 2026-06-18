import { createHmac, createHash } from "node:crypto";

import {
  CleanupUploadIntentStorageError,
  type CleanupUploadIntentStorage
} from "./jobs/cleanup-upload-intents.js";

type CleanupObjectStorageConfig = {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
};

const serviceName = "s3";
const unsignedPayload = "UNSIGNED-PAYLOAD";

function requireConfigValue(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];

  if (!value) {
    throw new CleanupUploadIntentStorageError("Object storage configuration is incomplete");
  }

  return value;
}

function configFromEnv(env: NodeJS.ProcessEnv = process.env): CleanupObjectStorageConfig {
  return {
    endpoint: requireConfigValue(env, "S3_ENDPOINT"),
    region: requireConfigValue(env, "S3_REGION"),
    bucket: requireConfigValue(env, "S3_BUCKET"),
    accessKeyId: requireConfigValue(env, "S3_ACCESS_KEY_ID"),
    secretAccessKey: requireConfigValue(env, "S3_SECRET_ACCESS_KEY")
  };
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hexHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function toDateStamp(date: Date): string {
  return toAmzDate(date).slice(0, 8);
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeStorageKey(storageKey: string): string {
  return storageKey.split("/").map(encodePathSegment).join("/");
}

function signingKey(config: CleanupObjectStorageConfig, dateStamp: string): Buffer {
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, serviceName);
  return hmac(serviceKey, "aws4_request");
}

function credentialScope(config: CleanupObjectStorageConfig, dateStamp: string): string {
  return `${dateStamp}/${config.region}/${serviceName}/aws4_request`;
}

function objectUrl(config: CleanupObjectStorageConfig, storageKey: string): URL {
  const base = config.endpoint.endsWith("/") ? config.endpoint : `${config.endpoint}/`;
  return new URL(`${encodePathSegment(config.bucket)}/${encodeStorageKey(storageKey)}`, base);
}

function signatureForCanonicalRequest(input: {
  readonly config: CleanupObjectStorageConfig;
  readonly canonicalRequest: string;
  readonly amzDate: string;
  readonly dateStamp: string;
}): string {
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    credentialScope(input.config, input.dateStamp),
    hexHash(input.canonicalRequest)
  ].join("\n");

  return createHmac("sha256", signingKey(input.config, input.dateStamp))
    .update(stringToSign)
    .digest("hex");
}

function signedRequestHeaders(input: {
  readonly config: CleanupObjectStorageConfig;
  readonly method: "DELETE" | "HEAD";
  readonly storageKey: string;
  readonly now: Date;
}): HeadersInit {
  const url = objectUrl(input.config, input.storageKey);
  const amzDate = toAmzDate(input.now);
  const dateStamp = toDateStamp(input.now);
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    `host:${url.host}`,
    `x-amz-content-sha256:${unsignedPayload}`,
    `x-amz-date:${amzDate}`
  ].join("\n");
  const canonicalRequest = [
    input.method,
    url.pathname,
    "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    unsignedPayload
  ].join("\n");
  const signature = signatureForCanonicalRequest({
    config: input.config,
    canonicalRequest,
    amzDate,
    dateStamp
  });
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${input.config.accessKeyId}/${credentialScope(input.config, dateStamp)}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(", ");

  return {
    authorization,
    "x-amz-content-sha256": unsignedPayload,
    "x-amz-date": amzDate
  };
}

export class S3CompatibleCleanupObjectStorage implements CleanupUploadIntentStorage {
  constructor(private readonly config: CleanupObjectStorageConfig) {}

  async headObject(storageKey: string): Promise<unknown | null> {
    let response: Response;

    try {
      response = await fetch(objectUrl(this.config, storageKey), {
        method: "HEAD",
        headers: signedRequestHeaders({
          config: this.config,
          method: "HEAD",
          storageKey,
          now: new Date()
        })
      });
    } catch {
      throw new CleanupUploadIntentStorageError();
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new CleanupUploadIntentStorageError();
    }

    return { exists: true };
  }

  async deleteObject(storageKey: string): Promise<void> {
    let response: Response;

    try {
      response = await fetch(objectUrl(this.config, storageKey), {
        method: "DELETE",
        headers: signedRequestHeaders({
          config: this.config,
          method: "DELETE",
          storageKey,
          now: new Date()
        })
      });
    } catch {
      throw new CleanupUploadIntentStorageError();
    }

    if (!response.ok && response.status !== 404) {
      throw new CleanupUploadIntentStorageError();
    }
  }
}

let cachedStorage: CleanupUploadIntentStorage | undefined;

export function getDefaultCleanupObjectStorage(): CleanupUploadIntentStorage {
  cachedStorage ??= new S3CompatibleCleanupObjectStorage(configFromEnv());
  return cachedStorage;
}
