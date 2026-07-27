import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { createLiteratureTestApi } from "./literature-test-api.mjs";

const projectId = "project-role-policy";
const ownerId = "owner-user";
const editorId = "editor-user";
const viewerId = "viewer-user";
const nonmemberId = "nonmember-user";

function createApi() {
  const roles = new Map([
    [ownerId, "ProjectOwner"],
    [editorId, "ProjectEditor"],
    [viewerId, "ProjectViewer"]
  ]);
  return createLiteratureTestApi({
    authenticate: (request) => request.userId,
    canReadProject: (userId, candidateProjectId) => candidateProjectId === projectId && roles.has(userId),
    canWriteProject: (userId, candidateProjectId) => candidateProjectId === projectId && roles.get(userId) !== "ProjectViewer"
  });
}

async function callApi(api, { body, method, path, userId }) {
  const request = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  request.headers = body === undefined ? {} : { "idempotency-key": crypto.randomUUID() };
  request.method = method;
  request.userId = userId;
  const response = {
    body: "",
    statusCode: 0,
    end(payload) {
      this.body = payload;
    },
    writeHead(statusCode) {
      this.statusCode = statusCode;
    }
  };

  await api.handle({
    path,
    request,
    response,
    url: new URL(`http://localhost${path}`)
  });

  return { body: JSON.parse(response.body), statusCode: response.statusCode };
}

function projectImportBody() {
  return {
    seed: { providerKey: "openalex", recordKey: "WALPHA" },
    target: { scope: "project", projectId }
  };
}

test("project literature is concealed from nonmembers", async () => {
  // Given
  const api = createApi();

  // When
  const list = await callApi(api, {
    method: "GET",
    path: `/api/literature?scope=project&projectId=${projectId}`,
    userId: nonmemberId
  });
  const imported = await callApi(api, {
    body: projectImportBody(),
    method: "POST",
    path: "/api/literature/imports",
    userId: nonmemberId
  });

  // Then
  assert.equal(list.statusCode, 404);
  assert.equal(imported.statusCode, 404);
});

test("project viewers cannot mutate literature", async () => {
  // Given
  const api = createApi();
  const ownerImport = await callApi(api, {
    body: projectImportBody(),
    method: "POST",
    path: "/api/literature/imports",
    userId: ownerId
  });
  const operationId = ownerImport.body.operation.id;

  // When
  const imported = await callApi(api, {
    body: projectImportBody(),
    method: "POST",
    path: "/api/literature/imports",
    userId: viewerId
  });
  const retried = await callApi(api, {
    method: "POST",
    path: `/api/literature/imports/${operationId}/retry`,
    userId: viewerId
  });

  // Then
  assert.equal(imported.statusCode, 403);
  assert.equal(retried.statusCode, 403);
});

test("project editors can import literature", async () => {
  // Given
  const api = createApi();

  // When
  const imported = await callApi(api, {
    body: projectImportBody(),
    method: "POST",
    path: "/api/literature/imports",
    userId: editorId
  });

  // Then
  assert.equal(imported.statusCode, 201);
});
