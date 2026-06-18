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
