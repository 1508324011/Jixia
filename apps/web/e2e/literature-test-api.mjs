import { importedLiteratureFixture, literatureSearchFixture } from "./literature-test-data.mjs";

export function createLiteratureTestApi({ authenticate, canReadProject, canWriteProject }) {
  const idempotency = new Map();
  const operations = new Map();
  const literature = new Map();
  let sequence = 0;

  async function handle({ path, request, response, url }) {
    if (!path.startsWith("/api/literature")) return false;

    const userId = authenticate(request, response);
    if (userId === null) return true;

    if (request.method === "POST" && path === "/api/literature/discovery/search") {
      const body = await readJson(request);
      sendJson(response, 200, literatureSearchFixture(String(body.query ?? "")));
      return true;
    }

    if (request.method === "POST" && path === "/api/literature/imports") {
      await createImport({ request, response, userId });
      return true;
    }

    const operationMatch = path.match(/^\/api\/literature\/imports\/([^/]+)$/);
    if (request.method === "GET" && operationMatch) {
      getOperation(operationMatch[1], response, userId);
      return true;
    }

    const retryMatch = path.match(/^\/api\/literature\/imports\/([^/]+)\/retry$/);
    if (request.method === "POST" && retryMatch) {
      retryImport(retryMatch[1], response, userId);
      return true;
    }

    if (request.method === "GET" && path === "/api/literature") {
      listLiterature(response, url, userId);
      return true;
    }

    const detailMatch = path.match(/^\/api\/literature\/([^/]+)$/);
    if (request.method === "GET" && detailMatch) {
      getLiterature(detailMatch[1], response, userId);
      return true;
    }

    sendError(response, 404, "Literature route not found");
    return true;
  }

  async function createImport({ request, response, userId }) {
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !isUuid(key)) {
      sendError(response, 400, "Valid Idempotency-Key required");
      return;
    }

    const body = await readJson(request);
    const scope = resolveScope(body.target, userId);
    if (scope === null) {
      sendError(response, 400, "Invalid literature target");
      return;
    }
    if (scope.kind === "project" && !canReadProject(userId, scope.projectId)) {
      sendError(response, 404, "Project not found");
      return;
    }
    if (scope.kind === "project" && !canWriteProject(userId, scope.projectId)) {
      sendError(response, 403, "Project access denied");
      return;
    }

    const replayKey = `${userId}:${key}`;
    const signature = JSON.stringify(body);
    const replay = idempotency.get(replayKey);
    if (replay) {
      if (replay.signature !== signature) {
        sendError(response, 409, "Idempotency key request mismatch");
        return;
      }
      sendJson(response, 200, { operation: operations.get(replay.operationId).operation });
      return;
    }

    const providerKey = String(body.seed?.providerKey ?? "");
    const recordKey = String(body.seed?.recordKey ?? "");
    const shouldFail = scope.kind === "personal" && providerKey === "pubmed";
    const shouldExpire = scope.kind === "personal" && recordKey === "lease-expired";
    const title = shouldExpire ? "Lease recovery evidence" : "Glioblastoma evidence synthesis";
    const operationId = nextId("literature-import");
    const literatureId = nextId("literature");
    const entry = {
      literatureId,
      operation: shouldExpire
        ? expiredRunningOperation(operationId, scope, userId, 1)
        : shouldFail
          ? failedOperation(operationId, scope, userId, 1)
          : succeededOperation(operationId, scope, userId, literatureId, 1),
      scope,
      title,
      userId
    };
    operations.set(operationId, entry);
    idempotency.set(replayKey, { operationId, signature });
    if (entry.operation.status === "succeeded") storeLiterature(entry);
    sendJson(response, 201, { operation: entry.operation });
  }

  function getOperation(operationId, response, userId) {
    const entry = operations.get(operationId);
    if (!entry || !canReadScope(userId, entry.scope)) {
      sendError(response, 404, "Import operation not found");
      return;
    }
    sendJson(response, 200, { operation: entry.operation });
  }

  function retryImport(operationId, response, userId) {
    const entry = operations.get(operationId);
    if (!entry || !canReadScope(userId, entry.scope)) {
      sendError(response, 404, "Import operation not found");
      return;
    }
    if (!canWriteScope(userId, entry.scope)) {
      sendError(response, 403, "Project access denied");
      return;
    }
    if (!isRetryableOperation(entry.operation)) {
      sendError(response, 409, "Import operation cannot be retried");
      return;
    }
    entry.operation = succeededOperation(
      operationId,
      entry.scope,
      entry.userId,
      entry.literatureId,
      entry.operation.attemptCount + 1,
      entry.operation.createdAt
    );
    storeLiterature(entry);
    sendJson(response, 200, { operation: entry.operation });
  }

  function listLiterature(response, url, userId) {
    const scopeName = url.searchParams.get("scope");
    const projectId = url.searchParams.get("projectId");
    if (scopeName === "project" && (!projectId || !canReadProject(userId, projectId))) {
      sendError(response, 404, "Project not found");
      return;
    }
    if (scopeName !== "personal" && scopeName !== "project") {
      sendError(response, 400, "Invalid literature scope");
      return;
    }
    const summaries = Array.from(literature.values())
      .filter((entry) => scopeName === "personal"
        ? entry.summary.scope.kind === "personal" && entry.summary.scope.ownerUserId === userId
        : entry.summary.scope.kind === "project" && entry.summary.scope.projectId === projectId)
      .map((entry) => entry.summary);
    sendJson(response, 200, { literature: summaries, nextCursor: null });
  }

  function getLiterature(literatureId, response, userId) {
    const entry = literature.get(literatureId);
    if (!entry || !canReadScope(userId, entry.summary.scope)) {
      sendError(response, 404, "Literature not found");
      return;
    }
    sendJson(response, 200, entry.detail);
  }

  function storeLiterature(entry) {
    literature.set(entry.literatureId, importedLiteratureFixture({
      createdByUserId: entry.userId,
      id: entry.literatureId,
      scope: entry.scope,
      title: entry.title
    }));
  }

  function canReadScope(userId, scope) {
    return scope.kind === "personal"
      ? scope.ownerUserId === userId
      : canReadProject(userId, scope.projectId);
  }

  function canWriteScope(userId, scope) {
    return scope.kind === "personal"
      ? scope.ownerUserId === userId
      : canWriteProject(userId, scope.projectId);
  }

  function resolveScope(target, userId) {
    if (target?.scope === "personal") return { kind: "personal", ownerUserId: userId };
    if (target?.scope === "project" && typeof target.projectId === "string") {
      return { kind: "project", projectId: target.projectId };
    }
    return null;
  }

  function nextId(prefix) {
    sequence += 1;
    return `${prefix}-${sequence}`;
  }

  return { handle };
}

function failedOperation(id, scope, userId, attemptCount) {
  const timestamp = new Date().toISOString();
  return operationBase(id, scope, userId, attemptCount, timestamp, {
    status: "failed",
    takeoverAfter: null,
    literatureId: null,
    failureCode: "seed_unavailable",
    finishedAt: timestamp
  });
}

function expiredRunningOperation(id, scope, userId, attemptCount) {
  const timestamp = new Date().toISOString();
  return operationBase(id, scope, userId, attemptCount, timestamp, {
    status: "running",
    takeoverAfter: new Date(Date.now() - 1_000).toISOString(),
    literatureId: null,
    failureCode: null,
    finishedAt: null
  });
}

function succeededOperation(id, scope, userId, literatureId, attemptCount, createdAt) {
  const timestamp = new Date().toISOString();
  return operationBase(id, scope, userId, attemptCount, createdAt ?? timestamp, {
    status: "succeeded",
    takeoverAfter: null,
    literatureId,
    failureCode: null,
    finishedAt: timestamp
  });
}

function operationBase(id, scope, createdByUserId, attemptCount, createdAt, terminal) {
  return {
    id,
    scope,
    createdByUserId,
    attemptCount,
    attemptStartedAt: new Date().toISOString(),
    warnings: [],
    createdAt,
    updatedAt: new Date().toISOString(),
    ...terminal
  };
}

function isRetryableOperation(operation) {
  return operation.status === "failed" || (
    operation.status === "running" &&
    Date.parse(operation.takeoverAfter) <= Date.now()
  );
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
