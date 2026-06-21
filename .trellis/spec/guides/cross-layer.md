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
- LAN/manual-review reachability: local review may derive an explicit same-host web origin from `LOCAL_OBJECT_STORAGE_PUBLIC_BASE_URL` when `LOCAL_OBJECT_STORAGE_ALLOWED_ORIGINS` is not configured, and browser helpers may rewrite loopback local object-storage signed upload/download hosts to the private reviewer host only for transient local `http://.../local-object-storage/{upload,download}/...` URLs.
- Persisted editor shape: image/file blocks store `attachmentId` plus safe `attrs.attachment`/display metadata only; direct upload/download targets remain transient.

### 3. Contracts
- Production must never silently use the local driver. Missing or partial S3 configuration in production must fail startup with sanitized diagnostics, and `ATTACHMENT_STORAGE_DRIVER=local` must be rejected in production.
- Development and E2E may use local storage without public cloud credentials, but the contract shape must remain upload intent -> direct upload -> confirm -> signed download.
- LAN/manual review must use a browser-reachable `LOCAL_OBJECT_STORAGE_PUBLIC_BASE_URL` and an explicit or safely derived non-wildcard allowed-origin list. If configured, `LOCAL_OBJECT_STORAGE_ALLOWED_ORIGINS` is authoritative; if omitted in development, same-host origin derivation is a local-only convenience and must not add `*`.
- The API remains the authority for document edit/download permissions, storage-key generation, upload-intent status transitions, object `HEAD` verification, and signed download creation.
- Local direct upload routes must enforce allowed origins, allowed methods, required headers, exposed `ETag`, signed URL expiry/signature validation, and rejection of browser cookies or authorization headers.
- Shared DTOs and persisted document snapshots must not expose storage keys, object keys, bucket names, signed URLs, upload headers, credentials, authorization headers, or cookies except transient direct upload/download response fields already defined for the flow.
- Browser-side loopback-to-private-host rewriting is allowed only for transient local object-storage signed URLs when the page runs on a private/LAN review host and the signed URL host is loopback. It must not rewrite production/S3/public cloud URLs, non-local paths, HTTPS URLs, shared DTOs, persisted snapshots, or browser storage.
- E2E fixtures may keep in-memory storage state but must exercise public API paths and browser direct uploads rather than bypassing the UI through mocks or direct object-store clients.

### 4. Validation & Error Matrix
- Production environment selects local storage, or development with partial `S3_*` silently falls back to local -> block PR until startup fails loudly.
- Direct upload request includes `Cookie`, `Authorization`, credential-like `x-amz-*` headers not issued by the server, or a disallowed `Origin` -> reject without writing the object.
- LAN review direct upload URL remains `localhost`/`127.0.0.1` for a browser opened from a private host, or CORS returns `*`/an unapproved origin -> block PR until the public base URL and allowed origins are corrected or the transient local rewrite is proven safe.
- Confirming an upload before object write, after expiry, with wrong owner, after permission revocation, or with size/MIME mismatch -> fail closed and record the locked upload failure reason.
- Any editor snapshot, shared DTO, frontend block prop, E2E fixture assertion, generated report, or log output persists raw storage keys, signed URLs, storage credentials, or authorization headers -> block PR.
- A browser or frontend helper computes attachment/document permission from roles or bypasses the API download endpoint -> block PR.

### 5. Good/Base/Bad Cases
- Good: local review starts with `ATTACHMENT_STORAGE_DRIVER=local`, uploads from `http://127.0.0.1:5173`, confirms via object metadata, saves a block containing only `attachmentId`, and opens it through the API download endpoint.
- Good: LAN review opens the web UI at `http://10.128.253.195:5173`, uses `LOCAL_OBJECT_STORAGE_PUBLIC_BASE_URL=http://10.128.253.195:3000/local-object-storage`, allows exactly `http://10.128.253.195:5173`, and the browser performs credentialless direct `PUT` against `http://10.128.253.195:3000/local-object-storage/upload/...`.
- Good: production startup without complete S3-compatible settings fails with a generic incomplete-configuration message that omits raw values and secrets.
- Base: E2E fixture models local signed URLs and CORS in memory while still requiring UI upload, direct `PUT`, confirm, save, reload, and download calls.
- Base: a local-only helper rewrites a loopback local object-storage signed URL to the current private review host for upload/open, but only before `fetch`/`window.open` and never before snapshot export.
- Bad: document content stores `upload.url`, `downloadUrl`, `storageKey`, `bucket`, `X-Amz-Signature`, or a public object URL.
- Bad: local storage routes are registered as a production fallback or accept credentialed browser uploads because the app session cookie is available.
- Bad: `LOCAL_OBJECT_STORAGE_ALLOWED_ORIGINS=*`, a production URL is rewritten by the browser helper, or a rewritten signed URL is stored in document content.

### 6. Tests Required
- API tests must cover S3/local driver selection, incomplete configuration diagnostics, production local-driver rejection, local signed URL expiry, CORS preflight/headers, credentialed direct upload rejection, object metadata `HEAD` confirmation, failure reasons, and permission inheritance.
- Web tests must cover `uploadAttachment` using `credentials: "omit"` for direct upload, forbidden storage response/header rejection, redacted error messages, transient download opening, attachment block pending/success/failure UI, read-only mutation hiding, and safe snapshot export.
- E2E tests must cover real browser upload intent, direct local object upload, non-wildcard CORS origin echo, preflight evidence when applicable, confirm, draft or formal save, reload/reopen persistence, permission-checked download/open, absence of API authorization headers, absence of direct-upload cookies/authorization, and no visible storage-key/signed-URL leakage. Real OS clipboard paste and file-manager drag observations remain manual-gate evidence, not synthetic-only proof.

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

## Scenario: BlockNote-Native Private Attachment Pipeline

### 1. Scope / Trigger
- Trigger: frontend document editor work changes BlockNote file/image/media insertion, file panel upload/replace, paste/drop file handling, private attachment preview/open/download resolution, or v1 attachment snapshot conversion in `apps/web/src/features/documents/editor/**` or `apps/web/src/features/attachments/**`.
- Scope: shared Notebook/Project `JixiaEditor`, BlockNote `uploadFile(file, blockId?)`, `resolveFileUrl(url)`, built-in file/image/video/audio blocks, attachment upload/open helpers, browser E2E fixture coverage, and persisted editor snapshot export/import.
- Boundary: This contract does not approve custom shell/card event handling as the primary file pipeline, public storage URLs, browser-side authorization, backend storage policy weakening, editor-engine replacement, schema migration, export/collaboration/comment/AI writeback work, or divergent Notebook and Project editors.

### 2. Signatures
- Upload adapter: BlockNote `uploadFile(file, blockId?)` calls the Jixia attachment intent -> direct `PUT` -> confirm helper and returns either the canonical private file URL plus safe props or a `PartialBlock` prop update that contains only `attachmentId`, `jixia-attachment:<id>`, and safe display/file metadata.
- URL resolver: BlockNote `resolveFileUrl(url)` recognizes canonical `jixia-attachment:<attachmentId>` URLs and resolves them through `POST /attachments/:attachmentId/download` only at render/open time.
- Native blocks: v1 `image` and `file` snapshots import to BlockNote native `image`/`file` blocks with extended safe props; legacy `jixiaImage`/`jixiaFile` may remain only as compatibility/export adapters.
- Read-only mode: BlockNote view/editor mutation affordances, file panel upload/replace, slash/insert controls, and metadata inputs are disabled while preview/open/download still use the resolver-time API flow.

### 3. Contracts
- BlockNote's file panel and built-in paste/drop insertion must be the primary upload, replace, paste, and drop path whenever BlockNote supports the payload; fallback handlers must delegate to or deliberately consume the default handler to avoid duplicate blocks.
- Drop insertion must rely on BlockNote/ProseMirror location semantics rather than appending at the last cursor block, and paste/drop must create exactly one file/media block per accepted file payload.
- The API remains the authority for document edit/read authorization, upload intent creation, direct upload target signing, confirmation, and signed download creation.
- Persisted snapshots, shared DTOs, browser storage, AI context, logs, and E2E fixture assertions must contain only app-owned attachment identity plus safe file/display metadata; transient signed upload/download URLs and storage internals stay out of exported document content.
- Notebook and Project document routes must share the same editor component and adapter behavior; do not fork editor implementations to satisfy one document type.

### 4. Validation & Error Matrix
- File panel upload/replace is unavailable while editing, or paste/drop relies on shell-level capture handlers as the main path -> block PR until the BlockNote-native path is restored.
- `uploadFile` or snapshot export persists `uploadUrl`, `downloadUrl`, signed/public URLs, storage keys, buckets, upload headers, authorization headers, cookies, credentials, or local object-storage paths -> block PR.
- Missing, unauthorized, deleted, expired, or failed downloads render as broken image/file UI without controlled error feedback -> block PR.
- Read-only documents show upload, replace, remove, resize, caption, or metadata mutation controls -> block PR.
- Notebook and Project documents use divergent editor code paths for attachment insertion, preview, or persistence -> block PR.

### 5. Good/Base/Bad Cases
- Good: the BlockNote file panel uploads an image through `uploadAttachment`, sets `url: "jixia-attachment:<id>"` and safe metadata on the native image block, saves a v1 snapshot with only `attachmentId` and `attrs.attachment`, then resolves a transient signed URL through `resolveFileUrl` after reload.
- Good: a dropped text file inserts at the visual drop location as one native file block and follows the same intent/direct-upload/confirm/save/reload/download path as file panel upload.
- Base: legacy `jixiaImage`/`jixiaFile` blocks from old snapshots render/export safely but are not the discoverable primary upload mechanism for new edits.
- Bad: an empty custom attachment card with hidden input, paste, and drop handlers is the main way to upload files in a new document.
- Bad: a saved native file block contains `https://...signature=...`, `storageKey`, `bucket`, `requiredHeaders`, or any browser credential field.

### 6. Tests Required
- Adapter/unit tests must prove v1 attachment snapshots import to native BlockNote file blocks, exported snapshots strip forbidden URL/storage/auth/provider fields, and legacy custom blocks remain safe compatibility adapters.
- Upload helper tests must cover intent request, direct upload with `credentials: "omit"`, confirm, forbidden storage/header rejection, phase-specific redacted error messages, and resolver-time private download opening.
- Browser E2E must cover project and notebook documents, BlockNote file panel upload/replace where reachable, paste image, paste/drop non-image file, direct local object-storage CORS/preflight/ETag evidence, save/reload persistence, signed download resolution, read-only mutation hiding, and absence of persisted storage secrets.
- Final verification for editor attachment changes should include focused `JixiaEditor`, `AttachmentBlock`, `uploadAttachment`, attachment-upload/document-save Playwright specs, web lint/typecheck, and web build when feasible.

### 7. Wrong vs Correct
#### Wrong
```typescript
editor.insertBlocks([{ type: "jixiaFile", props: { uploadUrl: intent.upload.url, storageKey } }], cursorBlock, "after");
```

#### Correct
```typescript
const attachmentId = confirmed.attachment.id;
editor.updateBlock(blockId, { props: { attachmentId, url: `jixia-attachment:${attachmentId}` } });
```
