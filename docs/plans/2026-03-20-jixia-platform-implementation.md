# Jixia Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `/home/zhurui/github_project/Jixia` 中搭建 `稷下` 的第一版 server-first 实验室内网科研平台骨架，先冻结空间/资产/治理边界，再打通导入、阅读、共享洞见和版本化写作的最小闭环。

**Architecture:** 采用单仓库 TypeScript 项目，目录按 `src/server`、`src/web`、`src/shared`、`src/db` 分层，与 ResearchClaw 的可迁移能力边界保持接近，但不继承其 Electron-first 假设。一期使用 same-origin Web + SQLite/Prisma + 服务器文件存储 + 持久化 Job/SSE 事件流，所有 AI 操作都经由服务端治理层执行。

**Tech Stack:** TypeScript, React, Vite, Node server runtime, Prisma, SQLite, Tailwind CSS, Vitest, Testing Library

---

### Task 1: Bootstrap the Jixia repository skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/server/index.ts`
- Create: `src/web/main.tsx`
- Create: `src/shared/index.ts`
- Create: `tests/smoke/repo-bootstrap.test.ts`

**Step 1: Write the failing test**

Create `tests/smoke/repo-bootstrap.test.ts` to assert that:
- the project exports a server entry at `src/server/index.ts`
- the project exports a web entry at `src/web/main.tsx`
- the base TypeScript path aliases compile under Vitest

```ts
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('repo bootstrap', () => {
  it('has server and web entrypoints', () => {
    expect(existsSync('src/server/index.ts')).toBe(true);
    expect(existsSync('src/web/main.tsx')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke/repo-bootstrap.test.ts`

Expected: FAIL because the repository skeleton does not exist yet.

**Step 3: Write minimal implementation**

Create the root toolchain files and empty server/web/shared entrypoints so the test passes. Keep the directory shape aligned with later `src/server`, `src/web`, `src/shared`, and `src/db` work.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke/repo-bootstrap.test.ts`

Expected: PASS with the initial repository structure present.

**Step 5: Commit**

```bash
git add package.json tsconfig.json vite.config.ts vitest.config.ts src/server/index.ts src/web/main.tsx src/shared/index.ts tests/smoke/repo-bootstrap.test.ts
git commit -m "feat: bootstrap jixia repository skeleton"
```

### Task 2: Freeze core contracts for spaces, assets, writing, and jobs

**Files:**
- Create: `src/shared/contracts/spaces.ts`
- Create: `src/shared/contracts/library.ts`
- Create: `src/shared/contracts/reading.ts`
- Create: `src/shared/contracts/writing.ts`
- Create: `src/shared/contracts/jobs.ts`
- Create: `tests/contracts/core-contracts.test.ts`

**Step 1: Write the failing test**

Create `tests/contracts/core-contracts.test.ts` to assert that the contract layer exports browser-safe request/response shapes for:
- space creation and membership queries
- paper asset import and library entry reads
- note visibility and conversation reads
- writing doc snapshot payloads
- job status and event payloads

```ts
import { describe, expect, it } from 'vitest';
import * as spaces from '../../src/shared/contracts/spaces';
import * as library from '../../src/shared/contracts/library';

describe('core contracts', () => {
  it('exports space and library payloads', () => {
    expect(spaces).toBeTruthy();
    expect(library).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/contracts/core-contracts.test.ts`

Expected: FAIL because the contract files do not exist yet.

**Step 3: Write minimal implementation**

Create transport-neutral types only. Do not import Node runtime objects, database clients, or browser globals into the contract layer.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/contracts/core-contracts.test.ts`

Expected: PASS with the contract surface frozen.

**Step 5: Commit**

```bash
git add src/shared/contracts/spaces.ts src/shared/contracts/library.ts src/shared/contracts/reading.ts src/shared/contracts/writing.ts src/shared/contracts/jobs.ts tests/contracts/core-contracts.test.ts
git commit -m "feat: add jixia core shared contracts"
```

### Task 3: Model spaces, memberships, assets, entries, and governance in Prisma

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/db/client.ts`
- Create: `src/db/index.ts`
- Create: `src/db/repositories/space.repository.ts`
- Create: `src/db/repositories/library.repository.ts`
- Create: `src/db/repositories/job.repository.ts`
- Create: `tests/integration/prisma-schema.test.ts`

**Step 1: Write the failing test**

Create `tests/integration/prisma-schema.test.ts` to verify the schema contains tables or models for:
- `User`, `Space`, `Membership`
- `PaperAsset`, `LibraryEntry`
- `Note`, `ReadingState`, `Conversation`
- `WritingDoc`, `DocVersion`, `CitationLink`
- `ProviderCredential`, `Job`, `JobEvent`, `AuditLog`

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('prisma schema', () => {
  it('declares core bounded-context models', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    expect(schema).toContain('model Space');
    expect(schema).toContain('model PaperAsset');
    expect(schema).toContain('model Job');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/prisma-schema.test.ts`

Expected: FAIL because the schema is missing.

**Step 3: Write minimal implementation**

Define the models with object-level visibility fields and repository stubs that return typed interfaces. Keep storage paths as relative keys rather than absolute server paths.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/prisma-schema.test.ts`

Expected: PASS with the schema and repositories present.

**Step 5: Commit**

```bash
git add prisma/schema.prisma src/db/client.ts src/db/index.ts src/db/repositories/space.repository.ts src/db/repositories/library.repository.ts src/db/repositories/job.repository.ts tests/integration/prisma-schema.test.ts
git commit -m "feat: add jixia core prisma schema"
```

### Task 4: Add storage root and asset key utilities

**Files:**
- Create: `src/server/storage/storage-root.ts`
- Create: `src/server/storage/asset-key.ts`
- Create: `src/server/storage/file-store.ts`
- Create: `tests/integration/storage-root.test.ts`

**Step 1: Write the failing test**

Create `tests/integration/storage-root.test.ts` to verify that:
- the storage root resolves under a configured environment path
- paper PDFs and extracted text paths are returned as relative keys
- callers cannot persist absolute host paths into business records

```ts
import { describe, expect, it } from 'vitest';
import { toAssetStorageKey } from '../../src/server/storage/asset-key';

describe('asset storage keys', () => {
  it('returns relative storage keys', () => {
    expect(toAssetStorageKey('papers/demo.pdf')).toBe('papers/demo.pdf');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/storage-root.test.ts`

Expected: FAIL because the storage utilities do not exist.

**Step 3: Write minimal implementation**

Create utilities that normalize storage keys, resolve absolute paths only inside the server boundary, and expose a file-store abstraction to library and import services.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/storage-root.test.ts`

Expected: PASS with relative-key storage behavior enforced.

**Step 5: Commit**

```bash
git add src/server/storage/storage-root.ts src/server/storage/asset-key.ts src/server/storage/file-store.ts tests/integration/storage-root.test.ts
git commit -m "feat: add jixia server storage utilities"
```

### Task 5: Build the spaces and access API surface

**Files:**
- Create: `src/server/app.ts`
- Create: `src/server/routes/health.routes.ts`
- Create: `src/server/routes/spaces.routes.ts`
- Create: `src/server/policies/access-policy.ts`
- Create: `src/server/services/spaces.service.ts`
- Create: `tests/integration/spaces-api.test.ts`

**Step 1: Write the failing test**

Create `tests/integration/spaces-api.test.ts` to verify that the server:
- boots successfully
- exposes a health endpoint
- creates `personal` and `shared` spaces
- rejects cross-space reads when the visibility policy does not allow them

```ts
import { describe, expect, it } from 'vitest';

describe('spaces api', () => {
  it('starts with health and spaces routes', async () => {
    expect(true).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/spaces-api.test.ts`

Expected: FAIL because the app and spaces routes are missing.

**Step 3: Write minimal implementation**

Implement a minimal server app, a health route, spaces CRUD reads, and a policy layer that accepts `private`, `space_shared`, and `published_to_project` visibility checks.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/spaces-api.test.ts`

Expected: PASS with the spaces/access surface bootable.

**Step 5: Commit**

```bash
git add src/server/app.ts src/server/routes/health.routes.ts src/server/routes/spaces.routes.ts src/server/policies/access-policy.ts src/server/services/spaces.service.ts tests/integration/spaces-api.test.ts
git commit -m "feat: add spaces and access api"
```

### Task 6: Implement paper asset import and library entry flows

**Files:**
- Create: `src/server/routes/import.routes.ts`
- Create: `src/server/routes/library.routes.ts`
- Create: `src/server/services/import.service.ts`
- Create: `src/server/services/library.service.ts`
- Create: `src/server/connectors/pubmed.connector.ts`
- Create: `src/server/connectors/arxiv.connector.ts`
- Create: `tests/integration/library-import.test.ts`

**Step 1: Write the failing test**

Create `tests/integration/library-import.test.ts` to verify that the app can:
- upload a PDF into server storage
- import by DOI or arXiv ID
- create one `PaperAsset` and one `LibraryEntry` in the selected space
- keep the asset reusable while the entry remains scope-specific

```ts
import { describe, expect, it } from 'vitest';

describe('library import', () => {
  it('creates asset and entry separately', async () => {
    expect(true).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/library-import.test.ts`

Expected: FAIL because the import and library routes are missing.

**Step 3: Write minimal implementation**

Add import routes and connector abstractions. Persist uploaded files to server storage, normalize metadata into `PaperAsset`, and create `LibraryEntry` records scoped to the selected `Space`.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/library-import.test.ts`

Expected: PASS with asset/entry separation enforced.

**Step 5: Commit**

```bash
git add src/server/routes/import.routes.ts src/server/routes/library.routes.ts src/server/services/import.service.ts src/server/services/library.service.ts src/server/connectors/pubmed.connector.ts src/server/connectors/arxiv.connector.ts tests/integration/library-import.test.ts
git commit -m "feat: add asset import and library entry flows"
```

### Task 7: Add reading notes, conversations, and evidence-linked outputs

**Files:**
- Create: `src/server/routes/reading.routes.ts`
- Create: `src/server/services/reading.service.ts`
- Create: `src/server/services/evidence-link.service.ts`
- Create: `src/shared/contracts/evidence.ts`
- Create: `tests/integration/reading-evidence.test.ts`

**Step 1: Write the failing test**

Create `tests/integration/reading-evidence.test.ts` to verify that:
- reading detail loads by `LibraryEntry`
- note creation respects object visibility
- AI summary payloads persist evidence spans tied to the imported paper asset

```ts
import { describe, expect, it } from 'vitest';

describe('reading evidence', () => {
  it('stores evidence links with generated insights', async () => {
    expect(true).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/reading-evidence.test.ts`

Expected: FAIL because the reading routes and evidence service do not exist.

**Step 3: Write minimal implementation**

Implement reading routes that operate on `LibraryEntry` context, not global paper state. Persist notes, reading state, and conversation outputs with `evidence_link` metadata.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/reading-evidence.test.ts`

Expected: PASS with evidence-linked reading outputs.

**Step 5: Commit**

```bash
git add src/server/routes/reading.routes.ts src/server/services/reading.service.ts src/server/services/evidence-link.service.ts src/shared/contracts/evidence.ts tests/integration/reading-evidence.test.ts
git commit -m "feat: add reading and evidence link workflows"
```

### Task 8: Implement versioned writing documents and citation links

**Files:**
- Create: `src/server/routes/writing.routes.ts`
- Create: `src/server/services/writing.service.ts`
- Create: `src/server/services/versioning.service.ts`
- Create: `tests/integration/writing-versioning.test.ts`

**Step 1: Write the failing test**

Create `tests/integration/writing-versioning.test.ts` to verify that the app can:
- create a `WritingDoc` in a shared space or project
- append a `DocVersion` snapshot on save
- attach `CitationLink` records to a saved version
- keep comments and publish-state transitions separate from the raw asset data

```ts
import { describe, expect, it } from 'vitest';

describe('writing versioning', () => {
  it('creates document snapshots with citation links', async () => {
    expect(true).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/writing-versioning.test.ts`

Expected: FAIL because the writing routes and versioning service are missing.

**Step 3: Write minimal implementation**

Implement a version-first writing model: save produces a new `DocVersion`, citations point back to `PaperAsset`, and the writing domain owns comments and publish-state transitions.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/writing-versioning.test.ts`

Expected: PASS with versioned writing behavior working.

**Step 5: Commit**

```bash
git add src/server/routes/writing.routes.ts src/server/services/writing.service.ts src/server/services/versioning.service.ts tests/integration/writing-versioning.test.ts
git commit -m "feat: add versioned writing workflows"
```

### Task 9: Add credential vault, persistent jobs, job events, and audit logging

**Files:**
- Create: `src/server/routes/jobs.routes.ts`
- Create: `src/server/routes/job-stream.routes.ts`
- Create: `src/server/routes/credentials.routes.ts`
- Create: `src/server/jobs/job-runner.ts`
- Create: `src/server/jobs/job-bus.ts`
- Create: `src/server/services/credentials.service.ts`
- Create: `src/server/services/audit.service.ts`
- Create: `tests/integration/job-governance.test.ts`

**Step 1: Write the failing test**

Create `tests/integration/job-governance.test.ts` to verify that:
- AI work is created as a persisted job
- job events can be streamed over SSE
- credentials are referenced by `credential_ref` instead of raw key value
- job creation and completion both produce audit records

```ts
import { describe, expect, it } from 'vitest';

describe('job governance', () => {
  it('persists jobs and audits credential-backed runs', async () => {
    expect(true).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/job-governance.test.ts`

Expected: FAIL because the jobs, credentials, and audit services do not exist.

**Step 3: Write minimal implementation**

Create a persisted job model and SSE event stream. Build a credential vault service that stores encrypted values, exposes references, and writes audit entries on use.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/job-governance.test.ts`

Expected: PASS with governed job execution.

**Step 5: Commit**

```bash
git add src/server/routes/jobs.routes.ts src/server/routes/job-stream.routes.ts src/server/routes/credentials.routes.ts src/server/jobs/job-runner.ts src/server/jobs/job-bus.ts src/server/services/credentials.service.ts src/server/services/audit.service.ts tests/integration/job-governance.test.ts
git commit -m "feat: add governed jobs and credential vault"
```

### Task 10: Ship the first web UI for spaces, library, reader, and writing

**Files:**
- Create: `src/web/app.tsx`
- Create: `src/web/router.tsx`
- Create: `src/web/pages/spaces-page.tsx`
- Create: `src/web/pages/library-page.tsx`
- Create: `src/web/pages/reader-page.tsx`
- Create: `src/web/pages/writing-page.tsx`
- Create: `src/web/lib/http-client.ts`
- Create: `tests/ui/mvp-workflow.test.tsx`

**Step 1: Write the failing test**

Create `tests/ui/mvp-workflow.test.tsx` to render the app and verify that a user can:
- enter a space
- open the library page
- navigate to a reader page
- open the writing page from a shared project context

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('mvp workflow shell', () => {
  it('renders the core navigation', () => {
    render(<div>TODO</div>);
    expect(screen.getByText('TODO')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/ui/mvp-workflow.test.tsx`

Expected: FAIL because the web app and pages are missing.

**Step 3: Write minimal implementation**

Add a browser-only client and the first page shells for spaces, library, reader, and writing. Keep UI text concise and aligned with the confirmed `Space -> Project -> Entry -> Doc` mental model.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/ui/mvp-workflow.test.tsx`

Expected: PASS with the first end-to-end web shell navigable.

**Step 5: Commit**

```bash
git add src/web/app.tsx src/web/router.tsx src/web/pages/spaces-page.tsx src/web/pages/library-page.tsx src/web/pages/reader-page.tsx src/web/pages/writing-page.tsx src/web/lib/http-client.ts tests/ui/mvp-workflow.test.tsx
git commit -m "feat: add jixia mvp web workflow shell"
```

### Task 11: Add Docker-first deployment scaffolding and operator docs

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `README.md`
- Create: `README_CN.md`
- Create: `tests/smoke/deploy-docs.test.ts`

**Step 1: Write the failing test**

Create `tests/smoke/deploy-docs.test.ts` to verify that:
- a Docker deployment file exists
- environment variable examples exist
- both English and Chinese README files explain storage root, database path, and server startup

```ts
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('deploy docs', () => {
  it('includes docker and readme scaffolding', () => {
    expect(existsSync('Dockerfile')).toBe(true);
    expect(existsSync('README.md')).toBe(true);
    expect(existsSync('README_CN.md')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke/deploy-docs.test.ts`

Expected: FAIL because deployment scaffolding and docs are missing.

**Step 3: Write minimal implementation**

Add a Docker-first deployment path and bilingual operator documentation for the lab server environment. Document persistent storage, the SQLite path, and how to set server-managed storage roots.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke/deploy-docs.test.ts`

Expected: PASS with deployment scaffolding and docs in place.

**Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example README.md README_CN.md tests/smoke/deploy-docs.test.ts
git commit -m "docs: add jixia deployment scaffolding"
```

### Task 12: Run final verification and document migration checkpoints

**Files:**
- Create: `docs/plans/2026-03-20-jixia-migration-checkpoints.md`
- Modify: `docs/plans/2026-03-20-jixia-platform-design.md`
- Modify: `README.md`
- Modify: `README_CN.md`

**Step 1: Write the failing test**

Create a checklist in `docs/plans/2026-03-20-jixia-migration-checkpoints.md` that documents what must be true before migrating a ResearchClaw capability into Jixia:
- no Electron dependency leaks into the shared contract boundary
- storage uses relative keys
- object visibility is enforced
- jobs and audits exist for long-running AI actions

**Step 2: Run verification commands**

Run:
- `npm run test`
- `npm run lint`
- `npm run build`

Expected: PASS with the repository bootable, typed, and test-covered.

**Step 3: Write minimal implementation**

Fill the migration checkpoint document with exact acceptance criteria and update the design/readme docs if the verification surfaced inconsistencies.

**Step 4: Run verification again**

Run:
- `npm run test`
- `npm run lint`
- `npm run build`

Expected: PASS after the final documentation pass.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-20-jixia-migration-checkpoints.md docs/plans/2026-03-20-jixia-platform-design.md README.md README_CN.md
git commit -m "docs: add jixia migration checkpoints"
```

Plan complete and saved to `docs/plans/2026-03-20-jixia-platform-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
