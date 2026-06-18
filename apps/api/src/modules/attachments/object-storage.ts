import { createHmac, createHash } from "node:crypto";

export class ObjectStorageError extends Error {
  constructor(message = "Object storage operation failed") {
    super(message);
    this.name = "ObjectStorageError";
  }
}

export type ObjectMetadata = {
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly etag: string | null;
};

export type PresignedPutInput = {
  readonly storageKey: string;
  readonly mimeType: string;
  readonly expiresInSeconds: number;
  readonly now?: Date;
};

export type PresignedGetInput = {
  readonly storageKey: string;
  readonly expiresInSeconds: number;
  readonly now?: Date;
};

export type PresignedUrlResult = {
  readonly url: string;
  readonly expiresAt: Date;
};

export type PresignedPutResult = PresignedUrlResult & {
  readonly requiredHeaders: Readonly<Record<string, string>>;
};

export type ObjectStorage = {
  readonly createPresignedPutUrl: (input: PresignedPutInput) => Promise<PresignedPutResult>;
  readonly createPresignedGetUrl: (input: PresignedGetInput) => Promise<PresignedUrlResult>;
  readonly headObject: (storageKey: string) => Promise<ObjectMetadata | null>;
  readonly deleteObject: (storageKey: string) => Promise<void>;
};

type S3CompatibleConfig = {
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
    throw new ObjectStorageError("Object storage configuration is incomplete");
  }

  return value;
}

function configFromEnv(env: NodeJS.ProcessEnv = process.env): S3CompatibleConfig {
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

function canonicalQuery(entries: readonly [string, string][]): string {
  return entries
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function signingKey(config: S3CompatibleConfig, dateStamp: string): Buffer {
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, serviceName);
  return hmac(serviceKey, "aws4_request");
}

function credentialScope(config: S3CompatibleConfig, dateStamp: string): string {
  return `${dateStamp}/${config.region}/${serviceName}/aws4_request`;
}

function objectUrl(config: S3CompatibleConfig, storageKey: string): URL {
  const base = config.endpoint.endsWith("/") ? config.endpoint : `${config.endpoint}/`;
  return new URL(`${encodePathSegment(config.bucket)}/${encodeStorageKey(storageKey)}`, base);
}

function signatureForCanonicalRequest(input: {
  readonly config: S3CompatibleConfig;
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

function presignedUrl(input: {
  readonly config: S3CompatibleConfig;
  readonly method: "GET" | "PUT";
  readonly storageKey: string;
  readonly expiresInSeconds: number;
  readonly now: Date;
}): URL {
  const url = objectUrl(input.config, input.storageKey);
  const amzDate = toAmzDate(input.now);
  const dateStamp = toDateStamp(input.now);
  const signedHeaders = "host";
  const queryEntries: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${input.config.accessKeyId}/${credentialScope(input.config, dateStamp)}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(input.expiresInSeconds)],
    ["X-Amz-SignedHeaders", signedHeaders]
  ];
  const canonicalQueryString = canonicalQuery(queryEntries);
  const canonicalRequest = [
    input.method,
    url.pathname,
    canonicalQueryString,
    `host:${url.host}\n`,
    signedHeaders,
    unsignedPayload
  ].join("\n");
  const signature = signatureForCanonicalRequest({
    config: input.config,
    canonicalRequest,
    amzDate,
    dateStamp
  });

  for (const [key, value] of queryEntries) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("X-Amz-Signature", signature);

  return url;
}

function signedRequestHeaders(input: {
  readonly config: S3CompatibleConfig;
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

function expiresAt(now: Date, expiresInSeconds: number): Date {
  return new Date(now.getTime() + expiresInSeconds * 1_000);
}

export class S3CompatibleObjectStorage implements ObjectStorage {
  constructor(private readonly config: S3CompatibleConfig) {}

  async createPresignedPutUrl(input: PresignedPutInput): Promise<PresignedPutResult> {
    const now = input.now ?? new Date();
    const url = presignedUrl({
      config: this.config,
      method: "PUT",
      storageKey: input.storageKey,
      expiresInSeconds: input.expiresInSeconds,
      now
    });

    return {
      url: url.toString(),
      requiredHeaders: { "content-type": input.mimeType },
      expiresAt: expiresAt(now, input.expiresInSeconds)
    };
  }

  async createPresignedGetUrl(input: PresignedGetInput): Promise<PresignedUrlResult> {
    const now = input.now ?? new Date();
    const url = presignedUrl({
      config: this.config,
      method: "GET",
      storageKey: input.storageKey,
      expiresInSeconds: input.expiresInSeconds,
      now
    });

    return {
      url: url.toString(),
      expiresAt: expiresAt(now, input.expiresInSeconds)
    };
  }

  async headObject(storageKey: string): Promise<ObjectMetadata | null> {
    const url = objectUrl(this.config, storageKey);
    const response = await fetch(url, {
      method: "HEAD",
      headers: signedRequestHeaders({
        config: this.config,
        method: "HEAD",
        storageKey,
        now: new Date()
      })
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new ObjectStorageError();
    }

    const sizeHeader = response.headers.get("content-length");
    const mimeType = response.headers.get("content-type") ?? "";
    const sizeBytes = sizeHeader ? Number(sizeHeader) : NaN;

    if (!Number.isInteger(sizeBytes) || sizeBytes < 0 || !mimeType) {
      throw new ObjectStorageError();
    }

    return {
      sizeBytes,
      mimeType,
      etag: response.headers.get("etag")
    };
  }

  async deleteObject(storageKey: string): Promise<void> {
    const url = objectUrl(this.config, storageKey);
    const response = await fetch(url, {
      method: "DELETE",
      headers: signedRequestHeaders({
        config: this.config,
        method: "DELETE",
        storageKey,
        now: new Date()
      })
    });

    if (!response.ok && response.status !== 404) {
      throw new ObjectStorageError();
    }
  }
}

let cachedStorage: ObjectStorage | undefined;

export function getDefaultObjectStorage(): ObjectStorage {
  cachedStorage ??= new S3CompatibleObjectStorage(configFromEnv());
  return cachedStorage;
}
