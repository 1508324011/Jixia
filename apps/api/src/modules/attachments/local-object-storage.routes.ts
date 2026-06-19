import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  getDefaultObjectStorage,
  LocalObjectStorage,
  ObjectStorageError,
  type ObjectStorage
} from "./object-storage.js";

export type LocalObjectStorageRoutesOptions = {
  readonly objectStorage?: ObjectStorage;
};

class LocalObjectStorageRouteError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "LocalObjectStorageRouteError";
  }
}

const paramsSchema = z.object({
  storageKeyToken: z.string().trim().min(1).max(8_192)
});

const querySchema = z.object({
  expires: z.string().trim().min(1).max(64).optional(),
  signature: z.string().trim().min(1).max(256).optional()
});

const allowedRequestHeaders = new Set(["content-type"]);
const forbiddenDirectUploadHeaderNames = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-amz-credential",
  "x-amz-security-token",
  "x-amz-signature"
]);
const maxLocalObjectSizeBytes = 200 * 1024 * 1024;
const localObjectPathByMethod = {
  GET: "download",
  PUT: "upload"
} as const;

function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new LocalObjectStorageRouteError("Invalid request", 400);
  }

  return result.data;
}

function headerValue(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return undefined;
}

function requestedHeaderNames(request: FastifyRequest): readonly string[] {
  const rawHeader = headerValue(request.headers["access-control-request-headers"]);

  if (!rawHeader) {
    return [];
  }

  return rawHeader
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
}

function ensureCorsRequestAllowed(storage: LocalObjectStorage, request: FastifyRequest): string | undefined {
  const origin = headerValue(request.headers.origin);

  if (!storage.isAllowedOrigin(origin)) {
    throw new LocalObjectStorageRouteError("Origin not allowed", 403);
  }

  return origin;
}

function applyCorsHeaders(reply: FastifyReply, input: {
  readonly origin: string | undefined;
  readonly method: "GET" | "PUT";
  readonly allowedHeaders?: readonly string[];
}): void {
  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Methods", `${input.method}, OPTIONS`);
  reply.header(
    "Access-Control-Allow-Headers",
    input.allowedHeaders?.length ? input.allowedHeaders.join(", ") : "content-type"
  );
  reply.header("Access-Control-Expose-Headers", "ETag");

  if (input.origin) {
    reply.header("Access-Control-Allow-Origin", input.origin);
  }
}

function ensurePreflightHeadersAllowed(request: FastifyRequest): readonly string[] {
  const headers = requestedHeaderNames(request);

  if (headers.some((header) => !allowedRequestHeaders.has(header))) {
    throw new LocalObjectStorageRouteError("Requested header not allowed", 403);
  }

  return headers;
}

function ensurePreflightMethodAllowed(request: FastifyRequest, expectedMethod: "GET" | "PUT"): void {
  const method = headerValue(request.headers["access-control-request-method"]);

  if (method && method.toUpperCase() !== expectedMethod) {
    throw new LocalObjectStorageRouteError("Requested method not allowed", 403);
  }
}

function requireSignedStorageKey(input: {
  readonly storage: LocalObjectStorage;
  readonly method: "GET" | "PUT";
  readonly params: unknown;
  readonly query: unknown;
  readonly pathPrefix: string;
}): string {
  const params = parsePayload(paramsSchema, input.params);
  const query = parsePayload(querySchema, input.query);

  if (input.pathPrefix !== localObjectPathByMethod[input.method]) {
    throw new LocalObjectStorageRouteError("Signed object request is invalid or expired", 403);
  }

  const storageKey = input.storage.verifySignedRequest({
    method: input.method,
    storageKeyToken: params.storageKeyToken,
    expires: query.expires,
    signature: query.signature
  });

  if (!storageKey) {
    throw new LocalObjectStorageRouteError("Signed object request is invalid or expired", 403);
  }

  return storageKey;
}

function ensureDirectUploadRequestHasNoCredentials(request: FastifyRequest): void {
  if (Object.keys(request.headers).some((header) => forbiddenDirectUploadHeaderNames.has(header.toLowerCase()))) {
    throw new LocalObjectStorageRouteError("Direct upload must not include browser credentials", 400);
  }
}

function bodyBuffer(request: FastifyRequest): Buffer {
  if (Buffer.isBuffer(request.body)) {
    return request.body;
  }

  if (typeof request.body === "string") {
    return Buffer.from(request.body);
  }

  throw new LocalObjectStorageRouteError("Invalid upload body", 400);
}

function contentType(request: FastifyRequest): string {
  const value = headerValue(request.headers["content-type"]);

  if (!value) {
    throw new LocalObjectStorageRouteError("Content-Type is required", 400);
  }

  return value.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

export const localObjectStorageRoutes: FastifyPluginAsync<LocalObjectStorageRoutesOptions> = async (
  app,
  options
) => {
  function resolveLocalObjectStorage(): LocalObjectStorage {
    const objectStorage = options.objectStorage ?? getDefaultObjectStorage();

    if (!(objectStorage instanceof LocalObjectStorage)) {
      throw new LocalObjectStorageRouteError("Not found", 404);
    }

    return objectStorage;
  }

  app.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: maxLocalObjectSizeBytes }, (_request, body, done) => {
    done(null, body);
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof LocalObjectStorageRouteError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }

    if (error instanceof ObjectStorageError) {
      return reply.status(503).send({ error: "Object storage unavailable" });
    }

    throw error;
  });

  app.options("/local-object-storage/upload/:storageKeyToken", async (request, reply) => {
    const storage = resolveLocalObjectStorage();
    const origin = ensureCorsRequestAllowed(storage, request);
    ensurePreflightMethodAllowed(request, "PUT");
    const allowedHeaders = ensurePreflightHeadersAllowed(request);
    applyCorsHeaders(reply, { origin, method: "PUT", allowedHeaders });
    return reply.status(204).send();
  });

  app.options("/local-object-storage/download/:storageKeyToken", async (request, reply) => {
    const storage = resolveLocalObjectStorage();
    const origin = ensureCorsRequestAllowed(storage, request);
    ensurePreflightMethodAllowed(request, "GET");
    const allowedHeaders = ensurePreflightHeadersAllowed(request);
    applyCorsHeaders(reply, { origin, method: "GET", allowedHeaders });
    return reply.status(204).send();
  });

  app.put("/local-object-storage/upload/:storageKeyToken", async (request, reply) => {
    const storage = resolveLocalObjectStorage();
    const origin = ensureCorsRequestAllowed(storage, request);
    ensureDirectUploadRequestHasNoCredentials(request);
    const storageKey = requireSignedStorageKey({
      storage,
      method: "PUT",
      params: request.params,
      pathPrefix: "upload",
      query: request.query
    });
    const metadata = await storage.writeObject({
      storageKey,
      body: bodyBuffer(request),
      mimeType: contentType(request)
    });

    applyCorsHeaders(reply, { origin, method: "PUT" });
    if (metadata.etag) {
      reply.header("ETag", metadata.etag);
    }
    return reply.status(200).send();
  });

  app.get("/local-object-storage/download/:storageKeyToken", async (request, reply) => {
    const storage = resolveLocalObjectStorage();
    const origin = ensureCorsRequestAllowed(storage, request);
    const storageKey = requireSignedStorageKey({
      storage,
      method: "GET",
      params: request.params,
      pathPrefix: "download",
      query: request.query
    });
    const object = await storage.readObject(storageKey);

    if (!object) {
      throw new LocalObjectStorageRouteError("Not found", 404);
    }

    applyCorsHeaders(reply, { origin, method: "GET" });
    if (object.metadata.etag) {
      reply.header("ETag", object.metadata.etag);
    }
    reply.header("Content-Type", object.metadata.mimeType);
    reply.header("Content-Length", String(object.metadata.sizeBytes));
    reply.header("Cache-Control", "no-store");
    return reply.status(200).send(object.body);
  });
};
