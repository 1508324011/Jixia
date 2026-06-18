# Worker Guidelines

## Scenario: MVP Cleanup Worker Runtime

### 1. Scope / Trigger
- Trigger: `apps/worker/src/index.ts` and `apps/worker/src/jobs/**` implement the backend-only maintenance runtime for upload-intent cleanup, terminal metadata retention cleanup, and AI usage aggregate cleanup.
- Scope: interval scheduling, graceful shutdown, cleanup job factories, Prisma-backed cleanup repositories, object-storage cleanup adapters, structured count-only job results, and focused worker tests.
- Boundary: Worker work must not add browser APIs, public buckets, public download URLs, user-facing controls, permission bypasses, document-content reads, AI provider calls, audit writing, or frontend authorization helpers.

### 2. Signatures
- Runtime factory: `createIntervalWorker({ jobs, timers, logger, runOnStart, now })` schedules injectable `WorkerJob` entries without requiring real timers in tests.
- Job definition: `WorkerJob` exposes `name`, `intervalMs`, and `run(): Promise<unknown>`; default MVP intervals are 5 minutes for expired pending upload intents and 1 day for terminal upload-intent metadata plus AI usage aggregates.
- Shutdown: `registerWorkerShutdownHandlers({ worker, processRef, signals, exitAfterShutdown })` stops intervals, awaits in-flight jobs, and handles `SIGINT`/`SIGTERM` without logging sensitive payloads.
- Cleanup jobs: `createCleanupUploadIntentsJob`, `createCleanupUploadIntentMetadataJob`, and `createCleanupAIUsageJob` return reusable testable job objects with count/cutoff style results only.

### 3. Contracts
- The worker is server-side maintenance infrastructure only. It may use backend repositories, Prisma, and private storage adapters, but must not expose or consume browser-facing runtime state.
- Each scheduled job must prevent overlapping executions with itself. A later interval/manual trigger may skip while the same job is still running, but unrelated jobs may continue independently.
- Expired upload-intent cleanup must atomically claim only `pending` rows whose `expiresAt` has passed, mark them terminal, attempt private object cleanup, and preserve confirmed or unexpired rows.
- Terminal upload-intent metadata cleanup must only remove terminal statuses `confirmed`, `failed`, `expired`, and `cleaned` after `terminalUploadIntentMetadataRetentionDays`; `pending` rows and recent terminal rows must be preserved.
- AI usage cleanup must delete only aggregate `AIUsageAggregate` rows older than `aiUsageRetentionDays`; it must not inspect prompt, response, selected context, provider credential, request header, token, or signed URL data.
- Worker logs and job results are metadata/count-only. They may include job names, durations, counts, sanitized statuses, and cutoff timestamps, but not signed URLs, API keys, authorization headers, cookies, tokens, object-storage credentials, file contents, document bodies, AI prompts/responses, selected context bodies, or raw object-storage failure details.

### 4. Validation & Error Matrix
- Missing storage configuration or object-storage failures during cleanup -> record sanitized storage-error metadata without echoing credentials, signed URLs, authorization headers, bucket credentials, request headers, object content, or file content.
- Confirm races with cleanup -> whichever process wins the atomic status transition owns the outcome; cleanup must skip rows already confirmed.
- Job run throws unexpectedly -> scheduler logs a sanitized failure with job name/trigger only and keeps future intervals available.
- Shutdown while jobs are active -> clear all intervals and await in-flight job promises before reporting shutdown complete.
- Unknown manual job name -> warn with the requested job name only and do not throw.

### 5. Good/Base/Bad Cases
- Good: `cleanupUploadIntents` returns `{ claimed, cleaned, missing, storageErrors }` and logs the same count summary without storage keys or signed URLs.
- Good: metadata cleanup deletes an old `confirmed` upload intent while preserving an old `pending` intent and a recent `cleaned` intent.
- Base: scheduler tests inject fake timers/process/logger to prove intervals, non-overlap, shutdown, and sanitized logging behavior deterministically.
- Bad: a worker logs a signed upload URL, `authorization` header, storage access key, raw `storageKey` on failure, AI prompt/response, request headers, document content, attachment content, or selected context body.
- Bad: metadata cleanup deletes `pending` intents, changes shared retention constants without product-rule updates, exposes a frontend cleanup trigger, or starts object cleanup from a document route.

### 6. Tests Required
- Focused worker package tests: `pnpm --filter @jixia/worker test` must cover MVP intervals, injectable timers, per-job non-overlap, graceful shutdown, expired pending upload-intent cleanup, confirmed/unexpired preservation, sanitized storage errors, terminal metadata retention, pending/recent metadata preservation, and AI usage aggregate retention.
- Worker verification: `pnpm --filter @jixia/worker build` and `pnpm --filter @jixia/worker lint` must pass before PR readiness.
- Repository verification: `pnpm -r test`, `pnpm -r lint`, and `pnpm -r build` must pass when feasible before PR readiness.
- Contract review: scan worker logs/results and cleanup repositories for signed URLs, authorization headers, cookies, tokens, credentials, file contents, document bodies, prompts, responses, selected context bodies, and raw provider/storage payloads.

### 7. Wrong vs Correct
#### Wrong
```typescript
logger.error("cleanup failed", { storageKey, signedUrl, authorization, error });
```

#### Correct
```typescript
logger.error("worker job failed", { job: "cleanupUploadIntents", trigger: "interval" });
```
