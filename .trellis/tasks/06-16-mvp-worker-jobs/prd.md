# Add worker jobs

## Goal

Complete the MVP worker runtime by wiring existing cleanup jobs into a safe interval-based worker entrypoint and adding the missing upload-intent terminal metadata cleanup job.

The worker must preserve Jixia's server-first and privacy boundaries: clean expired or retained metadata only through backend repositories/storage adapters, avoid logging secrets or signed URLs, and provide testable job functions with deterministic scheduling behavior.

## Source of Truth

- `doc/MVP_rule.md` overrides `doc/Design.md` whenever they differ.
- The API remains the authoritative source of permissions, storage keys, signed URLs, AI data, and audit boundaries.
- The worker is a backend runtime for maintenance jobs only; it must not expose browser APIs, bypass repository rules, or emit sensitive payloads.

## In Scope

- Replace the placeholder worker entrypoint with an interval scheduler.
- Schedule existing cleanup jobs:
  - `cleanupUploadIntents` every 5 minutes.
  - `cleanupUploadIntentMetadata` every 1 day.
  - `cleanupAIUsage` every 1 day.
- Add `cleanup-upload-intent-metadata` job for terminal upload-intent metadata retention.
- Keep existing cleanup upload-intent and AI usage jobs reusable/testable.
- Add or update worker tests for scheduler/job behavior.
- Run worker-focused and workspace verification.

## Out of Scope

- New product features or user-facing APIs.
- Public buckets, public download URLs, direct browser storage access, or frontend worker controls.
- Changing locked attachment/AI retention constants unless a shared contract mismatch blocks implementation.
- Persisting/logging signed URLs, object storage credentials, API keys, prompts, responses, selected context body, request headers, tokens, file contents, or document content.
- Git commit/push/PR creation.

## Existing Jobs and Constants

The implementation should reuse existing modules where present:

- `apps/worker/src/jobs/cleanup-upload-intents.ts`
- `apps/worker/src/jobs/cleanup-ai-usage.ts`
- Shared attachment retention constants from `@jixia/shared`.

Task 9 and Task 10 already implemented focused cleanup behavior; this task wires those jobs into a durable worker runtime and adds terminal metadata cleanup.

## Requirements

### Worker Entrypoint

- `apps/worker/src/index.ts` must start an interval-based worker runtime.
- Jobs and intervals:
  - expired pending upload-intent cleanup every 5 minutes.
  - terminal upload-intent metadata cleanup every 1 day.
  - old AI usage aggregate cleanup every 1 day.
- The entrypoint should run jobs safely with no overlapping executions per job.
- The entrypoint should support graceful shutdown for process signals.
- Logging must be metadata/count-only and must not include signed URLs, storage keys when avoidable, API keys, credentials, headers, document content, attachment content, prompts, responses, or selected context body.
- The scheduler should be injectable/testable without requiring real timers in tests.

### Cleanup Upload Intent Metadata Job

- Create `apps/worker/src/jobs/cleanup-upload-intent-metadata.ts`.
- Delete or minimize terminal `UploadIntent` metadata only after the locked retention window.
- Retention window: `terminalUploadIntentMetadataRetentionDays` / 30 days from shared attachment contracts.
- Terminal statuses are locked: `confirmed`, `failed`, `expired`, `cleaned`.
- Pending upload intents must never be removed by this metadata cleanup job.
- Recent terminal rows inside retention must be preserved.
- Job return value must be structured counts only, for example `{ deleted: number, cutoff: Date }` or equivalent.
- Error details must be sanitized and count-oriented.

### Existing Cleanup Jobs

- Preserve expired-pending upload-intent cleanup semantics:
  - expired pending intent is claimed and object cleanup is attempted.
  - confirmed intent is skipped.
  - storage errors do not expose credentials/signed URLs.
- Preserve AI usage cleanup semantics:
  - `AIUsageAggregate` rows older than the 30-day retention cutoff are deleted.
  - no prompt/response/context/provider credential fields are inspected or logged.

## Acceptance Criteria

- [ ] Worker entrypoint schedules `cleanupUploadIntents` every 5 minutes.
- [ ] Worker entrypoint schedules `cleanupUploadIntentMetadata` every 1 day.
- [ ] Worker entrypoint schedules `cleanupAIUsage` every 1 day.
- [ ] Jobs do not overlap with themselves if a previous run is still active.
- [ ] Worker can shut down cleanly on signals.
- [ ] Terminal upload-intent metadata cleanup removes only old terminal rows beyond 30 days.
- [ ] Pending upload intents and recent terminal rows are preserved by metadata cleanup.
- [ ] Existing expired-pending upload-intent cleanup tests continue to pass.
- [ ] Existing old AI usage cleanup tests continue to pass.
- [ ] Worker build/lint/tests pass.
- [ ] No logs/results include secrets, signed URLs, request headers, tokens, file contents, prompts, responses, or credentials.

## Required Files

Update/create as needed:

- `apps/worker/src/index.ts`
- `apps/worker/src/jobs/cleanup-upload-intents.ts`
- `apps/worker/src/jobs/cleanup-ai-usage.ts`
- `apps/worker/src/jobs/cleanup-upload-intent-metadata.ts`
- `apps/worker/src/jobs/cleanup-upload-intents.test.ts`
- Additional focused worker tests if helpful, e.g. scheduler or metadata cleanup tests.

## Verification Commands

Run focused worker checks first, then broader checks when feasible:

```bash
pnpm --filter @jixia/worker test
pnpm --filter @jixia/worker build
pnpm --filter @jixia/worker lint
pnpm -r test
pnpm -r lint
pnpm -r build
```

Expected evidence:

- Expired pending upload intent is cleaned.
- Confirmed intent is skipped.
- Old AI usage aggregate is deleted after retention.
- Old terminal upload-intent metadata is removed after retention.
- Worker scheduler wires all MVP jobs with the required intervals.
