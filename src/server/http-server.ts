import { existsSync, readFileSync, statSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createJixiaApp } from "./app";
import { assertNoActorImpersonation, getActor } from "./auth/actor";
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
  env?: RuntimeConfigEnv;
  logger?: LoggerLike;
}

export interface JixiaHttpServer {
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

function requireQueryParam(requestUrl: URL, key: string): string {
  const value = requestUrl.searchParams.get(key);

  if (!value) {
    throw new Error(`Missing required query parameter: ${key}`);
  }

  return value;
}

function parseJobAccessQuery(requestUrl: URL): {
  actorSpaceId: string;
  actorUserId: string;
} {
  return {
    actorSpaceId: requireQueryParam(requestUrl, "actorSpaceId"),
    actorUserId: requireQueryParam(requestUrl, "actorUserId"),
  };
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  app: ReturnType<typeof createJixiaApp>,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const pathname = requestUrl.pathname;

  try {
    if (pathname === "/api/health" && (method === "GET" || method === "HEAD")) {
      sendJson(response, 200, app.health.getHealth(), method);
      return true;
    }

    if (pathname === "/api/spaces" && method === "GET") {
      const actorUserId = requireQueryParam(requestUrl, "actorUserId");
      sendJson(
        response,
        200,
        await app.spaces.listSpaces({ actorUserId }),
        method,
      );
      return true;
    }

    if (pathname === "/api/spaces" && method === "POST") {
      const actorUserId = requireQueryParam(requestUrl, "actorUserId");
      const body = await readJsonBody<{
        description?: string;
        kind: "personal" | "shared";
        name: string;
      }>(request);

      sendJson(
        response,
        200,
        await app.spaces.createSpace(body, actorUserId),
        method,
      );
      return true;
    }

    if (pathname === "/api/library" && method === "GET") {
      const actorSpaceId = requireQueryParam(requestUrl, "actorSpaceId");
      const actorUserId = requireQueryParam(requestUrl, "actorUserId");
      const spaceId = requireQueryParam(requestUrl, "spaceId");

      sendJson(
        response,
        200,
        await app.library.listEntries({ actorSpaceId, actorUserId, spaceId }),
        method,
      );
      return true;
    }

    if (pathname === "/api/projects" && method === "GET") {
      const actor = getActor(request);
      sendJson(response, 200, await app.projects.listProjects(actor.userId), method);
      return true;
    }

    if (pathname === "/api/projects" && method === "POST") {
      const actor = getActor(request);
      const body = await readJsonBody<{
        actorUserId?: string;
        description?: string;
        name: string;
        spaceId: string;
        status?: "active" | "archived";
      }>(request);
      assertNoActorImpersonation(actor, body.actorUserId);

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
      const actor = getActor(request);
      const [, projectId] = projectMembersMatch;
      sendJson(
        response,
        200,
        await app.projects.listProjectMembers({ projectId }, actor.userId),
        method,
      );
      return true;
    }

    if (projectMembersMatch && method === "POST") {
      const actor = getActor(request);
      const [, projectId] = projectMembersMatch;
      const body = await readJsonBody<{
        actorUserId?: string;
        role: "owner" | "editor" | "viewer";
        userId: string;
      }>(request);
      assertNoActorImpersonation(actor, body.actorUserId);

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

    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && method === "GET") {
      const actor = getActor(request);
      const [, projectId] = projectMatch;
      sendJson(
        response,
        200,
        await app.projects.getProject({ projectId }, actor.userId),
        method,
      );
      return true;
    }

    const libraryEntryMatch = pathname.match(/^\/api\/library\/([^/]+)$/);
    if (libraryEntryMatch && method === "GET") {
      const [, entryId] = libraryEntryMatch;
      const actorSpaceId = requireQueryParam(requestUrl, "actorSpaceId");
      const actorUserId = requireQueryParam(requestUrl, "actorUserId");

      sendJson(
        response,
        200,
        await app.library.getEntry({ actorSpaceId, actorUserId, entryId }),
        method,
      );
      return true;
    }

    if (pathname === "/api/import/paper" && method === "POST") {
      const body = await readJsonBody<{
        requestedByUserId: string;
        sourceLocator: string;
        sourceType: "doi" | "pmid" | "arxiv";
        spaceId: string;
        visibility: "private" | "space_shared" | "published_to_project";
      }>(request);

      sendJson(response, 200, await app.imports.importPaper(body), method);
      return true;
    }

    const readingDetailMatch = pathname.match(/^\/api\/reading\/([^/]+)$/);
    if (readingDetailMatch && method === "GET") {
      const [, entryId] = readingDetailMatch;
      const actorSpaceId = requireQueryParam(requestUrl, "actorSpaceId");
      const actorUserId = requireQueryParam(requestUrl, "actorUserId");

      sendJson(
        response,
        200,
        await app.reading.getDetail({
          actorSpaceId,
          actorUserId,
          libraryEntryId: entryId,
        }),
        method,
      );
      return true;
    }

    if (pathname === "/api/reading/notes" && method === "POST") {
      const body = await readJsonBody<{
        actorSpaceId: string;
        authorUserId: string;
        body: string;
        libraryEntryId: string;
        visibility: "private" | "space_shared";
      }>(request);

      sendJson(response, 200, await app.reading.createNote(body), method);
      return true;
    }

    if (pathname === "/api/reading/insights" && method === "POST") {
      const body = await readJsonBody<{
        actorSpaceId: string;
        evidenceSpans: Array<{
          endOffset: number;
          quote: string;
          startOffset: number;
        }>;
        libraryEntryId: string;
        startedByUserId: string;
        summary: string;
        title: string;
      }>(request);

      sendJson(
        response,
        200,
        await app.reading.saveGeneratedInsight(body),
        method,
      );
      return true;
    }

    const membershipsMatch = pathname.match(
      /^\/api\/spaces\/([^/]+)\/memberships$/,
    );
    if (membershipsMatch && method === "GET") {
      const [, spaceId] = membershipsMatch;
      sendJson(
        response,
        200,
        await app.spaces.listMemberships({ spaceId }),
        method,
      );
      return true;
    }

    if (pathname === "/api/credentials" && method === "GET") {
      const userId = requireQueryParam(requestUrl, "userId");
      sendJson(
        response,
        200,
        await app.credentials.listCredentials({ userId }),
        method,
      );
      return true;
    }

    if (pathname === "/api/credentials" && method === "POST") {
      const body = await readJsonBody<{
        provider: string;
        rawSecret: string;
        userId: string;
      }>(request);
      sendJson(
        response,
        200,
        await app.credentials.createCredential(body),
        method,
      );
      return true;
    }

    if (pathname === "/api/jobs" && method === "GET") {
      const accessQuery = parseJobAccessQuery(requestUrl);
      sendJson(response, 200, await app.jobs.listJobs(accessQuery), method);
      return true;
    }

    if (pathname === "/api/jobs" && method === "POST") {
      const body = await readJsonBody<{
        credentialRef: string;
        kind: string;
        payload: Record<string, unknown>;
        requestedByUserId: string;
        spaceId: string;
      }>(request);
      sendJson(response, 200, await app.jobs.createJob(body), method);
      return true;
    }

    const jobRunMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/run$/);
    if (jobRunMatch && method === "POST") {
      const [, jobId] = jobRunMatch;
      const body = await readJsonBody<{
        actorSpaceId: string;
        actorUserId: string;
      }>(request);
      sendJson(
        response,
        200,
        await app.jobs.runJob({ ...body, jobId }),
        method,
      );
      return true;
    }

    const jobEventsMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/events$/);
    if (jobEventsMatch && method === "GET") {
      const [, jobId] = jobEventsMatch;
      const accessQuery = parseJobAccessQuery(requestUrl);
      sendJson(
        response,
        200,
        app.jobStream.listEvents({ ...accessQuery, jobId }),
        method,
      );
      return true;
    }

    const jobStreamMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/stream$/);
    if (jobStreamMatch && method === "GET") {
      const [, jobId] = jobStreamMatch;
      const accessQuery = parseJobAccessQuery(requestUrl);

      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
      });
      response.write(app.jobStream.toSse({ ...accessQuery, jobId }));

      const unsubscribe = app.jobStream.subscribe(
        { ...accessQuery, jobId },
        (event) => {
          response.write(`event: job\ndata: ${JSON.stringify(event)}\n\n`);
        },
      );

      request.on("close", () => {
        unsubscribe();
        response.end();
      });

      return true;
    }

    const jobAuditMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/audit$/);
    if (jobAuditMatch && method === "GET") {
      const [, jobId] = jobAuditMatch;
      const accessQuery = parseJobAccessQuery(requestUrl);
      sendJson(
        response,
        200,
        await app.jobs.listAuditRecords({ ...accessQuery, jobId }),
        method,
      );
      return true;
    }

    const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (jobMatch && method === "GET") {
      const [, jobId] = jobMatch;
      const accessQuery = parseJobAccessQuery(requestUrl);
      sendJson(
        response,
        200,
        await app.jobs.getJob({ ...accessQuery, jobId }),
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
  const app = createJixiaApp({ env: runtimeEnv });
  const server = createServer((request, response) => {
    const method = request.method ?? "GET";

    const requestUrl = new URL(
      request.url ?? "/",
      `http://${runtimeConfig.host}`,
    );

    if (requestUrl.pathname.startsWith("/api/")) {
      void handleApiRequest(request, response, requestUrl, app).then(
        (handled) => {
          if (!handled) {
            sendJsonError(response, 404, "API route not found.", method);
          }
        },
      );
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

  return {
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
