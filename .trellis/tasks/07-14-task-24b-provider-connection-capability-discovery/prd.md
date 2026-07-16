# Task24b Provider Connection and Capability Discovery

## Goal

Replace the rejected manual-profile-first AI settings experience with a server-owned provider connection workflow: connect a provider, verify what can be verified without billable inference, synchronize observed model and capability facts, and present a compact model choice across settings, chat, and document Copilot.

This task succeeds the provider portion of failed Task21f without reopening or modifying that task. It must preserve encrypted server-owned credentials, browser-to-Jixia-only traffic, existing `modelProfileId` execution, user model choices, AI context controls, and AI no-writeback behavior.

## Requirements

### Provider connection lifecycle

- Support first-class connections for OpenAI, OpenRouter, Anthropic native, and arbitrary third-party OpenAI-compatible endpoints.
- Keep known-provider origins server-defined. A custom OpenAI-compatible connection may supply a base URL only through the existing server-side URL safety boundary.
- Separate transport reachability, authentication verification, and discovery availability into explicit states. Discovery unsupported must not be reported as invalid credentials.
- Test connections without issuing a completion, message, embedding, or other potentially billable inference request.
- Use provider-specific probes: OpenAI model listing, OpenRouter key verification plus account-aware model discovery, Anthropic native model listing with the required version header, and optional OpenAI-compatible model listing for custom endpoints.
- Normalize 401, 403, 404, 405, 429, upstream 5xx, timeout/network failure, malformed response, empty inventory, and unsupported discovery into safe product outcomes.
- Allow an authenticated owner to retry verification or refresh discovery without replacing a stored key.

### Durable safe sync state

- Persist only server-authoritative normalized connection and synchronization metadata needed by the product: provider kind, safe endpoint display data, verification/discovery outcomes, last attempt, last successful verification, last successful sync, safe error code, and inventory freshness.
- Never persist or return raw upstream response bodies, request or response headers, authorization material, raw or encrypted keys, SDK exception text, or provider request payloads.
- Store observed model facts with source and observation time. Capability fields must distinguish observed values from unknown or unsupported values; never infer capabilities from model names.
- Represent useful observed facts when a provider supplies them, including context limits, input/output modalities, and supported parameters. Missing provider facts remain unknown.
- Reconcile synchronized models without deleting user-created fallback profiles or overwriting existing display names, enabled choices, default selection, or compatible execution overrides.
- Preserve the `(providerConfigId, model)` identity boundary and existing `modelProfileId` execution contract.

### API and authorization

- The browser calls only authenticated Jixia API routes. Provider credentials and provider HTTP calls remain server-owned.
- Derive provider ownership from the authenticated session and fail closed for cross-user reads, updates, tests, synchronization, and deletion.
- Return transport-safe shared DTOs for connection state, synchronization results, model availability, observed capabilities, provenance, and freshness.
- Keep routes thin; provider-specific verification/discovery belongs in server adapters and orchestration belongs in the AI config service.
- Audit only metadata such as actor, connection ID, provider kind, normalized outcome, counts, and timestamps. Do not audit provider bodies, model payloads, headers, keys, prompts, or responses.

### Egress and secret safety

- Retain HTTPS-only custom endpoints with no username, password, query, or fragment.
- Reject loopback, private, link-local, unique-local, multicast, metadata-service, and otherwise unsafe destinations at the actual server connection boundary, including resolved IPv4 and IPv6 addresses.
- Do not follow redirects for provider probes. Bound probe time and response size.
- Keep UI, logs, tests, fixtures, errors, and analytics free of provider secrets and raw upstream payloads.

### Connection-first workbench experience

- Redesign AI settings around provider connections and synchronized inventory rather than manual model-profile administration.
- Make the primary path: choose provider, enter connection details, connect/test, synchronize capabilities, then select an available model.
- Show compact, comprehensible connection, verification, sync, freshness, empty, unsupported, and failure states without exposing implementation parameters as the main workflow.
- Keep manual model creation and compatible temperature/max-token overrides in an isolated Advanced fallback for custom or non-discoverable providers.
- Use the accepted bilingual workbench shell, typed locale catalog, compact controls, accessible labels, stable dimensions, and responsive geometry from Task24a.
- Update chat and document Copilot model selectors to use compact server-authorized model choices and availability state while preserving their current context and no-writeback contracts.

### Scope boundaries

- Do not modify or reopen `.trellis/tasks/07-01-task-21f-server-owned-ai-model-discovery`.
- Do not add provider marketplace, pricing comparison, quota display, billing, scheduled/background synchronization, automatic provider switching, or organization-shared credentials.
- Do not add literature search, source/evidence/citation contracts, Library, Reader, or document evidence insertion in this task.
- Do not change document mutation, revision, attachment, object-storage, or project-permission semantics.

## Acceptance Criteria

- [x] An authenticated user can create and test OpenAI, OpenRouter, Anthropic native, and custom OpenAI-compatible connections without the browser contacting an upstream provider.
- [x] Provider keys are encrypted at rest, never returned after submission, never placed in browser storage, and absent from logs, audit details, errors, fixtures, and shared DTOs.
- [x] Connection verification and model discovery have separate normalized outcomes; 404/405/501 discovery responses for a custom compatible endpoint do not mark credentials invalid.
- [x] No connection test issues a billable inference request.
- [x] Known-provider probes use fixed origins and provider-native authentication/protocol requirements.
- [x] Custom provider probes reject unsafe URLs and unsafe resolved IPv4/IPv6 destinations, do not follow redirects, and enforce bounded timeout/body handling.
- [x] Successful synchronization records safe provenance/freshness and upserts observed inventory while preserving display names, enabled/default choices, manual profiles, and compatible overrides.
- [x] Capability values are exposed only when observed from a provider response; absent values are represented as unknown or unsupported rather than inferred from names.
- [x] Empty, unsupported, rate-limited, unavailable, malformed, and stale synchronization states are distinguishable and recoverable through retry/refresh actions.
- [x] Cross-user provider config read, mutation, test, synchronization, and deletion attempts fail closed.
- [x] AI settings present connection -> test -> sync -> model choice as the primary bilingual workflow; manual profiles and execution parameters are confined to Advanced.
- [x] Chat and document Copilot retain compact enabled model selection, existing context controls, server-owned execution, and no-writeback behavior.
- [x] Settings, chat, and Copilot remain usable without overlap or horizontal page overflow at 390px, 1100px, and 1366px.
- [x] Focused shared, Prisma invariant, API adapter/service/route, web component, and Playwright tests cover success, ownership, unsupported discovery, refresh failures, empty inventory, choice preservation, secret leakage, and Jixia-only browser traffic.
- [x] Database validation/generation, workspace type checks, lint, production build, and relevant unit/E2E suites pass.
- [x] Manual browser review accepts the connection-first flow and confirms that the rejected manual-profile-first Task21f experience has not been reproduced.

## Technical Notes

- Start from `packages/shared/src/ai.ts`, `packages/db/prisma/schema.prisma`, and the existing AI config/provider adapter modules. Extend their contracts instead of creating a parallel credential system.
- Keep `AIProviderConfig` as the encrypted connection root and `AIModelProfile` as the execution identity. Add normalized status/capability fields or related records only where they represent durable product facts.
- Prefer provider-kind-specific adapter functions behind one normalized verification/discovery result. Do not force Anthropic native behavior through an OpenAI-compatible path.
- Preserve compatibility with existing conversations and document Copilot records that reference `modelProfileId`.
- Add a dedicated Playwright provider-connection journey using the Jixia API fixture; assert that browser requests never target provider origins.

## Verification

```bash
pnpm --filter @jixia/shared test
pnpm --filter @jixia/db db:validate
pnpm --filter @jixia/db db:generate
pnpm --filter @jixia/api test
pnpm --filter @jixia/web test
pnpm --filter @jixia/web lint
pnpm --filter @jixia/web build
pnpm --filter @jixia/web e2e -- provider-connection
```

## Manual Review Gate

After automated checks pass, exercise create, test, synchronize, refresh, unsupported discovery, empty inventory, stale/error recovery, advanced manual fallback, chat model selection, and Copilot model selection at mobile and desktop widths. Finish only after the flow is visibly connection-first, secrets remain server-owned, and no provider request leaves the browser.
