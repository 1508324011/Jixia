import { createHmac } from "node:crypto";
import { createServer } from "node:http";

const apiPort = Number(process.env.JIXIA_E2E_API_PORT ?? 4174);
const webPort = Number(process.env.JIXIA_E2E_WEB_PORT ?? 5173);
const apiListenHost = process.env.JIXIA_E2E_API_HOST?.trim() || "127.0.0.1";
const apiPublicOrigin = normalizedOrigin(
  process.env.JIXIA_E2E_API_PUBLIC_ORIGIN,
  `http://127.0.0.1:${apiPort}`
);
const localObjectStoragePublicBaseUrl = normalizedObjectStorageBaseUrl(
  process.env.JIXIA_E2E_OBJECT_STORAGE_PUBLIC_BASE_URL,
  `${apiPublicOrigin}/local-object-storage`
);
const allowedOrigins = allowedOriginsFromEnv(
  process.env.JIXIA_E2E_ALLOWED_ORIGINS,
  [
    `http://127.0.0.1:${webPort}`,
    `http://localhost:${webPort}`,
    originFromUrl(process.env.PLAYWRIGHT_BASE_URL)
  ]
);
const sessionCookieName = "jixia_e2e_session";
const space = { id: "space-e2e", name: "Jixia E2E Space" };
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const localObjectStorageSigningSecret = "jixia-e2e-local-object-storage-secret";

const counters = new Map();
const usersByEmail = new Map();
const usersById = new Map();
const sessions = new Map();
const projects = new Map();
const documents = new Map();
const uploadIntents = new Map();
const uploadedObjects = new Map();
const attachments = new Map();
const preflightedUploadTokens = new Set();
const forbiddenDirectUploadHeaderNames = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-amz-credential",
  "x-amz-security-token",
  "x-amz-signature"
]);

const emptyEditorSnapshot = {
  editorSchemaVersion: 1,
  blocks: [{ id: "root-paragraph", type: "paragraph", content: [] }]
};

function nextId(prefix) {
  const nextValue = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, nextValue);
  return `${prefix}-${nextValue}`;
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function sendEmpty(response, statusCode, headers = {}) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    ...headers
  });
  response.end();
}

function normalizedOrigin(value, fallback) {
  const url = new URL(value?.trim() || fallback);
  return url.origin;
}

function normalizedObjectStorageBaseUrl(value, fallback) {
  const url = new URL(value?.trim() || fallback);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname) {
    url.pathname = "/local-object-storage";
  }
  return url.toString().replace(/\/+$/, "");
}

function originFromUrl(value) {
  if (!value?.trim()) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function allowedOriginsFromEnv(value, defaults) {
  const rawOrigins = value?.trim()
    ? value.split(",")
    : defaults;
  return new Set(rawOrigins.map(normalizedAllowedOrigin).filter(Boolean));
}

function normalizedAllowedOrigin(value) {
  const origin = value?.trim().replace(/\/+$/, "");
  if (!origin) {
    return null;
  }

  if (origin === "*") {
    throw new Error("Jixia E2E allowed origin must not be wildcard");
  }

  const url = new URL(origin);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== origin) {
    throw new Error("Jixia E2E allowed origin must be an HTTP origin");
  }

  return url.origin;
}

function allowedOriginFromRequest(request) {
  const origin = request.headers.origin;
  if (!origin) {
    return null;
  }
  return allowedOrigins.has(origin) ? origin : undefined;
}

function corsHeaders(request, method) {
  const origin = allowedOriginFromRequest(request);
  if (origin === undefined) {
    return null;
  }
  return {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": `${method}, OPTIONS`,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Expose-Headers": "ETag, X-Jixia-E2E-Preflight-Seen",
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {})
  };
}

function signLocalObjectRequest(method, storageKey, expiresAtMilliseconds) {
  return createHmac("sha256", localObjectStorageSigningSecret)
    .update(`${method}\n${storageKey}\n${expiresAtMilliseconds}`)
    .digest("hex");
}

function encodeStorageKeyToken(storageKey) {
  return Buffer.from(storageKey, "utf8").toString("base64url");
}

function decodeStorageKeyToken(token) {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    return decoded.trim() ? decoded : null;
  } catch {
    return null;
  }
}

function localObjectStorageUrl(method, storageKey, expiresAt) {
  const expiresAtMilliseconds = new Date(expiresAt).getTime();
  const pathPrefix = method === "PUT" ? "upload" : "download";
  const url = new URL(`${localObjectStoragePublicBaseUrl}/${pathPrefix}/${encodeStorageKeyToken(storageKey)}`);
  url.searchParams.set("expires", String(expiresAtMilliseconds));
  url.searchParams.set("signature", signLocalObjectRequest(method, storageKey, expiresAtMilliseconds));
  return url.toString();
}

function verifyLocalObjectStorageUrl(method, url) {
  const match = url.pathname.match(/^\/local-object-storage\/(?:upload|download)\/([^/]+)$/);
  if (!match) {
    return null;
  }
  const storageKey = decodeStorageKeyToken(match[1] ?? "");
  const expiresAtMilliseconds = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature");
  if (!storageKey || !Number.isInteger(expiresAtMilliseconds) || !signature || expiresAtMilliseconds <= Date.now()) {
    return null;
  }
  return signature === signLocalObjectRequest(method, storageKey, expiresAtMilliseconds) ? storageKey : null;
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function parseCookies(cookieHeader) {
  const cookies = new Map();
  if (!cookieHeader) {
    return cookies;
  }

  for (const entry of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = entry.trim().split("=");
    if (!rawName) {
      continue;
    }
    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  }

  return cookies;
}

function sessionCookie(session) {
  return `${sessionCookieName}=${encodeURIComponent(session.id)}; Expires=${session.expiresAt.toUTCString()}; HttpOnly; Path=/; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${sessionCookieName}=; Max-Age=0; HttpOnly; Path=/; SameSite=Lax`;
}

function createSession(userId) {
  const session = {
    id: nextId("session"),
    userId,
    expiresAt: new Date(Date.now() + sessionLifetimeMs),
    revokedAt: null
  };
  sessions.set(session.id, session);
  return session;
}

function currentSessionView(user, session) {
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      space: {
        id: space.id,
        name: space.name,
        role: user.spaceRole
      },
      projectMemberships: Array.from(projects.values())
        .filter((project) => project.members.some((member) => member.userId === user.id))
        .map((project) => ({
          projectId: project.id,
          projectName: project.name,
          role: project.members.find((member) => member.userId === user.id)?.role ?? "ProjectViewer"
        }))
    },
    expiresAt: session.expiresAt.toISOString()
  };
}

function requireSession(request, response) {
  const sessionId = parseCookies(request.headers.cookie).get(sessionCookieName);
  const session = sessionId ? sessions.get(sessionId) : undefined;
  const user = session ? usersById.get(session.userId) : undefined;

  if (!session || !user || session.revokedAt || session.expiresAt <= new Date()) {
    sendError(response, 401, "Unauthorized");
    return null;
  }

  return { session, user };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const body = await readBody(request);
  if (body.length === 0) {
    return {};
  }
  return JSON.parse(body.toString("utf8"));
}

function sameOriginFromRequest(request) {
  const origin = request.headers.origin;
  return typeof origin === "string" && origin.length > 0 ? origin : `http://127.0.0.1:${webPort}`;
}

function isProjectMember(userId, projectId) {
  return projects.get(projectId)?.members.some((member) => member.userId === userId) ?? false;
}

function canReadDocument(userId, document) {
  if (document.type === "notebook") {
    return document.ownerUserId === userId;
  }
  return Boolean(document.projectId && isProjectMember(userId, document.projectId));
}

function canEditDocument(userId, document) {
  return canReadDocument(userId, document) && document.status === "active";
}

function documentResponse(document) {
  const revision = document.currentRevision
    ? {
        id: document.currentRevision.id,
        documentId: document.id,
        revisionNumber: document.currentRevision.revisionNumber,
        contentSnapshot: clone(document.currentSnapshot),
        editorUserId: document.currentRevision.editorUserId,
        createdAt: document.currentRevision.createdAt
      }
    : null;

  return {
    document: publicDocument(document),
    revision,
    currentSnapshot: clone(document.currentSnapshot)
  };
}

function publicDocument(document) {
  return {
    id: document.id,
    type: document.type,
    status: document.status,
    title: document.title,
    ownerUserId: document.ownerUserId,
    projectId: document.projectId,
    currentRevisionId: document.currentRevisionId,
    revisionNumber: document.revisionNumber,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}

function publicAttachment(attachment) {
  return {
    id: attachment.id,
    documentId: attachment.documentId,
    uploadedByUserId: attachment.uploadedByUserId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    checksum: attachment.checksum,
    etag: attachment.etag,
    createdAt: attachment.createdAt
  };
}

function publicIntent(intent) {
  return {
    id: intent.id,
    documentId: intent.documentId,
    uploaderUserId: intent.uploaderUserId,
    blockType: intent.blockType,
    fileName: intent.fileName,
    mimeType: intent.mimeType,
    sizeBytes: intent.sizeBytes,
    checksum: intent.checksum,
    status: intent.status,
    failureReason: intent.failureReason,
    failureDetail: intent.failureDetail,
    expiresAt: intent.expiresAt,
    confirmedAt: intent.confirmedAt,
    cleanedAt: intent.cleanedAt,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt
  };
}

function normalizedApiPath(pathname) {
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return pathname;
  }

  if (pathname === "/health" || pathname.startsWith("/local-object-storage/")) {
    return pathname;
  }

  return `/api${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function handleApiRequest(request, response, url) {
  const path = normalizedApiPath(url.pathname);

  if (request.method === "GET" && path === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && path === "/api/invitations/accept") {
    const body = await readJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    const displayName = String(body.displayName ?? "").trim();
    const password = String(body.password ?? "");
    const invitationToken = String(body.invitationToken ?? "").trim();

    if (!email || !displayName || password.length < 8 || invitationToken.length < 16) {
      sendError(response, 400, "Invalid invitation");
      return;
    }

    if (usersByEmail.has(email)) {
      sendError(response, 409, "User already exists");
      return;
    }

    const user = {
      id: nextId("user"),
      email,
      displayName,
      password,
      spaceRole: "SpaceMember"
    };
    usersByEmail.set(email, user);
    usersById.set(user.id, user);
    const session = createSession(user.id);

    sendJson(response, 200, { currentSession: currentSessionView(user, session) }, {
      "Set-Cookie": sessionCookie(session)
    });
    return;
  }

  if (request.method === "POST" && path === "/api/auth/login") {
    const body = await readJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const user = usersByEmail.get(email);

    if (!user || user.password !== password) {
      sendError(response, 401, "Invalid email or password");
      return;
    }

    const session = createSession(user.id);
    sendJson(response, 200, { currentSession: currentSessionView(user, session) }, {
      "Set-Cookie": sessionCookie(session)
    });
    return;
  }

  if (request.method === "GET" && path === "/api/auth/me") {
    const context = requireSession(request, response);
    if (!context) {
      return;
    }
    sendJson(response, 200, { currentSession: currentSessionView(context.user, context.session) });
    return;
  }

  if (request.method === "POST" && path === "/api/auth/logout") {
    const context = requireSession(request, response);
    if (!context) {
      return;
    }
    context.session.revokedAt = new Date();
    sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
    return;
  }

  if (request.method === "GET" && path === "/api/projects") {
    const context = requireSession(request, response);
    if (!context) {
      return;
    }
    sendJson(response, 200, {
      projects: Array.from(projects.values())
        .filter((project) => project.members.some((member) => member.userId === context.user.id))
        .map((project) => ({
          id: project.id,
          spaceId: project.spaceId,
          name: project.name,
          createdByUserId: project.createdByUserId,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        }))
    });
    return;
  }

  if (request.method === "POST" && path === "/api/projects") {
    const context = requireSession(request, response);
    if (!context) {
      return;
    }
    const body = await readJson(request);
    const name = String(body.name ?? "").trim();
    if (!name) {
      sendError(response, 400, "Invalid request");
      return;
    }

    const timestamp = nowIso();
    const project = {
      id: nextId("project"),
      spaceId: space.id,
      name,
      createdByUserId: context.user.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      members: [{ userId: context.user.id, role: "ProjectOwner" }]
    };
    projects.set(project.id, project);
    sendJson(response, 200, {
      project: {
        id: project.id,
        spaceId: project.spaceId,
        name: project.name,
        createdByUserId: project.createdByUserId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      }
    });
    return;
  }

  const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (request.method === "GET" && projectMatch) {
    const context = requireSession(request, response);
    const projectId = decodeURIComponent(projectMatch[1] ?? "");
    const project = projects.get(projectId);
    if (!context) {
      return;
    }
    if (!project || !isProjectMember(context.user.id, projectId)) {
      sendError(response, 404, "Not found");
      return;
    }
    sendJson(response, 200, {
      project: {
        id: project.id,
        spaceId: project.spaceId,
        name: project.name,
        createdByUserId: project.createdByUserId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      }
    });
    return;
  }

  const projectDocumentsMatch = path.match(/^\/api\/projects\/([^/]+)\/documents$/);
  if (request.method === "GET" && projectDocumentsMatch) {
    const context = requireSession(request, response);
    const projectId = decodeURIComponent(projectDocumentsMatch[1] ?? "");
    if (!context) {
      return;
    }
    if (!isProjectMember(context.user.id, projectId)) {
      sendError(response, 404, "Not found");
      return;
    }
    sendJson(response, 200, {
      documents: Array.from(documents.values())
        .filter((document) => document.projectId === projectId)
        .map(publicDocument)
    });
    return;
  }

  if (request.method === "POST" && path === "/api/documents/project") {
    const context = requireSession(request, response);
    if (!context) {
      return;
    }
    const body = await readJson(request);
    const projectId = String(body.projectId ?? "");
    const title = String(body.title ?? "").trim();
    if (!title || !isProjectMember(context.user.id, projectId)) {
      sendError(response, 400, "Invalid request");
      return;
    }

    const timestamp = nowIso();
    const document = {
      id: nextId("document"),
      type: "project",
      status: "active",
      title,
      ownerUserId: null,
      projectId,
      currentRevisionId: null,
      revisionNumber: 0,
      currentSnapshot: clone(emptyEditorSnapshot),
      currentRevision: null,
      drafts: new Map(),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    documents.set(document.id, document);
    sendJson(response, 200, { document: publicDocument(document), revision: null });
    return;
  }

  if (request.method === "GET" && path === "/api/documents/notebook") {
    const context = requireSession(request, response);
    if (!context) {
      return;
    }
    sendJson(response, 200, {
      documents: Array.from(documents.values())
        .filter((document) => document.type === "notebook" && document.ownerUserId === context.user.id)
        .map(publicDocument)
    });
    return;
  }

  if (request.method === "POST" && path === "/api/documents/notebook") {
    const context = requireSession(request, response);
    if (!context) {
      return;
    }
    const body = await readJson(request);
    const title = String(body.title ?? "").trim();
    if (!title) {
      sendError(response, 400, "Invalid request");
      return;
    }

    const timestamp = nowIso();
    const document = {
      id: nextId("document"),
      type: "notebook",
      status: "active",
      title,
      ownerUserId: context.user.id,
      projectId: null,
      currentRevisionId: null,
      revisionNumber: 0,
      currentSnapshot: clone(emptyEditorSnapshot),
      currentRevision: null,
      drafts: new Map(),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    documents.set(document.id, document);
    sendJson(response, 200, { document: publicDocument(document), revision: null });
    return;
  }

  const readDocumentMatch = path.match(/^\/api\/documents\/([^/]+)$/);
  if (request.method === "GET" && readDocumentMatch) {
    const context = requireSession(request, response);
    const documentId = decodeURIComponent(readDocumentMatch[1] ?? "");
    const document = documents.get(documentId);
    if (!context) {
      return;
    }
    if (!document || !canReadDocument(context.user.id, document)) {
      sendError(response, 404, "Not found");
      return;
    }
    sendJson(response, 200, documentResponse(document));
    return;
  }

  const draftMatch = path.match(/^\/api\/documents\/([^/]+)\/draft$/);
  if (request.method === "PUT" && draftMatch) {
    const context = requireSession(request, response);
    const documentId = decodeURIComponent(draftMatch[1] ?? "");
    const document = documents.get(documentId);
    if (!context) {
      return;
    }
    if (!document || !canEditDocument(context.user.id, document)) {
      sendError(response, 404, "Not found");
      return;
    }
    const body = await readJson(request);
    const updatedAt = nowIso();
    const draft = {
      documentId,
      userId: context.user.id,
      baseRevision: Number(body.baseRevision ?? 0),
      draftContent: clone(body.draftContent ?? emptyEditorSnapshot),
      updatedAt
    };
    document.drafts.set(context.user.id, draft);
    sendJson(response, 200, { draft });
    return;
  }

  const revisionMatch = path.match(/^\/api\/documents\/([^/]+)\/revisions$/);
  if (request.method === "POST" && revisionMatch) {
    const context = requireSession(request, response);
    const documentId = decodeURIComponent(revisionMatch[1] ?? "");
    const document = documents.get(documentId);
    if (!context) {
      return;
    }
    if (!document || !canEditDocument(context.user.id, document)) {
      sendError(response, 404, "Not found");
      return;
    }
    const body = await readJson(request);
    const baseRevision = Number(body.baseRevision ?? -1);
    const submittedSnapshot = clone(body.contentSnapshot ?? emptyEditorSnapshot);

    if (baseRevision !== document.revisionNumber) {
      sendJson(response, 409, {
        outcome: "conflict",
        documentId,
        currentRevisionNumber: document.revisionNumber,
        currentSnapshot: clone(document.currentSnapshot),
        submittedBaseRevision: baseRevision,
        submittedSnapshot
      });
      return;
    }

    const revisionNumber = document.revisionNumber + 1;
    const timestamp = nowIso();
    const revision = {
      id: nextId("revision"),
      documentId,
      revisionNumber,
      contentSnapshot: submittedSnapshot,
      editorUserId: context.user.id,
      createdAt: timestamp
    };
    document.title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : document.title;
    document.currentSnapshot = submittedSnapshot;
    document.currentRevision = revision;
    document.currentRevisionId = revision.id;
    document.revisionNumber = revisionNumber;
    document.updatedAt = timestamp;
    sendJson(response, 200, {
      outcome: "saved",
      document: publicDocument(document),
      revision
    });
    return;
  }

  const archiveMatch = path.match(/^\/api\/documents\/([^/]+)\/archive$/);
  if (request.method === "POST" && archiveMatch) {
    const context = requireSession(request, response);
    const documentId = decodeURIComponent(archiveMatch[1] ?? "");
    const document = documents.get(documentId);
    if (!context) {
      return;
    }
    if (!document || !canReadDocument(context.user.id, document)) {
      sendError(response, 404, "Not found");
      return;
    }

    document.status = "archived";
    document.updatedAt = nowIso();
    sendJson(response, 200, { document: publicDocument(document) });
    return;
  }

  const restoreMatch = path.match(/^\/api\/documents\/([^/]+)\/restore$/);
  if (request.method === "POST" && restoreMatch) {
    const context = requireSession(request, response);
    const documentId = decodeURIComponent(restoreMatch[1] ?? "");
    const document = documents.get(documentId);
    if (!context) {
      return;
    }
    if (!document || !canReadDocument(context.user.id, document)) {
      sendError(response, 404, "Not found");
      return;
    }

    document.status = "active";
    document.updatedAt = nowIso();
    sendJson(response, 200, { document: publicDocument(document) });
    return;
  }

  if (request.method === "POST" && path === "/api/attachments/upload-intents") {
    const context = requireSession(request, response);
    if (!context) {
      return;
    }
    const body = await readJson(request);
    const documentId = String(body.documentId ?? "");
    const document = documents.get(documentId);
    if (!document || !canEditDocument(context.user.id, document)) {
      sendError(response, 403, "Forbidden");
      return;
    }

    const timestamp = nowIso();
    const intentId = nextId("upload-intent");
    const intent = {
      id: intentId,
      documentId,
      uploaderUserId: context.user.id,
      blockType: body.blockType === "file" ? "file" : "image",
      storageKey: `tmp/uploads/e2e/${intentId}/${String(body.fileName ?? "attachment").replace(/[^a-zA-Z0-9._-]+/g, "-")}`,
      fileName: String(body.fileName ?? "attachment"),
      mimeType: String(body.mimeType ?? "application/octet-stream").toLowerCase(),
      sizeBytes: Number(body.sizeBytes ?? 0),
      checksum: typeof body.checksum === "string" ? body.checksum : null,
      status: "pending",
      failureReason: null,
      failureDetail: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      confirmedAt: null,
      cleanedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    uploadIntents.set(intent.id, intent);
    sendJson(response, 200, {
      intent: publicIntent(intent),
      upload: {
        method: "PUT",
        url: localObjectStorageUrl("PUT", intent.storageKey, intent.expiresAt),
        requiredHeaders: { "content-type": intent.mimeType },
        expiresAt: intent.expiresAt
      }
    });
    return;
  }

  const localObjectUploadMatch = path.match(/^\/local-object-storage\/upload\/([^/]+)$/);
  if (request.method === "OPTIONS" && localObjectUploadMatch) {
    const headers = corsHeaders(request, "PUT");
    if (!headers) {
      sendError(response, 403, "Origin not allowed");
      return;
    }
    preflightedUploadTokens.add(localObjectUploadMatch[1] ?? "");
    sendEmpty(response, 204, headers);
    return;
  }

  if (request.method === "PUT" && localObjectUploadMatch) {
    const headers = corsHeaders(request, "PUT");
    if (!headers) {
      sendError(response, 403, "Origin not allowed");
      return;
    }
    if (Object.keys(request.headers).some((header) => forbiddenDirectUploadHeaderNames.has(header.toLowerCase()))) {
      sendError(response, 400, "Direct upload must not include browser credentials");
      return;
    }
    const storageKey = verifyLocalObjectStorageUrl("PUT", url);
    const intent = storageKey
      ? Array.from(uploadIntents.values()).find((candidate) => candidate.storageKey === storageKey)
      : undefined;
    if (!intent || intent.status !== "pending") {
      sendError(response, 404, "Not found");
      return;
    }
    const objectBody = await readBody(request);
    uploadedObjects.set(storageKey, {
      body: objectBody,
      sizeBytes: objectBody.length,
      mimeType: String(request.headers["content-type"] ?? "application/octet-stream").toLowerCase(),
      etag: `"etag-${intent.id}"`
    });
    sendEmpty(response, 200, {
      ...headers,
      ETag: `"etag-${intent.id}"`,
      "X-Jixia-E2E-Preflight-Seen": preflightedUploadTokens.has(localObjectUploadMatch[1] ?? "") ? "true" : "false"
    });
    return;
  }

  const confirmMatch = path.match(/^\/api\/attachments\/upload-intents\/([^/]+)\/confirm$/);
  if (request.method === "POST" && confirmMatch) {
    const context = requireSession(request, response);
    const intentId = decodeURIComponent(confirmMatch[1] ?? "");
    const intent = uploadIntents.get(intentId);
    const object = intent ? uploadedObjects.get(intent.storageKey) : undefined;
    if (!context) {
      return;
    }
    if (!intent || intent.uploaderUserId !== context.user.id || intent.status !== "pending") {
      sendError(response, 404, "Not found");
      return;
    }
    if (!object || object.sizeBytes !== intent.sizeBytes || object.mimeType !== intent.mimeType) {
      intent.status = "failed";
      intent.failureReason = "object_missing";
      intent.failureDetail = "Uploaded object missing or mismatched";
      intent.updatedAt = nowIso();
      sendError(response, 409, "Uploaded object missing");
      return;
    }

    const timestamp = nowIso();
    intent.status = "confirmed";
    intent.confirmedAt = timestamp;
    intent.updatedAt = timestamp;
    const attachment = {
      id: nextId("attachment"),
      documentId: intent.documentId,
      uploadIntentId: intent.id,
      uploadedByUserId: context.user.id,
      storageKey: intent.storageKey,
      fileName: intent.fileName,
      mimeType: intent.mimeType,
      sizeBytes: intent.sizeBytes,
      checksum: intent.checksum,
      etag: object.etag,
      createdAt: timestamp
    };
    attachments.set(attachment.id, attachment);
    sendJson(response, 200, {
      intent: publicIntent(intent),
      attachment: publicAttachment(attachment)
    });
    return;
  }

  const downloadMatch = path.match(/^\/api\/attachments\/([^/]+)\/download$/);
  if (request.method === "POST" && downloadMatch) {
    const context = requireSession(request, response);
    const attachmentId = decodeURIComponent(downloadMatch[1] ?? "");
    const attachment = attachments.get(attachmentId);
    const document = attachment ? documents.get(attachment.documentId) : undefined;
    if (!context) {
      return;
    }
    if (!attachment || !document || !canReadDocument(context.user.id, document)) {
      sendError(response, 404, "Not found");
      return;
    }
    sendJson(response, 200, {
      attachment: publicAttachment(attachment),
      downloadUrl: localObjectStorageUrl("GET", attachment.storageKey, new Date(Date.now() + 15 * 60 * 1000).toISOString()),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
    return;
  }

  const localObjectDownloadMatch = path.match(/^\/local-object-storage\/download\/([^/]+)$/);
  if (request.method === "OPTIONS" && localObjectDownloadMatch) {
    const headers = corsHeaders(request, "GET");
    if (!headers) {
      sendError(response, 403, "Origin not allowed");
      return;
    }
    sendEmpty(response, 204, headers);
    return;
  }

  if (request.method === "GET" && localObjectDownloadMatch) {
    const headers = corsHeaders(request, "GET");
    if (!headers) {
      sendError(response, 403, "Origin not allowed");
      return;
    }
    const storageKey = verifyLocalObjectStorageUrl("GET", url);
    const attachment = storageKey
      ? Array.from(attachments.values()).find((candidate) => candidate.storageKey === storageKey)
      : undefined;
    const object = storageKey ? uploadedObjects.get(storageKey) : undefined;
    if (!attachment || !object) {
      sendError(response, 404, "Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(object.body.length),
      "Cache-Control": "no-store",
      ETag: object.etag,
      ...headers
    });
    response.end(object.body);
    return;
  }

  sendError(response, 404, "Not found");
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${apiPort}`}`);
  handleApiRequest(request, response, url).catch((error) => {
    if (error instanceof SyntaxError) {
      sendError(response, 400, "Invalid request");
      return;
    }
    sendError(response, 500, "E2E fixture failure");
  });
});

server.listen(apiPort, apiListenHost, () => {
  process.stdout.write(`Jixia E2E API fixture listening on ${apiListenHost}:${apiPort}\n`);
  process.stdout.write(`Jixia E2E API public origin ${apiPublicOrigin}\n`);
  process.stdout.write(`Jixia E2E object-storage public base ${localObjectStoragePublicBaseUrl}\n`);
  process.stdout.write(`Jixia E2E allowed origins ${Array.from(allowedOrigins).join(", ")}\n`);
});

function closeServer() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", closeServer);
process.on("SIGINT", closeServer);
