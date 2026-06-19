import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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

export type LocalObjectStorageConfig = {
  readonly rootDirectory: string;
  readonly publicBaseUrl: string;
  readonly signingSecret: string;
  readonly allowedOrigins: readonly string[];
};

type AttachmentStorageDriver = "local" | "s3";

type StoredObjectMetadata = ObjectMetadata & {
  readonly storageKey: string;
};

export type LocalStoredObject = {
  readonly body: Buffer;
  readonly metadata: ObjectMetadata;
};

const serviceName = "s3";
const unsignedPayload = "UNSIGNED-PAYLOAD";
const localStorageDriverEnvKey = "ATTACHMENT_STORAGE_DRIVER";
const localStorageDefaultSecret = randomBytes(32).toString("hex");
const s3ConfigEnvKeys = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY"
] as const;

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

function hasCompleteS3Config(env: NodeJS.ProcessEnv): boolean {
  return s3ConfigEnvKeys.every((key) => Boolean(env[key]?.trim()));
}

function hasPartialS3Config(env: NodeJS.ProcessEnv): boolean {
  return s3ConfigEnvKeys.some((key) => Boolean(env[key]?.trim())) && !hasCompleteS3Config(env);
}

function storageDriverFromEnv(env: NodeJS.ProcessEnv): AttachmentStorageDriver {
  const configuredDriver = env[localStorageDriverEnvKey]?.trim().toLowerCase();

  if (configuredDriver === "local" || configuredDriver === "s3") {
    return configuredDriver;
  }

  if (configuredDriver) {
    throw new ObjectStorageError("Object storage driver is invalid");
  }

  if (hasPartialS3Config(env)) {
    throw new ObjectStorageError("Object storage configuration is incomplete");
  }

  if (env.NODE_ENV === "production") {
    return "s3";
  }

  return hasCompleteS3Config(env) ? "s3" : "local";
}

function localPublicBaseUrlFromEnv(env: NodeJS.ProcessEnv): string {
  const configured = env.LOCAL_OBJECT_STORAGE_PUBLIC_BASE_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const configuredApiHost = env.API_HOST?.trim();
  const apiHost = configuredApiHost && configuredApiHost !== "0.0.0.0" ? configuredApiHost : "127.0.0.1";
  const apiPort = env.API_PORT?.trim() || "3000";
  return `http://${apiHost}:${apiPort}/local-object-storage`;
}

function localAllowedOriginsFromEnv(env: NodeJS.ProcessEnv): readonly string[] {
  const configured = env.LOCAL_OBJECT_STORAGE_ALLOWED_ORIGINS?.trim();
  const origins = configured
    ? configured.split(",").map((origin) => origin.trim()).filter(Boolean)
    : ["http://127.0.0.1:5173", "http://localhost:5173"];

  return Array.from(new Set(origins));
}

function localConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LocalObjectStorageConfig {
  if (env.NODE_ENV === "production") {
    throw new ObjectStorageError("Local attachment storage is not available in production");
  }

  return {
    rootDirectory: resolve(env.LOCAL_OBJECT_STORAGE_ROOT?.trim() || "storage/attachments"),
    publicBaseUrl: localPublicBaseUrlFromEnv(env),
    signingSecret: env.LOCAL_OBJECT_STORAGE_SIGNING_SECRET?.trim() || localStorageDefaultSecret,
    allowedOrigins: localAllowedOriginsFromEnv(env)
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

function objectFileId(storageKey: string): string {
  return createHash("sha256").update(storageKey).digest("hex");
}

function localObjectSignature(input: {
  readonly method: "GET" | "PUT";
  readonly storageKey: string;
  readonly expiresAtMilliseconds: number;
  readonly signingSecret: string;
}): string {
  return createHmac("sha256", input.signingSecret)
    .update(`${input.method}\n${input.storageKey}\n${input.expiresAtMilliseconds}`)
    .digest("hex");
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function encodeStorageKeyToken(storageKey: string): string {
  return Buffer.from(storageKey, "utf8").toString("base64url");
}

function decodeStorageKeyToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    return decoded.trim() ? decoded : null;
  } catch {
    return null;
  }
}

function localSignedUrl(input: {
  readonly config: LocalObjectStorageConfig;
  readonly method: "GET" | "PUT";
  readonly storageKey: string;
  readonly expiresInSeconds: number;
  readonly now: Date;
}): URL {
  const expiresAtMilliseconds = expiresAt(input.now, input.expiresInSeconds).getTime();
  const base = input.config.publicBaseUrl.endsWith("/")
    ? input.config.publicBaseUrl
    : `${input.config.publicBaseUrl}/`;
  const pathPrefix = input.method === "PUT" ? "upload" : "download";
  const url = new URL(`${pathPrefix}/${encodeStorageKeyToken(input.storageKey)}`, base);

  url.searchParams.set("expires", String(expiresAtMilliseconds));
  url.searchParams.set(
    "signature",
    localObjectSignature({
      method: input.method,
      storageKey: input.storageKey,
      expiresAtMilliseconds,
      signingSecret: input.config.signingSecret
    })
  );

  return url;
}

function metadataFromJson(value: unknown, storageKey: string): ObjectMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const metadata = value as Partial<StoredObjectMetadata>;
  const sizeBytes = metadata.sizeBytes;
  const mimeType = metadata.mimeType;

  if (
    metadata.storageKey !== storageKey ||
    typeof sizeBytes !== "number" ||
    !Number.isInteger(sizeBytes) ||
    typeof mimeType !== "string"
  ) {
    return null;
  }

  return {
    sizeBytes,
    mimeType,
    etag: typeof metadata.etag === "string" ? metadata.etag : null
  };
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

export class LocalObjectStorage implements ObjectStorage {
  constructor(readonly config: LocalObjectStorageConfig) {}

  async createPresignedPutUrl(input: PresignedPutInput): Promise<PresignedPutResult> {
    const now = input.now ?? new Date();
    const url = localSignedUrl({
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
    const url = localSignedUrl({
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
    try {
      const metadataText = await readFile(this.metadataPath(storageKey), "utf8");
      const metadata = metadataFromJson(JSON.parse(metadataText), storageKey);

      if (!metadata) {
        throw new ObjectStorageError();
      }

      return metadata;
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return null;
      }

      if (error instanceof ObjectStorageError) {
        throw error;
      }

      throw new ObjectStorageError();
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    try {
      await Promise.all([
        rm(this.bodyPath(storageKey), { force: true }),
        rm(this.metadataPath(storageKey), { force: true })
      ]);
    } catch {
      throw new ObjectStorageError();
    }
  }

  async writeObject(input: {
    readonly storageKey: string;
    readonly body: Buffer;
    readonly mimeType: string;
  }): Promise<ObjectMetadata> {
    const bodyDigest = createHash("sha256").update(input.body).digest("hex");
    const metadata: StoredObjectMetadata = {
      storageKey: input.storageKey,
      sizeBytes: input.body.length,
      mimeType: input.mimeType,
      etag: `"${bodyDigest}"`
    };

    try {
      await mkdir(this.objectDirectory(), { recursive: true });
      await writeFile(this.bodyPath(input.storageKey), input.body);
      await writeFile(this.metadataPath(input.storageKey), JSON.stringify(metadata), "utf8");
    } catch {
      throw new ObjectStorageError();
    }

    return {
      sizeBytes: metadata.sizeBytes,
      mimeType: metadata.mimeType,
      etag: metadata.etag
    };
  }

  async readObject(storageKey: string): Promise<LocalStoredObject | null> {
    const metadata = await this.headObject(storageKey);

    if (!metadata) {
      return null;
    }

    try {
      return {
        body: await readFile(this.bodyPath(storageKey)),
        metadata
      };
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return null;
      }

      throw new ObjectStorageError();
    }
  }

  verifySignedRequest(input: {
    readonly method: "GET" | "PUT";
    readonly storageKeyToken: string;
    readonly expires: string | undefined;
    readonly signature: string | undefined;
    readonly now?: Date;
  }): string | null {
    const storageKey = decodeStorageKeyToken(input.storageKeyToken);
    const expiresAtMilliseconds = Number(input.expires);

    if (!storageKey || !input.signature || !Number.isInteger(expiresAtMilliseconds)) {
      return null;
    }

    const now = input.now ?? new Date();

    if (expiresAtMilliseconds <= now.getTime()) {
      return null;
    }

    const expectedSignature = localObjectSignature({
      method: input.method,
      storageKey,
      expiresAtMilliseconds,
      signingSecret: this.config.signingSecret
    });

    return signaturesMatch(input.signature, expectedSignature) ? storageKey : null;
  }

  isAllowedOrigin(origin: string | undefined): boolean {
    return !origin || this.config.allowedOrigins.includes(origin);
  }

  private objectDirectory(): string {
    return resolve(this.config.rootDirectory, "objects");
  }

  private bodyPath(storageKey: string): string {
    return resolve(this.objectDirectory(), `${objectFileId(storageKey)}.body`);
  }

  private metadataPath(storageKey: string): string {
    return resolve(this.objectDirectory(), `${objectFileId(storageKey)}.json`);
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  );
}

export function createObjectStorageFromEnv(env: NodeJS.ProcessEnv = process.env): ObjectStorage {
  const driver = storageDriverFromEnv(env);

  if (driver === "local") {
    return new LocalObjectStorage(localConfigFromEnv(env));
  }

  return new S3CompatibleObjectStorage(configFromEnv(env));
}

let cachedStorage: ObjectStorage | undefined;

export function getDefaultObjectStorage(): ObjectStorage {
  cachedStorage ??= createObjectStorageFromEnv();
  return cachedStorage;
}
