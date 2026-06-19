# Cross-Layer Guide

For changes crossing API, database, worker, or frontend:

1. Define the data contract first.
2. Update shared types before consumers.
3. Check permission decisions stay in the API.
4. Verify storage, AI, and audit rules do not leak sensitive content.

## Scenario: AI Runtime And Provider Health Contracts

### 1. Scope / Trigger
- Trigger: A change adds or modifies AI provider configuration, provider health testing, conversation runs, streaming events, cancellation, chat rendering state, or provider/model selection across `packages/shared/src/ai.ts`, `apps/api/src/modules/ai/**`, and `apps/web/src/features/ai/**`.
- Scope: Shared AI DTOs, Fastify AI routes, AI config/conversation services, provider adapters, and web chat/settings components that consume those contracts.
- Boundary: Browser code must never call AI providers directly, store prompts/responses/provider keys in browser storage, decide AI permissions, or synthesize fake run/stream/cancel state without a server-owned contract.

### 2. Signatures
- Provider metadata view: `AIProviderConfigView` exposes provider/model/baseURL/default/key status only; raw and encrypted keys remain server-private.
- Health test result: `ProviderHealthCheck` returns `ok`, safe `category`, safe `message`, `latencyMs`, provider/model/baseURL, and timestamp.
- Run lifecycle: `AIConversationRunDTO` uses `queued | running | succeeded | failed | cancelled` plus timestamps, provider config id, usage, and safe error fields.
- Stream event union: `AIConversationRunStreamEvent` carries ordered `run`, `user_message`, `assistant_delta`, `assistant_message`, `usage`, `error`, and `done` events.
- Routes: provider tests use `POST /ai/configs/test` for drafts and `POST /ai/configs/:configId/test` for saved configs; streaming uses `POST /ai/conversations/:conversationId/messages/stream`; cancellation uses `POST /ai/runs/:runId/cancel`.

### 3. Contracts
- The API owns provider execution, encrypted key reads, authorization, context validation, run lifecycle, final message persistence, usage recording, and cancellation controllers.
- SSE stream responses must contain only shared stream events serialized as `data: <json>\n\n`; provider request JSON, response JSON, headers, raw errors, raw keys, encrypted keys, and stack traces are forbidden.
- Stop buttons may be rendered only when the frontend has a current server run id from a stream event and a real cancel endpoint path.
- Provider health tests must use the same server adapter path as chat, accept unsaved draft keys without persistence, and test saved configs with the server-side encrypted key unless a write-only replacement key is supplied.
- Provider errors shown to browsers must map to safe categories such as invalid base URL, missing key, invalid key, model not found, rate limit, timeout, provider unavailable, response parse failure, cancellation, or unknown.
- Composer text and streamed assistant text are local UI state only during a run; they must not be persisted to localStorage/sessionStorage or sent outside Jixia API routes.
- Rich message rendering may use focused Markdown/GFM dependencies, but code copy, tables, links, source cards, and run-step UI must remain projection-only and must not add document mutation affordances.

### 4. Validation & Error Matrix
- Draft provider test missing a key -> return `ProviderHealthCheck` with `ok: false`, category `missing_key`, and a safe remediation message.
- Invalid or blocked provider base URL -> reject before credentials are sent and return category `invalid_base_url`.
- Provider 401/403 -> category `invalid_key`; 404 or model-specific unsupported response -> category `model_not_found`; 408/504 or timeout abort -> category `timeout`; 429 -> category `rate_limit`; 5xx/network unavailable -> category `provider_unavailable`; malformed response/stream -> category `response_parse_failure`; user cancel -> category `cancelled`.
- Cancel before provider completion -> abort the server controller, emit or return cancelled run state, and persist only safe cancelled message/run metadata.
- Cancel after completion -> return the completed run state without changing succeeded persistence.
- Any browser response, shared DTO, test assertion, loggable usage payload, or rendered UI exposes provider keys, encrypted keys, authorization headers, raw provider payloads, prompt logs outside the private conversation model, or stack traces -> block PR.

### 5. Good/Base/Bad Cases
- Good: The API streams `assistant_delta` events and persists one final assistant message server-side before sending `done` with the updated conversation.
- Good: Settings tests a draft provider with a typed key, receives safe health metadata, and the config repository remains unchanged.
- Good: Editing a saved provider with a blank key field omits `apiKey` from PATCH and preserves the encrypted server-side key.
- Base: The frontend accumulates deltas by `messageId` and replaces the streaming placeholder with the final `assistant_message`/`done` conversation.
- Bad: The UI shows Stop because a fetch is pending but has no server run id or cancel endpoint.
- Bad: A provider health endpoint returns raw provider error text, request bodies, response bodies, authorization headers, or key previews.
- Bad: Chat stores prompt drafts, responses, provider ids, auth shortcuts, or provider keys in localStorage/sessionStorage.

### 6. Tests Required
- Shared/API tests must cover new AI DTOs or route contracts that cross the API/frontend boundary.
- Provider adapter tests must cover base URL normalization/blocking, status-to-category mapping, response parsing, streaming chunk accumulation, timeout, and cancellation behavior when changed.
- Conversation service tests must cover stream event ordering, final persistence, safe error projection, usage recording, cancel-before-completion, and cancel-after-completion.
- Config service/route tests must cover draft and saved provider health checks, safe error taxonomy, blank-key preservation, and key redaction.
- Web chat/settings tests must cover SSE parsing, progressive rendering, real stop endpoint use, rich Markdown/code/table layout hooks, provider cards, health result display, and absence of forbidden browser storage.
- Final verification for AI cross-layer changes must include lint/typecheck plus focused API and web tests before broader workspace checks.

### 7. Wrong vs Correct
#### Wrong
```typescript
const key = localStorage.getItem("providerApiKey");
await fetch(providerBaseURL, { headers: { Authorization: `Bearer ${key}` } });
setIsRunning(true);
```

#### Correct
```typescript
const response = await apiStream(`/ai/conversations/${conversationId}/messages/stream`, {
  method: "POST",
  json: { providerConfigId, message, selectedContextSnapshot }
});

for await (const event of readChatStream(response)) {
  applyServerRunEvent(event);
}
```

## Scenario: Local Attachment Object Storage Contract

### 1. Scope / Trigger
- Trigger: attachment upload work changes `apps/api/src/modules/attachments/object-storage.ts`, local object-storage routes, web upload helpers, E2E fixtures, or local review storage documentation.
- Scope: API object-storage driver selection, local signed upload/download routes, browser direct-upload client behavior, attachment confirmation, editor snapshot persistence, and E2E fixture modeling of the public upload contract.
- Boundary: This contract does not approve production local storage, public buckets, browser-side authorization decisions, database schema changes, Markdown/PDF export, CRDT/realtime collaboration, AI writeback, or code-block UI work.

### 2. Signatures
- Driver selector: `createObjectStorageFromEnv(env)` returns S3-compatible storage in production and may return `LocalObjectStorage` only when `NODE_ENV !== "production"` or `ATTACHMENT_STORAGE_DRIVER=local` is explicitly used outside production.
- Local routes: `PUT /local-object-storage/upload/:storageKeyToken`, `GET /local-object-storage/download/:storageKeyToken`, and matching `OPTIONS` preflights serve only `LocalObjectStorage` signed URLs.
- Public attachment flow: browser code calls `POST /attachments/upload-intents`, direct `PUT` to the returned signed target with `credentials: "omit"`, `POST /attachments/upload-intents/:uploadIntentId/confirm`, and `POST /attachments/:attachmentId/download` for transient opening.
- Persisted editor shape: image/file blocks store `attachmentId` plus safe `attrs.attachment`/display metadata only; direct upload/download targets remain transient.

### 3. Contracts
- Production must never silently use the local driver. Missing or partial S3 configuration in production must fail startup with sanitized diagnostics, and `ATTACHMENT_STORAGE_DRIVER=local` must be rejected in production.
- Development and E2E may use local storage without public cloud credentials, but the contract shape must remain upload intent -> direct upload -> confirm -> signed download.
- The API remains the authority for document edit/download permissions, storage-key generation, upload-intent status transitions, object `HEAD` verification, and signed download creation.
- Local direct upload routes must enforce allowed origins, allowed methods, required headers, exposed `ETag`, signed URL expiry/signature validation, and rejection of browser cookies or authorization headers.
- Shared DTOs and persisted document snapshots must not expose storage keys, object keys, bucket names, signed URLs, upload headers, credentials, authorization headers, or cookies except transient direct upload/download response fields already defined for the flow.
- E2E fixtures may keep in-memory storage state but must exercise public API paths and browser direct uploads rather than bypassing the UI through mocks or direct object-store clients.

### 4. Validation & Error Matrix
- Production environment selects local storage, or development with partial `S3_*` silently falls back to local -> block PR until startup fails loudly.
- Direct upload request includes `Cookie`, `Authorization`, credential-like `x-amz-*` headers not issued by the server, or a disallowed `Origin` -> reject without writing the object.
- Confirming an upload before object write, after expiry, with wrong owner, after permission revocation, or with size/MIME mismatch -> fail closed and record the locked upload failure reason.
- Any editor snapshot, shared DTO, frontend block prop, E2E fixture assertion, generated report, or log output persists raw storage keys, signed URLs, storage credentials, or authorization headers -> block PR.
- A browser or frontend helper computes attachment/document permission from roles or bypasses the API download endpoint -> block PR.

### 5. Good/Base/Bad Cases
- Good: local review starts with `ATTACHMENT_STORAGE_DRIVER=local`, uploads from `http://127.0.0.1:5173`, confirms via object metadata, saves a block containing only `attachmentId`, and opens it through the API download endpoint.
- Good: production startup without complete S3-compatible settings fails with a generic incomplete-configuration message that omits raw values and secrets.
- Base: E2E fixture models local signed URLs and CORS in memory while still requiring UI upload, direct `PUT`, confirm, save, reload, and download calls.
- Bad: document content stores `upload.url`, `downloadUrl`, `storageKey`, `bucket`, `X-Amz-Signature`, or a public object URL.
- Bad: local storage routes are registered as a production fallback or accept credentialed browser uploads because the app session cookie is available.

### 6. Tests Required
- API tests must cover S3/local driver selection, incomplete configuration diagnostics, production local-driver rejection, local signed URL expiry, CORS preflight/headers, credentialed direct upload rejection, object metadata `HEAD` confirmation, failure reasons, and permission inheritance.
- Web tests must cover `uploadAttachment` using `credentials: "omit"` for direct upload, forbidden storage response/header rejection, redacted error messages, transient download opening, attachment block pending/success/failure UI, read-only mutation hiding, and safe snapshot export.
- E2E tests must cover real browser upload intent, direct local object upload, confirm, draft or formal save, reload/reopen persistence, permission-checked download/open, absence of API authorization headers, absence of direct-upload cookies/authorization, and no visible storage-key/signed-URL leakage.

### 7. Wrong vs Correct
#### Wrong
```typescript
const block = { type: "image", attrs: { uploadUrl: intent.upload.url, storageKey: intent.intent.storageKey } };
await fetch(intent.upload.url, { method: "PUT", body: file, credentials: "include" });
```

#### Correct
```typescript
await fetch(intent.upload.url, { method: "PUT", body: file, headers, credentials: "omit" });
const block = { type: "image", attachmentId: confirmed.attachment.id };
```
