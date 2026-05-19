import { existsSync, readFileSync, statSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DocumentBlockDocument } from "@shared/contracts/document-content";
import type { LoginSessionRequest } from "@shared/contracts/session";
import type { AdoptProjectLibraryEntryRequest } from "@shared/contracts/library";

import { createJixiaApp, type CreateJixiaAppOptions } from "./app";
import { resolveHttpApi } from "./http-api";
import {
  assertNoClientActorContextField,
  assertNoClientActorIdentityField,
  assertNoSpaceContextMismatch,
  getActor,
  getOptionalActor,
} from "./auth/actor";
import {
  assertNoLegacyLoginAuthorityFields,
  createClearedSessionCookieHeader,
  createSessionCookieHeader,
  readSessionTokenFromCookieHeader,
  shouldUseSecureSessionCookies,
} from "./services/session.service";
import {
  readRuntimeConfig,
  type RuntimeConfig,
  type RuntimeConfigEnv,
} from "./runtime-config";

const DIST_ROOT = resolve(process.cwd(), "dist");
const INDEX_FILE = resolve(DIST_ROOT, "index.html");

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

interface LoggerLike {
  info(message: string): void;
}

export interface HttpServerOptions {
  connectors?: CreateJixiaAppOptions["connectors"];
  env?: RuntimeConfigEnv;
  logger?: LoggerLike;
}

export interface JixiaHttpServer {
  close(): Promise<void>;
  runtimeConfig: RuntimeConfig;
  server: Server;
}

function hasErrnoCode(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error && "code" in error && typeof error.code === "string"
  );
}

function loadProjectEnvFile(): void {
  try {
    process.loadEnvFile();
  } catch (error: unknown) {
    if (hasErrnoCode(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function sendBody(
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  body: Buffer | string,
  method: string,
): void {
  response.writeHead(statusCode, { "Content-Type": contentType });

  if (method === "HEAD") {
    response.end();
    return;
  }

  response.end(body);
}

function sendBodyWithHeaders(
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  body: Buffer | string,
  method: string,
  headers: Record<string, string>,
): void {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    ...headers,
  });

  if (method === "HEAD") {
    response.end();
    return;
  }

  response.end(body);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  method: string,
): void {
  sendBody(
    response,
    statusCode,
    "application/json; charset=utf-8",
    JSON.stringify(payload),
    method,
  );
}

function sendJsonWithHeaders(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  method: string,
  headers: Record<string, string>,
): void {
  sendBodyWithHeaders(
    response,
    statusCode,
    "application/json; charset=utf-8",
    JSON.stringify(payload),
    method,
    headers,
  );
}

function sendText(
  response: ServerResponse,
  statusCode: number,
  payload: string,
  method: string,
): void {
  sendBody(response, statusCode, "text/plain; charset=utf-8", payload, method);
}

function sendJsonError(
  response: ServerResponse,
  statusCode: number,
  message: string,
  method: string,
): void {
  sendJson(response, statusCode, { error: message }, method);
}

function statusCodeForError(error: unknown): number {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (/file is not available/i.test(error.message)) {
    return 404;
  }

  if (/server-derived actor session/i.test(error.message)) {
    return 401;
  }

  if (/access denied/i.test(error.message)) {
    return 403;
  }

  return 400;
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) {
    return {} as T;
  }

  return JSON.parse(rawBody) as T;
}

function readSingleHeader(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function isWorkbenchHttpApiPath(pathname: string): boolean {
  return (
    pathname === "/api/discovery/today" ||
    pathname === "/api/discovery/search" ||
    pathname === "/api/library/personal" ||
    pathname === "/api/library/personal/import" ||
    pathname === "/api/settings/me" ||
    /^\/api\/reading\/[^/]+\/notes$/.test(pathname) ||
    /^\/api\/reading\/[^/]+\/project-comments$/.test(pathname) ||
    /^\/api\/reading\/[^/]+\/insights$/.test(pathname) ||
    /^\/api\/writing\/[^/]+\/projects\/[^/]+\/document$/.test(pathname)
  );
}

async function handleWorkbenchHttpApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  app: ReturnType<typeof createJixiaApp>,
  method: string,
): Promise<boolean> {
  if (!isWorkbenchHttpApiPath(requestUrl.pathname)) {
    return false;
  }

  try {
    const actorOptions = {
      allowLegacyTestOverride: false,
      sessionRoutes: app.session,
    };
    const isDiscoveryPath = requestUrl.pathname === "/api/discovery/today" ||
      requestUrl.pathname === "/api/discovery/search";
    const actor = isDiscoveryPath
      ? await getOptionalActor(request, actorOptions)
      : await getActor(request, actorOptions);

    const requestBody = method === "GET" || method === "HEAD"
      ? undefined
      : await readJsonBody<unknown>(request);
    const fallbackResponse = await resolveHttpApi(
      app,
      requestUrl,
      method,
      requestBody,
      actor,
    );

    if (fallbackResponse) {
      sendJson(
        response,
        fallbackResponse.statusCode,
        fallbackResponse.payload,
        method,
      );
      return true;
    }

    sendJsonError(response, 404, "API route not found.", method);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Unknown server error.";
    sendJsonError(response, statusCodeForError(error), message, method);
  }

  return true;
}

function optionalQueryParam(requestUrl: URL, key: string): string | undefined {
  return requestUrl.searchParams.get(key) ?? undefined;
}

function rejectLegacyIdentityQueryFields(
  actor: { userId: string },
  requestUrl: URL,
): void {
  assertNoClientActorIdentityField(
    actor,
    optionalQueryParam(requestUrl, "actorUserId"),
    "actorUserId",
  );
  assertNoClientActorIdentityField(
    actor,
    optionalQueryParam(requestUrl, "requestedByUserId"),
    "requestedByUserId",
  );
  assertNoClientActorIdentityField(
    actor,
    optionalQueryParam(requestUrl, "userId"),
    "userId",
  );
  assertNoClientActorIdentityField(
    actor,
    optionalQueryParam(requestUrl, "authorUserId"),
    "authorUserId",
  );
  assertNoClientActorIdentityField(
    actor,
    optionalQueryParam(requestUrl, "startedByUserId"),
    "startedByUserId",
  );
  assertNoClientActorContextField(
    optionalQueryParam(requestUrl, "actorSpaceId"),
    "actorSpaceId",
  );
}

function rejectNotebookAuthorityQueryFields(
  actor: { userId: string },
  requestUrl: URL,
): void {
  rejectLegacyIdentityQueryFields(actor, requestUrl);
  assertNoClientActorIdentityField(
    actor,
    optionalQueryParam(requestUrl, "ownerId"),
    "ownerId",
  );
  assertNoClientActorContextField(
    optionalQueryParam(requestUrl, "spaceId"),
    "spaceId",
  );
}

function rejectProjectDocAuthorityQueryFields(
  actor: { userId: string },
  requestUrl: URL,
): void {
  rejectLegacyIdentityQueryFields(actor, requestUrl);
  assertNoClientActorIdentityField(
    actor,
    optionalQueryParam(requestUrl, "createdByUserId"),
    "createdByUserId",
  );
}

function rejectProjectLibraryAdoptionAuthorityQueryFields(
  actor: { userId: string },
  requestUrl: URL,
): void {
  rejectLegacyIdentityQueryFields(actor, requestUrl);
  assertNoClientActorIdentityField(
    actor,
    optionalQueryParam(requestUrl, "ownerId"),
    "ownerId",
  );
  assertNoClientActorContextField(
    optionalQueryParam(requestUrl, "spaceId"),
    "spaceId",
  );
  assertNoClientActorContextField(
    optionalQueryParam(requestUrl, "scopeType"),
    "scopeType",
  );
  assertNoClientActorContextField(
    optionalQueryParam(requestUrl, "scopeId"),
    "scopeId",
  );
  assertNoClientActorContextField(
    optionalQueryParam(requestUrl, "scope"),
    "scope",
  );
  assertNoClientActorContextField(
    optionalQueryParam(requestUrl, "visibility"),
    "visibility",
  );
  assertNoClientActorContextField(
    optionalQueryParam(requestUrl, "projectId"),
    "projectId",
  );
}

function rejectLegacyIdentityBodyFields(
  actor: { userId: string },
  requestBody: unknown,
): void {
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    return;
  }

  const body = requestBody as Record<string, unknown>;

  assertNoClientActorIdentityField(actor, body.actorUserId, "actorUserId");
  assertNoClientActorIdentityField(actor, body.requestedByUserId, "requestedByUserId");
  assertNoClientActorIdentityField(actor, body.userId, "userId");
  assertNoClientActorIdentityField(actor, body.authorUserId, "authorUserId");
  assertNoClientActorIdentityField(actor, body.startedByUserId, "startedByUserId");
  assertNoClientActorContextField(body.actorSpaceId, "actorSpaceId");
}

function rejectProjectDocAuthorityBodyFields(
  actor: { userId: string },
  requestBody: unknown,
): void {
  rejectLegacyIdentityBodyFields(actor, requestBody);

  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    return;
  }

  const body = requestBody as Record<string, unknown>;

  assertNoClientActorIdentityField(actor, body.createdByUserId, "createdByUserId");
}

function rejectProjectLibraryAdoptionAuthorityBodyFields(
  actor: { userId: string },
  requestBody: unknown,
): void {
  rejectLegacyIdentityBodyFields(actor, requestBody);

  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    return;
  }

  const body = requestBody as Record<string, unknown>;

  assertNoClientActorIdentityField(actor, body.ownerId, "ownerId");
  assertNoClientActorContextField(body.spaceId, "spaceId");
  assertNoClientActorContextField(body.scopeType, "scopeType");
  assertNoClientActorContextField(body.scopeId, "scopeId");
  assertNoClientActorContextField(body.scope, "scope");
  assertNoClientActorContextField(body.visibility, "visibility");
  assertNoClientActorContextField(body.projectId, "projectId");
}

function assertStringField(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }

  return value.trim();
}

function assertOptionalStringField(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string when provided.`);
  }

  return value.trim() || undefined;
}

function assertOptionalTextField(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string when provided.`);
  }

  return value;
}

function assertOptionalDocumentContentField(
  value: unknown,
): DocumentBlockDocument | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("documentContent must be a JSON object when provided.");
  }

  return value as DocumentBlockDocument;
}

function parseDocumentCitationInputs(
  value: unknown,
): Array<{
  evidenceSpan?: string;
  libraryEntryId?: string;
  paperAssetId: string;
}> {
  if (!Array.isArray(value)) {
    throw new Error("citations must be an array.");
  }

  return value.map((citation, index) => {
    if (!citation || typeof citation !== "object" || Array.isArray(citation)) {
      throw new Error(`citations[${index}] must be a JSON object.`);
    }

    const citationRecord = citation as Record<string, unknown>;

    return {
      evidenceSpan: assertOptionalTextField(
        citationRecord.evidenceSpan,
        `citations[${index}].evidenceSpan`,
      ),
      libraryEntryId: assertOptionalStringField(
        citationRecord.libraryEntryId,
        `citations[${index}].libraryEntryId`,
      ),
      paperAssetId: assertStringField(
        citationRecord.paperAssetId,
        `citations[${index}].paperAssetId`,
      ),
    };
  });
}

function parseDocumentVersionBody(requestBody: unknown): {
  citations: Array<{
    evidenceSpan?: string;
    libraryEntryId?: string;
    paperAssetId: string;
  }>;
  content?: string;
  documentContent?: DocumentBlockDocument;
} {
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    throw new Error("Document version payload must be a JSON object.");
  }

  const body = requestBody as Record<string, unknown>;
  const content = assertOptionalTextField(body.content, "content");
  const documentContent = assertOptionalDocumentContentField(body.documentContent);

  if (typeof content === "undefined" && typeof documentContent === "undefined") {
    throw new Error("content is required when documentContent is not provided.");
  }

  return {
    citations: parseDocumentCitationInputs(body.citations),
    content,
    documentContent,
  };
}

function parseWorkbenchWritingBody(requestBody: unknown): {
  citations: Array<{
    evidenceSpan?: string;
    libraryEntryId?: string;
    paperAssetId: string;
  }>;
  content?: string;
  documentContent?: DocumentBlockDocument;
  title: string;
} {
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    throw new Error("Writing payload must be a JSON object.");
  }

  const body = requestBody as Record<string, unknown>;
  const parsedVersionBody = parseDocumentVersionBody(requestBody);

  return {
    ...parsedVersionBody,
    title: assertStringField(body.title, "title"),
  };
}

function parseNotebookCaptureBody(requestBody: unknown): {
  notebookDocumentId?: string;
  notebookTitle?: string;
  ownerId?: string;
  spaceId?: string;
  source: {
    generatedInsightId: string;
    libraryEntryId: string;
    note?: string;
    type: "generatedInsight";
  };
} {
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    throw new Error("Notebook evidence capture payload must be a JSON object.");
  }

  const body = requestBody as Record<string, unknown>;
  const source = body.source;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Notebook evidence capture source must be a JSON object.");
  }

  const sourceRecord = source as Record<string, unknown>;

  if (sourceRecord.type !== "generatedInsight") {
    throw new Error("Notebook evidence capture source type must be generatedInsight.");
  }

  return {
    notebookDocumentId: assertOptionalStringField(
      body.notebookDocumentId,
      "notebookDocumentId",
    ),
    notebookTitle: assertOptionalStringField(body.notebookTitle, "notebookTitle"),
    ownerId: assertOptionalStringField(body.ownerId, "ownerId"),
    spaceId: assertOptionalStringField(body.spaceId, "spaceId"),
    source: {
      generatedInsightId: assertStringField(
        sourceRecord.generatedInsightId,
        "source.generatedInsightId",
      ),
      libraryEntryId: assertStringField(
        sourceRecord.libraryEntryId,
        "source.libraryEntryId",
      ),
      note: assertOptionalStringField(sourceRecord.note, "source.note"),
      type: "generatedInsight",
    },
  };
}

function parseAdoptProjectLibraryEntryBody(
  requestBody: unknown,
): AdoptProjectLibraryEntryRequest {
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    throw new Error("Project library adoption payload must be a JSON object.");
  }

  const body = requestBody as Record<string, unknown>;

  return {
    sourceLibraryEntryId: assertStringField(
      body.sourceLibraryEntryId,
      "sourceLibraryEntryId",
    ),
  };
}

function rejectLegacyActorSpaceContextField(requestUrl: URL): void {
  assertNoClientActorContextField(
    optionalQueryParam(requestUrl, "actorSpaceId"),
    "actorSpaceId",
  );
}

function rejectLegacyActorSpaceContextBodyField(requestBody: unknown): void {
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    return;
  }

  assertNoClientActorContextField(
    (requestBody as Record<string, unknown>).actorSpaceId,
    "actorSpaceId",
  );
}

function parseLibraryScope(requestUrl: URL):
  | { type: "project"; id: string }
  | { type: "user"; id: string }
  | undefined {
  const scopeType = optionalQueryParam(requestUrl, "scopeType");
  const scopeId = optionalQueryParam(requestUrl, "scopeId");
  const projectId = optionalQueryParam(requestUrl, "projectId");

  if (scopeType || scopeId) {
    if ((scopeType !== "user" && scopeType !== "project") || !scopeId) {
      throw new Error("Library scope requires scopeType user/project and scopeId.");
    }

    return { id: scopeId, type: scopeType };
  }

  return projectId ? { id: projectId, type: "project" } : undefined;
}


function parseJobScope(requestUrl: URL):
  | { type: "project"; id: string }
  | { type: "user"; id: string }
  | undefined {
  const scopeType = optionalQueryParam(requestUrl, "scopeType");
  const scopeId = optionalQueryParam(requestUrl, "scopeId");

  if (scopeType || scopeId) {
    if ((scopeType !== "user" && scopeType !== "project") || !scopeId) {
      throw new Error("Job scope requires scopeType user/project and scopeId.");
    }

    return { id: scopeId, type: scopeType };
  }

  return undefined;
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  app: ReturnType<typeof createJixiaApp>,
  allowLegacyActorOverride: boolean,
  useSecureSessionCookies: boolean,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const pathname = requestUrl.pathname;
  const actorOptions = {
    allowLegacyTestOverride: allowLegacyActorOverride,
    sessionRoutes: app.session,
  };

  try {
    if (pathname === "/api/health" && (method === "GET" || method === "HEAD")) {
      sendJson(response, 200, app.health.getHealth(), method);
      return true;
    }

    if (pathname === "/api/session/login" && method === "POST") {
      const body = await readJsonBody<LoginSessionRequest & Record<string, unknown>>(request);
      assertNoLegacyLoginAuthorityFields(
        Object.fromEntries(requestUrl.searchParams),
      );
      assertNoLegacyLoginAuthorityFields(body);
      const login = await app.session.createLoginSession(body, {
        userAgent: readSingleHeader(request.headers["user-agent"]) ?? undefined,
      });

      sendJsonWithHeaders(
        response,
        200,
        { user: login.user },
        method,
        {
          "Set-Cookie": createSessionCookieHeader(
            login.sessionToken,
            login.maxAgeSeconds,
            { secure: useSecureSessionCookies },
          ),
        },
      );
      return true;
    }

    if (pathname === "/api/session/me" && (method === "GET" || method === "HEAD")) {
      const sessionToken = readSessionTokenFromCookieHeader(
        readSingleHeader(request.headers.cookie),
      );

      if (!sessionToken) {
        throw new Error(
          "Project API requires a server-derived actor session from the session cookie.",
        );
      }

      const user = await app.session.getCurrentUserFromToken(sessionToken, {
        userAgent: readSingleHeader(request.headers["user-agent"]) ?? undefined,
      });

      if (!user) {
        throw new Error(
          "Project API requires a server-derived actor session from the session cookie.",
        );
      }

      sendJson(response, 200, { user }, method);
      return true;
    }

    if (pathname === "/api/session/logout" && method === "POST") {
      const sessionToken = readSessionTokenFromCookieHeader(
        readSingleHeader(request.headers.cookie),
      );

      if (sessionToken) {
        await app.session.revokeSessionToken(sessionToken);
      }

      sendJsonWithHeaders(
        response,
        200,
        { ok: true },
        method,
        {
          "Set-Cookie": createClearedSessionCookieHeader({
            secure: useSecureSessionCookies,
          }),
        },
      );
      return true;
    }

    if (pathname === "/api/spaces" && method === "GET") {
      const actor = await getActor(request, actorOptions);
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      sendJson(
        response,
        200,
        await app.spaces.listSpaces({ actorUserId: actor.userId }),
        method,
      );
      return true;
    }

    if (pathname === "/api/home-cockpit" && method === "GET") {
      const actor = await getActor(request, actorOptions);
      rejectLegacyIdentityQueryFields(actor, requestUrl);

      const sessionToken = readSessionTokenFromCookieHeader(
        readSingleHeader(request.headers.cookie),
      );

      if (!sessionToken) {
        throw new Error(
          "Project API requires a server-derived actor session from the session cookie.",
        );
      }

      const user = await app.session.getCurrentUserFromToken(sessionToken, {
        userAgent: readSingleHeader(request.headers["user-agent"]) ?? undefined,
      });

      if (!user || user.id !== actor.userId) {
        throw new Error(
          "Project API requires a server-derived actor session from the session cookie.",
        );
      }

      sendJson(response, 200, await app.homeCockpit.getHomeCockpit(user), method);
      return true;
    }

    if (pathname === "/api/command-search" && method === "GET") {
      const actor = await getActor(request, {
        allowLegacyTestOverride: false,
        sessionRoutes: app.session,
      });
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      sendJson(
        response,
        200,
        await app.commandSearch.search({
          actorUserId: actor.userId,
          projectId: optionalQueryParam(requestUrl, "projectId"),
          query: optionalQueryParam(requestUrl, "query") ?? "",
        }),
        method,
      );
      return true;
    }

    if (pathname === "/api/spaces" && method === "POST") {
      const actor = await getActor(request, actorOptions);
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        actorUserId?: string;
        description?: string;
        kind: "personal" | "shared";
        name: string;
      }>(request);
      rejectLegacyIdentityBodyFields(actor, body);

      sendJson(
        response,
        200,
        await app.spaces.createSpace(
          {
            description: body.description,
            kind: body.kind,
            name: body.name,
          },
          actor.userId,
        ),
        method,
      );
      return true;
    }

    if (pathname === "/api/library" && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const requestedScope = parseLibraryScope(requestUrl);
      const spaceId = optionalQueryParam(requestUrl, "spaceId") ?? "";
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      rejectLegacyActorSpaceContextField(requestUrl);
      if (spaceId && !requestedScope) {
        assertNoSpaceContextMismatch(
          spaceId,
          optionalQueryParam(requestUrl, "actorSpaceId"),
        );
      }

      sendJson(
        response,
        200,
        await app.library.listEntries({
          actorSpaceId: requestedScope?.type === "project" && spaceId
            ? spaceId
            : undefined,
          actorUserId: actor.userId,
          scope: requestedScope,
          spaceId,
        }),
        method,
      );
      return true;
    }

    if (pathname === "/api/projects" && method === "GET") {
      const actor = await getActor(request, actorOptions);
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      sendJson(response, 200, await app.projects.listProjects(actor.userId), method);
      return true;
    }

    if (pathname === "/api/projects" && method === "POST") {
      const actor = await getActor(request, actorOptions);
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        actorUserId?: string;
        description?: string;
        name: string;
        spaceId: string;
        status?: "active" | "archived";
      }>(request);
      rejectLegacyIdentityBodyFields(actor, body);

      sendJson(
        response,
        200,
        await app.projects.createProject(
          {
            description: body.description,
            name: body.name,
            spaceId: body.spaceId,
            status: body.status,
          },
          actor.userId,
        ),
        method,
      );
      return true;
    }

    const projectMembersMatch = pathname.match(
      /^\/api\/projects\/([^/]+)\/members$/,
    );
    if (projectMembersMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, projectId] = projectMembersMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      sendJson(
        response,
        200,
        await app.projects.listProjectMembers({ projectId }, actor.userId),
        method,
      );
      return true;
    }

    if (projectMembersMatch && method === "POST") {
      const actor = await getActor(request, actorOptions);
      const [, projectId] = projectMembersMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        actorUserId?: string;
        role: "owner" | "editor" | "viewer";
        userId: string;
      }>(request);
      assertNoClientActorIdentityField(actor, body.actorUserId, "actorUserId");

      sendJson(
        response,
        200,
        await app.projects.addProjectMember(
          projectId,
          { role: body.role, userId: body.userId },
          actor.userId,
        ),
        method,
      );
      return true;
    }

    const projectWorkspaceMatch = pathname.match(
      /^\/api\/projects\/([^/]+)\/workspace$/,
    );
    if (projectWorkspaceMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, projectId] = projectWorkspaceMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      sendJson(
        response,
        200,
        await app.projectWorkspace.getWorkspace(projectId, actor.userId),
        method,
      );
      return true;
    }

    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, projectId] = projectMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      sendJson(
        response,
        200,
        await app.projects.getProject({ projectId }, actor.userId),
        method,
      );
      return true;
    }

    const projectLibraryAdoptionsMatch = pathname.match(
      /^\/api\/projects\/([^/]+)\/library\/adoptions$/,
    );
    if (projectLibraryAdoptionsMatch && method === "POST") {
      const actor = await getActor(request, actorOptions);
      const [, projectId] = projectLibraryAdoptionsMatch;
      rejectProjectLibraryAdoptionAuthorityQueryFields(actor, requestUrl);
      const requestBody = await readJsonBody<unknown>(request);
      rejectProjectLibraryAdoptionAuthorityBodyFields(actor, requestBody);
      const body = parseAdoptProjectLibraryEntryBody(requestBody);

      sendJson(
        response,
        200,
        await app.library.adoptProjectLibraryEntry({
          actorUserId: actor.userId,
          projectId,
          sourceLibraryEntryId: body.sourceLibraryEntryId,
        }),
        method,
      );
      return true;
    }

    const latestProjectDocumentMatch = pathname.match(
      /^\/api\/projects\/([^/]+)\/writing-document$/,
    );
    if (latestProjectDocumentMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, projectId] = latestProjectDocumentMatch;
      rejectProjectDocAuthorityQueryFields(actor, requestUrl);
      sendJson(
        response,
        200,
        await app.projectDocs.findLatestProjectDocument(projectId, actor.userId),
        method,
      );
      return true;
    }

    const projectWritingMatch = pathname.match(/^\/api\/projects\/([^/]+)\/writing\/document$/);
    if (projectWritingMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, projectId] = projectWritingMatch;
      rejectProjectDocAuthorityQueryFields(actor, requestUrl);

      const document = await app.projectDocs.getWorkbenchDocument(projectId, actor.userId);

      if (!document) {
        sendJsonError(
          response,
          404,
          `No Writer document exists for project ${projectId}.`,
          method,
        );
        return true;
      }

      sendJson(response, 200, { document }, method);
      return true;
    }

    if (projectWritingMatch && method === "POST") {
      const actor = await getActor(request, actorOptions);
      const [, projectId] = projectWritingMatch;
      rejectProjectDocAuthorityQueryFields(actor, requestUrl);
      const requestBody = await readJsonBody<unknown>(request);
      rejectProjectDocAuthorityBodyFields(actor, requestBody);
      const body = parseWorkbenchWritingBody(requestBody);

      sendJson(
        response,
        200,
        {
          document: await app.projectDocs.saveWorkbenchDocument(
            {
              citations: body.citations,
              content: body.content,
              documentContent: body.documentContent,
              projectId,
              title: body.title,
            },
            actor.userId,
          ),
        },
        method,
      );
      return true;
    }

    if (pathname === "/api/notebooks" && method === "GET") {
      const actor = await getActor(request, actorOptions);
      rejectNotebookAuthorityQueryFields(actor, requestUrl);

      sendJson(
        response,
        200,
        await app.notebooks.listDocuments(actor.userId),
        method,
      );
      return true;
    }

    if (pathname === "/api/notebooks" && method === "POST") {
      const actor = await getActor(request, actorOptions);
      rejectNotebookAuthorityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        actorUserId?: string;
        ownerId?: string;
        spaceId?: string;
        title: string;
      }>(request);
      rejectLegacyIdentityBodyFields(actor, body);
      assertNoClientActorIdentityField(actor, body.ownerId, "ownerId");
      assertNoClientActorContextField(body.spaceId, "spaceId");

      sendJson(
        response,
        200,
        await app.notebooks.createDocument(
          {
            title: body.title,
          },
          actor.userId,
        ),
        method,
      );
      return true;
    }

    if (pathname === "/api/notebooks/capture" && method === "POST") {
      const actor = await getActor(request, actorOptions);
      rejectNotebookAuthorityQueryFields(actor, requestUrl);
      const requestBody = await readJsonBody<unknown>(request);
      const body = parseNotebookCaptureBody(requestBody);
      rejectLegacyIdentityBodyFields(actor, requestBody);
      rejectLegacyActorSpaceContextBodyField(requestBody);
      assertNoClientActorIdentityField(actor, body.ownerId, "ownerId");
      assertNoClientActorContextField(body.spaceId, "spaceId");

      sendJson(
        response,
        200,
        await app.notebooks.captureEvidence(
          {
            notebookDocumentId: body.notebookDocumentId,
            notebookTitle: body.notebookTitle,
            source: body.source,
          },
          actor.userId,
        ),
        method,
      );
      return true;
    }

    const notebookMatch = pathname.match(/^\/api\/notebooks\/([^/]+)$/);
    if (notebookMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, documentId] = notebookMatch;
      rejectNotebookAuthorityQueryFields(actor, requestUrl);

      sendJson(
        response,
        200,
        await app.notebooks.getDocument({ documentId }, actor.userId),
        method,
      );
      return true;
    }

    const notebookSnapshotMatch = pathname.match(
      /^\/api\/notebooks\/([^/]+)\/snapshot$/,
    );
    if (notebookSnapshotMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, documentId] = notebookSnapshotMatch;
      rejectNotebookAuthorityQueryFields(actor, requestUrl);

      sendJson(
        response,
        200,
        await app.notebooks.getLatestSnapshot({ documentId }, actor.userId),
        method,
      );
      return true;
    }

    const notebookVersionsMatch = pathname.match(
      /^\/api\/notebooks\/([^/]+)\/versions$/,
    );
    if (notebookVersionsMatch && method === "POST") {
      const actor = await getActor(request, actorOptions);
      const [, documentId] = notebookVersionsMatch;
      rejectNotebookAuthorityQueryFields(actor, requestUrl);
      const requestBody = await readJsonBody<unknown>(request);
      rejectLegacyIdentityBodyFields(actor, requestBody);
      rejectLegacyActorSpaceContextBodyField(requestBody);

      if (requestBody && typeof requestBody === "object" && !Array.isArray(requestBody)) {
        const rawBody = requestBody as Record<string, unknown>;
        assertNoClientActorIdentityField(actor, rawBody.ownerId, "ownerId");
        assertNoClientActorContextField(rawBody.spaceId, "spaceId");
      }

      const body = parseDocumentVersionBody(requestBody);

      sendJson(
        response,
        200,
        await app.notebooks.saveDocument(
          {
            citations: body.citations,
            content: body.content,
            documentContent: body.documentContent,
            documentId,
          },
          actor.userId,
        ),
        method,
      );
      return true;
    }

    if (pathname === "/api/project-docs" && method === "POST") {
      const actor = await getActor(request, actorOptions);
      rejectProjectDocAuthorityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        actorUserId?: string;
        createdByUserId?: string;
        projectId: string;
        publishState?: "draft" | "review" | "published";
        title: string;
      }>(request);
      rejectProjectDocAuthorityBodyFields(actor, body);

      sendJson(
        response,
        200,
        await app.projectDocs.createDocument(
          {
            projectId: body.projectId,
            publishState: body.publishState,
            title: body.title,
          },
          actor.userId,
        ),
        method,
      );
      return true;
    }

    const projectDocMatch = pathname.match(/^\/api\/project-docs\/([^/]+)$/);
    if (projectDocMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, documentId] = projectDocMatch;
      rejectProjectDocAuthorityQueryFields(actor, requestUrl);

      sendJson(
        response,
        200,
        await app.projectDocs.getDocument({ documentId }, actor.userId),
        method,
      );
      return true;
    }

    const projectDocVersionsMatch = pathname.match(
      /^\/api\/project-docs\/([^/]+)\/versions$/,
    );
    if (projectDocVersionsMatch && method === "POST") {
      const actor = await getActor(request, actorOptions);
      const [, documentId] = projectDocVersionsMatch;
      rejectProjectDocAuthorityQueryFields(actor, requestUrl);
      const requestBody = await readJsonBody<unknown>(request);
      rejectProjectDocAuthorityBodyFields(actor, requestBody);
      const body = parseDocumentVersionBody(requestBody);

      sendJson(
        response,
        200,
        await app.projectDocs.saveDocument(
          {
            citations: body.citations,
            content: body.content,
            documentContent: body.documentContent,
            documentId,
          },
          actor.userId,
        ),
        method,
      );
      return true;
    }

    const projectDocPublishStateMatch = pathname.match(
      /^\/api\/project-docs\/([^/]+)\/publish-state$/,
    );
    if (projectDocPublishStateMatch && method === "POST") {
      const actor = await getActor(request, actorOptions);
      const [, documentId] = projectDocPublishStateMatch;
      rejectProjectDocAuthorityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        actorUserId?: string;
        createdByUserId?: string;
        publishState: "draft" | "review" | "published";
      }>(request);
      rejectProjectDocAuthorityBodyFields(actor, body);

      sendJson(
        response,
        200,
        await app.projectDocs.transitionPublishState(
          {
            documentId,
            publishState: body.publishState,
          },
          actor.userId,
        ),
        method,
      );
      return true;
    }

    const libraryEntryMatch = pathname.match(/^\/api\/library\/([^/]+)$/);
    const libraryEntryFileMatch = pathname.match(/^\/api\/library\/([^/]+)\/file$/);
    if (libraryEntryFileMatch && (method === "GET" || method === "HEAD")) {
      const actor = await getActor(request, actorOptions);
      const [, entryId] = libraryEntryFileMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      rejectLegacyActorSpaceContextField(requestUrl);

      const file = await app.library.getEntryFile({
        actorUserId: actor.userId,
        entryId,
      });

      sendBodyWithHeaders(
        response,
        200,
        file.contentType,
        file.body,
        method,
        {
          "Content-Disposition": file.contentDisposition,
          "Content-Length": String(file.contentLength),
        },
      );
      return true;
    }

    if (libraryEntryMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, entryId] = libraryEntryMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      rejectLegacyActorSpaceContextField(requestUrl);

      sendJson(
        response,
        200,
        await app.library.getEntry({
          actorUserId: actor.userId,
          entryId,
        }),
        method,
      );
      return true;
    }

    if (pathname === "/api/import/paper" && method === "POST") {
      const actor = await getActor(request, actorOptions);
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        projectId?: string;
        requestedByUserId?: string;
        scope?: { type: "project"; id: string } | { type: "user"; id: string };
        sourceLocator: string;
        sourceType: "doi" | "pmid" | "arxiv";
        spaceId: string;
        visibility: "private" | "space_shared" | "published_to_project";
      }>(request);

      rejectLegacyIdentityBodyFields(actor, body);

      sendJson(
        response,
        200,
        await app.imports.importPaper(
          {
            projectId: body.projectId,
            scope: body.scope,
            sourceLocator: body.sourceLocator,
            sourceType: body.sourceType,
            spaceId: body.spaceId,
            visibility: body.visibility,
          },
          actor.userId,
        ),
        method,
      );
      return true;
    }

    const readingDetailMatch = pathname.match(/^\/api\/reading\/([^/]+)$/);
    if (readingDetailMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, entryId] = readingDetailMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      rejectLegacyActorSpaceContextField(requestUrl);

      sendJson(
        response,
        200,
        await app.reading.getDetail({
          actorUserId: actor.userId,
          libraryEntryId: entryId,
        }),
        method,
      );
      return true;
    }

    if (pathname === "/api/reading/notes" && method === "POST") {
      const actor = await getActor(request, actorOptions);
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        actorSpaceId?: string;
        authorUserId?: string;
        body: string;
        libraryEntryId: string;
        visibility?: "private" | "space_shared";
      }>(request);

      rejectLegacyIdentityBodyFields(actor, body);
      rejectLegacyActorSpaceContextBodyField(body);

      sendJson(
        response,
        200,
        await app.reading.createNote({
          actorUserId: actor.userId,
          body: body.body,
          libraryEntryId: body.libraryEntryId,
          visibility: body.visibility,
        }),
        method,
      );
      return true;
    }

    if (pathname === "/api/reading/project-comments" && method === "POST") {
      const actor = await getActor(request, actorOptions);
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        actorSpaceId?: string;
        authorUserId?: string;
        body: string;
        libraryEntryId: string;
        projectId?: string;
      }>(request);

      rejectLegacyIdentityBodyFields(actor, body);
      rejectLegacyActorSpaceContextBodyField(body);

      sendJson(
        response,
        201,
        {
          comment: await app.reading.createProjectComment({
            actorUserId: actor.userId,
            body: body.body,
            libraryEntryId: body.libraryEntryId,
            projectId: body.projectId,
          }),
        },
        method,
      );
      return true;
    }

    const readingProjectCommentMatch = pathname.match(
      /^\/api\/reading\/([^/]+)\/project-comments$/,
    );
    if (readingProjectCommentMatch && method === "POST") {
      const actor = await getActor(request, actorOptions);
      const [, entryId] = readingProjectCommentMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        actorSpaceId?: string;
        authorUserId?: string;
        body: string;
        projectId?: string;
      }>(request);

      rejectLegacyIdentityBodyFields(actor, body);
      rejectLegacyActorSpaceContextBodyField(body);

      sendJson(
        response,
        201,
        {
          comment: await app.reading.createProjectComment({
            actorUserId: actor.userId,
            body: body.body,
            libraryEntryId: entryId,
            projectId: body.projectId,
          }),
        },
        method,
      );
      return true;
    }

    if (pathname === "/api/reading/insights" && method === "POST") {
      const actor = await getActor(request, actorOptions);
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        actorSpaceId?: string;
        evidenceSpans: Array<{
          endOffset: number;
          quote: string;
          startOffset: number;
        }>;
        libraryEntryId: string;
        startedByUserId?: string;
        summary: string;
        title: string;
      }>(request);

      rejectLegacyIdentityBodyFields(actor, body);
      rejectLegacyActorSpaceContextBodyField(body);

      sendJson(
        response,
        200,
        await app.reading.saveGeneratedInsight({
          actorUserId: actor.userId,
          evidenceSpans: body.evidenceSpans,
          libraryEntryId: body.libraryEntryId,
          summary: body.summary,
          title: body.title,
        }),
        method,
      );
      return true;
    }

    const membershipsMatch = pathname.match(
      /^\/api\/spaces\/([^/]+)\/memberships$/,
    );
    if (membershipsMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, spaceId] = membershipsMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      sendJson(
        response,
        200,
        await app.spaces.listMemberships({ spaceId }, actor.userId),
        method,
      );
      return true;
    }

    if (pathname === "/api/credentials" && method === "GET") {
      const actor = await getActor(request, actorOptions);
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      sendJson(
        response,
        200,
        await app.credentials.listCredentials({}, actor.userId),
        method,
      );
      return true;
    }

    if (pathname === "/api/credentials" && method === "POST") {
      const actor = await getActor(request, actorOptions);
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        provider: string;
        rawSecret: string;
        userId?: string;
      }>(request);
      rejectLegacyIdentityBodyFields(actor, body);
      sendJson(
        response,
        200,
        await app.credentials.createCredential(
          {
            provider: body.provider,
            rawSecret: body.rawSecret,
          },
          actor.userId,
        ),
        method,
      );
      return true;
    }

    if (pathname === "/api/jobs" && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const requestedScope = parseJobScope(requestUrl);
      const spaceId = optionalQueryParam(requestUrl, "spaceId");
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      rejectLegacyActorSpaceContextField(requestUrl);
      if (spaceId && !requestedScope) {
        assertNoSpaceContextMismatch(
          spaceId,
          optionalQueryParam(requestUrl, "actorSpaceId"),
        );
      }
      sendJson(
        response,
        200,
        await app.jobs.listJobs({
          actorUserId: actor.userId,
          scope: requestedScope,
          spaceId,
        }),
        method,
      );
      return true;
    }

    if (pathname === "/api/jobs" && method === "POST") {
      const actor = await getActor(request, actorOptions);
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        credentialRef: string;
        kind: string;
        payload: Record<string, unknown>;
        requestedByUserId?: string;
        scope?: { type: "project"; id: string } | { type: "user"; id: string };
        spaceId: string;
      }>(request);
      rejectLegacyIdentityBodyFields(actor, body);
      sendJson(
        response,
        200,
        await app.jobs.createJob(
          {
            credentialRef: body.credentialRef,
            kind: body.kind,
            payload: body.payload,
            scope: body.scope,
            spaceId: body.spaceId,
          },
          actor.userId,
        ),
        method,
      );
      return true;
    }

    const jobRunMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/run$/);
    if (jobRunMatch && method === "POST") {
      const actor = await getActor(request, actorOptions);
      const [, jobId] = jobRunMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        actorSpaceId?: string;
        actorUserId?: string;
      }>(request);
      rejectLegacyIdentityBodyFields(actor, body);
      rejectLegacyActorSpaceContextBodyField(body);
      sendJson(
        response,
        200,
        await app.jobs.runJob({
          actorUserId: actor.userId,
          jobId,
        }),
        method,
      );
      return true;
    }

    const jobCancelMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/cancel$/);
    if (jobCancelMatch && method === "POST") {
      const actor = await getActor(request, actorOptions);
      const [, jobId] = jobCancelMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      const body = await readJsonBody<{
        actorSpaceId?: string;
        actorUserId?: string;
      }>(request);
      rejectLegacyIdentityBodyFields(actor, body);
      rejectLegacyActorSpaceContextBodyField(body);
      sendJson(
        response,
        200,
        await app.jobs.cancelJob({
          actorUserId: actor.userId,
          jobId,
        }),
        method,
      );
      return true;
    }

    const jobEventsMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/events$/);
    if (jobEventsMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, jobId] = jobEventsMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      rejectLegacyActorSpaceContextField(requestUrl);
      sendJson(
        response,
        200,
        await app.jobStream.listEvents({
          actorUserId: actor.userId,
          jobId,
        }),
        method,
      );
      return true;
    }

    const jobStreamMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/stream$/);
    if (jobStreamMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, jobId] = jobStreamMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      rejectLegacyActorSpaceContextField(requestUrl);
      const accessQuery = {
        actorUserId: actor.userId,
        jobId,
      };

      const initialEvents = await app.jobStream.toSse({ ...accessQuery, jobId });
      const unsubscribe = await app.jobStream.subscribe(
        { ...accessQuery, jobId },
        (event) => {
          response.write(`event: job\ndata: ${JSON.stringify(event)}\n\n`);
        },
      );

      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
      });
      response.write(initialEvents);

      request.on("close", () => {
        unsubscribe();
        response.end();
      });

      return true;
    }

    const jobAuditMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/audit$/);
    if (jobAuditMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, jobId] = jobAuditMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      rejectLegacyActorSpaceContextField(requestUrl);
      sendJson(
        response,
        200,
        await app.jobs.listAuditRecords({
          actorUserId: actor.userId,
          jobId,
        }),
        method,
      );
      return true;
    }

    const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (jobMatch && method === "GET") {
      const actor = await getActor(request, actorOptions);
      const [, jobId] = jobMatch;
      rejectLegacyIdentityQueryFields(actor, requestUrl);
      rejectLegacyActorSpaceContextField(requestUrl);
      sendJson(
        response,
        200,
        await app.jobs.getJob({
          actorUserId: actor.userId,
          jobId,
        }),
        method,
      );
      return true;
    }

    return false;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";
    sendJsonError(response, statusCodeForError(error), message, method);
    return true;
  }
}

function serveFile(
  response: ServerResponse,
  filePath: string,
  method: string,
): void {
  const fileExtension = extname(filePath);
  const contentType =
    CONTENT_TYPES[fileExtension] ?? "application/octet-stream";
  const fileContent = readFileSync(filePath);

  sendBody(response, 200, contentType, fileContent, method);
}

function resolveAssetPath(pathname: string): string | null {
  const assetPath = resolve(DIST_ROOT, `.${pathname}`);

  return assetPath.startsWith(DIST_ROOT) ? assetPath : null;
}

function shouldServeShell(pathname: string): boolean {
  return !pathname.includes(".") || pathname.endsWith("/");
}

function handleStaticRequest(
  response: ServerResponse,
  pathname: string,
  method: string,
): void {
  if (!existsSync(DIST_ROOT) || !existsSync(INDEX_FILE)) {
    sendText(
      response,
      503,
      "Web build output not found. Run npm run build before starting the lab server.",
      method,
    );
    return;
  }

  const assetPath = resolveAssetPath(pathname);

  if (assetPath && existsSync(assetPath) && statSync(assetPath).isFile()) {
    serveFile(response, assetPath, method);
    return;
  }

  if (shouldServeShell(pathname)) {
    serveFile(response, INDEX_FILE, method);
    return;
  }

  sendText(response, 404, "Not found", method);
}

export function createHttpServer(
  options: HttpServerOptions = {},
): JixiaHttpServer {
  loadProjectEnvFile();

  const runtimeEnv = options.env ?? process.env;
  const runtimeConfig = readRuntimeConfig(runtimeEnv);
  const useSecureSessionCookies = shouldUseSecureSessionCookies(runtimeEnv);

  if (
    runtimeEnv.NODE_ENV === "production" &&
    runtimeEnv.JIXIA_ALLOW_LEGACY_ACTOR_OVERRIDE === "true"
  ) {
    throw new Error(
      "JIXIA_ALLOW_LEGACY_ACTOR_OVERRIDE must not be enabled in production.",
    );
  }

  const app = createJixiaApp({
    connectors: options.connectors,
    env: {
      ...runtimeEnv,
      JIXIA_DATABASE_URL: runtimeConfig.databaseUrl,
    },
  });
  const server = createServer((request, response) => {
    const method = request.method ?? "GET";

    const requestUrl = new URL(
      request.url ?? "/",
      `http://${runtimeConfig.host}`,
    );

    if (requestUrl.pathname.startsWith("/api/")) {
      void (async () => {
        if (
          await handleWorkbenchHttpApiRequest(
            request,
            response,
            requestUrl,
            app,
            method,
          )
        ) {
          return;
        }

        const handled = await handleApiRequest(
          request,
          response,
          requestUrl,
          app,
          runtimeEnv.JIXIA_ALLOW_LEGACY_ACTOR_OVERRIDE === "true",
          useSecureSessionCookies,
        );

        if (handled) {
          return;
        }

        try {
          const actor = await getOptionalActor(request, {
            allowLegacyTestOverride: false,
            sessionRoutes: app.session,
          });
          const requestBody = method === "GET" || method === "HEAD"
            ? undefined
            : await readJsonBody<unknown>(request);
          const fallbackResponse = await resolveHttpApi(
            app,
            requestUrl,
            method,
            requestBody,
            actor,
          );

          if (fallbackResponse) {
            sendJson(
              response,
              fallbackResponse.statusCode,
              fallbackResponse.payload,
              method,
            );
            return;
          }

          sendJsonError(response, 404, "API route not found.", method);
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : "Unknown server error.";
          sendJsonError(response, statusCodeForError(error), message, method);
        }
      })();
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      sendText(response, 405, "Method not allowed", method);
      return;
    }

    if (requestUrl.pathname === "/health") {
      sendJson(response, 200, app.health.getHealth(), method);
      return;
    }

    handleStaticRequest(response, requestUrl.pathname, method);
  });

  let closePromise: Promise<void> | null = null;

  server.once("close", () => {
    void app.close();
  });

  return {
    close(): Promise<void> {
      closePromise ??= (async () => {
        if (server.listening) {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }

              resolve();
            });
          });
        }

        await app.close();
      })();

      return closePromise;
    },
    runtimeConfig,
    server,
  };
}

export async function startHttpServer(
  options: HttpServerOptions = {},
): Promise<JixiaHttpServer> {
  const logger = options.logger ?? console;
  const httpServer = createHttpServer(options);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    httpServer.server.once("error", rejectPromise);
    httpServer.server.listen(
      httpServer.runtimeConfig.port,
      httpServer.runtimeConfig.host,
      () => {
        httpServer.server.off("error", rejectPromise);
        resolvePromise();
      },
    );
  });

  logger.info(
    `Jixia server listening on http://${httpServer.runtimeConfig.host}:${httpServer.runtimeConfig.port} with storage root ${httpServer.runtimeConfig.storageRoot} and database ${httpServer.runtimeConfig.databaseUrl}`,
  );

  return httpServer;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void startHttpServer();
}
