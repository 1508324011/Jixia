# Jixia MVP Implementation Plan

> **For implementation agents:** Follow this plan task-by-task. Use read-only subagents only for context gathering or review, and keep implementation changes in the main working session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable Jixia MVP as a web-only lab research workbench with strict project permissions, unified document editing, attachments, private AI conversations, and auditable governance actions.

**Architecture:** Use a TypeScript monorepo with a Vite React web app, Fastify API server, shared Prisma/PostgreSQL data layer, S3/MinIO object storage, and an independent worker process. The API owns all permissions and business rules; the frontend only renders server-authorized data.

**Tech Stack:** Vite React, Fastify, TypeScript, Prisma, PostgreSQL, S3/MinIO, Tiptap/ProseMirror, Vitest, Playwright, Docker Compose.

---

## Scope baseline

Read these two files before implementation:

- `doc/Design.md`
- `doc/MVP_rule.md`

Implementation follows `doc/MVP_rule.md` when it differs from target-state design.

Current workspace is expected to be a git repository. Task 0 keeps a guarded initialization step for fresh clones that still lack `.git`. Every git command in this plan must keep the `GIT_MASTER=1` prefix.

## Git and commit protocol

Use semantic English commit messages. Keep each implementation checkpoint scoped to its listed files.

Every commit checkpoint follows this sequence:

```bash
GIT_MASTER=1 git status --short
GIT_MASTER=1 git add <checkpoint-files>
GIT_MASTER=1 git diff --staged --stat
GIT_MASTER=1 git commit -m "<semantic message>" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
GIT_MASTER=1 git log -1 --oneline
```

Rules:

- Stage only files listed in the checkpoint.
- Keep implementation files and their direct tests in the same commit.
- Split any task that touches unrelated modules into the checkpoint groups below.
- Do not commit generated `node_modules`, build outputs, coverage, Playwright reports, local databases, or `.env` secrets.

Commit checkpoints:

```text
Task 0: chore: initialize repository hygiene
  .gitignore
  doc/Design.md
  doc/MVP_rule.md
  doc/MVP_implement.md

Task 1a: chore: add workspace manifests
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json

Task 1b: chore: add local service dependencies
  docker-compose.yml
  .env.example

Task 1c: chore: add app package manifests
  apps/api/package.json
  apps/web/package.json
  apps/worker/package.json

Task 1d: chore: add shared package manifests
  packages/db/package.json
  packages/shared/package.json

Task 2: feat: add shared domain types
  packages/shared/src/index.ts
  packages/shared/src/auth.ts
  packages/shared/src/documents.ts
  packages/shared/src/attachments.ts
  packages/shared/src/ai.ts

Task 3: feat: add Prisma data model
  packages/db/prisma/schema.prisma
  packages/db/src/client.ts
  packages/db/src/index.ts
  packages/db/vitest.config.ts
  packages/db/src/schema-rules.test.ts

Task 4: feat: add API health foundation
  apps/api/src/config/env.ts
  apps/api/src/app.ts
  apps/api/src/server.ts
  apps/api/src/plugins/cookie.ts
  apps/api/src/app.test.ts

Task 5: feat: add auth sessions and invitations
  apps/api/src/modules/auth/auth.service.ts
  apps/api/src/modules/auth/auth.routes.ts
  apps/api/src/modules/auth/session.service.ts
  apps/api/src/modules/auth/password.ts
  apps/api/src/modules/auth/invitation.service.ts
  apps/api/src/modules/auth/session.service.test.ts
  apps/api/src/modules/auth/invitation.service.test.ts

Task 6: feat: add permission service
  apps/api/src/modules/permissions/permission.service.ts
  apps/api/src/modules/permissions/permission.errors.ts
  apps/api/src/modules/permissions/permission.service.test.ts

Task 7: feat: add project management API
  apps/api/src/modules/projects/project.service.ts
  apps/api/src/modules/projects/project.routes.ts
  apps/api/src/modules/projects/project.service.test.ts

Task 8: feat: add document revision service
  apps/api/src/modules/documents/document.service.ts
  apps/api/src/modules/documents/document.routes.ts
  apps/api/src/modules/documents/editor-schema.ts
  apps/api/src/modules/documents/document.service.test.ts

Task 9a: feat: add attachment upload API
  apps/api/src/modules/attachments/attachment.service.ts
  apps/api/src/modules/attachments/attachment.routes.ts
  apps/api/src/modules/attachments/object-storage.ts
  apps/api/src/modules/attachments/attachment.service.test.ts

Task 9b: feat: clean expired upload intents
  apps/worker/src/jobs/cleanup-upload-intents.ts
  apps/worker/src/jobs/cleanup-upload-intents.test.ts

Task 10a: feat: add private AI services
  apps/api/src/modules/ai/ai-config.service.ts
  apps/api/src/modules/ai/ai-conversation.service.ts
  apps/api/src/modules/ai/ai-usage.service.ts
  apps/api/src/modules/ai/crypto.ts
  apps/api/src/modules/ai/ai.routes.ts
  apps/api/src/modules/ai/ai-config.service.test.ts
  apps/api/src/modules/ai/ai-conversation.service.test.ts

Task 10b: feat: clean retained AI usage
  apps/worker/src/jobs/cleanup-ai-usage.ts

Task 11: feat: add audit redaction service
  apps/api/src/modules/audit/audit.service.ts
  apps/api/src/modules/audit/audit.routes.ts
  apps/api/src/modules/audit/audit.service.test.ts

Task 12: feat: add web auth shell
  apps/web/src/main.tsx
  apps/web/src/app/App.tsx
  apps/web/src/lib/api.ts
  apps/web/src/features/auth/LoginPage.tsx
  apps/web/src/features/auth/AcceptInvitationPage.tsx
  apps/web/src/features/layout/AppShell.tsx
  apps/web/src/features/auth/LoginPage.test.tsx

Task 13: feat: add document editor UI
  apps/web/src/features/projects/ProjectListPage.tsx
  apps/web/src/features/projects/ProjectDetailPage.tsx
  apps/web/src/features/documents/DocumentList.tsx
  apps/web/src/features/documents/DocumentEditorPage.tsx
  apps/web/src/features/documents/editor/JixiaEditor.tsx
  apps/web/src/features/documents/DocumentEditorPage.test.tsx

Task 14: feat: add attachment UI flow
  apps/web/src/features/attachments/uploadAttachment.ts
  apps/web/src/features/attachments/AttachmentBlock.tsx
  apps/web/src/features/attachments/uploadAttachment.test.ts

Task 15: feat: add AI settings UI
  apps/web/src/features/ai/AISettingsPage.tsx
  apps/web/src/features/ai/AIConversationPanel.tsx
  apps/web/src/features/ai/AIUsagePage.tsx
  apps/web/src/features/ai/AISettingsPage.test.tsx

Task 16: feat: add worker job scheduler
  apps/worker/src/index.ts
  apps/worker/src/jobs/cleanup-upload-intents.ts
  apps/worker/src/jobs/cleanup-ai-usage.ts
  apps/worker/src/jobs/cleanup-upload-intent-metadata.ts
  apps/worker/src/jobs/cleanup-upload-intents.test.ts

Task 17: test: add MVP browser smoke tests
  apps/web/e2e/auth-and-project.spec.ts
  apps/web/e2e/document-save.spec.ts
  apps/web/e2e/attachment-upload.spec.ts
  playwright.config.ts
```

## Build order

```text
[Jixia MVP] ──┬── Foundation ──┬── Monorepo
              │                └── Docker services
              ├── Backend ─────┬── Prisma schema
              │                ├── Auth/session
              │                ├── Permission service
              │                ├── Documents
              │                ├── Attachments
              │                └── AI services
              ├── Frontend ────┬── App shell
              │                ├── Auth pages
              │                ├── Project pages
              │                ├── Document editor
              │                └── AI workspace
              └── Verification ─┬── Unit tests
                               ├── API tests
                               └── Browser smoke tests
```

## File structure

Create this structure:

```text
apps/
  api/
    src/
      app.ts
      server.ts
      config/env.ts
      plugins/
      modules/
      test-utils/
  web/
    src/
      main.tsx
      app/
      routes/
      components/
      features/
      lib/
  worker/
    src/
      index.ts
      jobs/
packages/
  db/
    prisma/schema.prisma
    src/client.ts
  shared/
    src/
      auth.ts
      documents.ts
      attachments.ts
      ai.ts
```

Keep route handlers thin. Put business rules in service files under `apps/api/src/modules/**`.

---

## Task 0: Confirm git repository hygiene

**Files:**

- Create: `.gitignore`
- Commit: `doc/Design.md`
- Commit: `doc/MVP_rule.md`
- Commit: `doc/MVP_implement.md`

- [ ] **Step 1: Confirm repository exists**

Run from repository root:

```bash
if [ ! -d .git ]; then GIT_MASTER=1 git init -b main; fi
GIT_MASTER=1 git status --short
```

Expected: repository exists; if this step initializes a fresh clone, the default branch is `main`. Current docs are visible as untracked files only on first initialization.

- [ ] **Step 2: Add repository ignore rules**

`.gitignore`:

```gitignore
node_modules/
.pnpm-store/
dist/
build/
coverage/
playwright-report/
test-results/
.turbo/
.vite/
*.tsbuildinfo

.env
.env.*
!.env.example

*.log
*.sqlite
*.sqlite3
tmp/
storage/
uploads/
```

- [ ] **Step 3: Commit planning baseline**

Run:

```bash
GIT_MASTER=1 git status --short
GIT_MASTER=1 git add .gitignore doc/Design.md doc/MVP_rule.md doc/MVP_implement.md
GIT_MASTER=1 git diff --staged --stat
GIT_MASTER=1 git commit -m "chore: initialize repository hygiene" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
GIT_MASTER=1 git log -1 --oneline
```

Expected: first commit contains only ignore rules and planning documents.

---

## Task 1: Scaffold the monorepo foundation

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `apps/api/package.json`
- Create: `apps/web/package.json`
- Create: `apps/worker/package.json`
- Create: `packages/db/package.json`
- Create: `packages/shared/package.json`

- [ ] **Step 1: Create workspace manifests**

`package.json`:

```json
{
  "name": "jixia",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "pnpm --parallel --filter @jixia/api --filter @jixia/web --filter @jixia/worker dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "db:generate": "pnpm --filter @jixia/db prisma generate",
    "db:migrate": "pnpm --filter @jixia/db prisma migrate dev",
    "db:deploy": "pnpm --filter @jixia/db prisma migrate deploy"
  },
  "devDependencies": {
    "@types/node": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@jixia/shared": ["packages/shared/src/index.ts"],
      "@jixia/db": ["packages/db/src/client.ts"]
    }
  }
}
```

Create package manifests so every workspace package has scripts before later tasks run.

`apps/api/package.json`:

```json
{
  "name": "@jixia/api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc --noEmit --project ../../tsconfig.base.json",
    "test": "vitest run --passWithNoTests",
    "lint": "tsc --noEmit --project ../../tsconfig.base.json"
  },
  "dependencies": {
    "@fastify/cookie": "latest",
    "@jixia/db": "workspace:*",
    "@jixia/shared": "workspace:*",
    "fastify": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "tsx": "latest"
  }
}
```

`apps/web/package.json`:

```json
{
  "name": "@jixia/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "test": "vitest run --passWithNoTests",
    "lint": "tsc --noEmit --project ../../tsconfig.base.json",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@jixia/shared": "workspace:*",
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "@testing-library/react": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "jsdom": "latest"
  }
}
```

`apps/worker/package.json`:

```json
{
  "name": "@jixia/worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --noEmit --project ../../tsconfig.base.json",
    "test": "vitest run --passWithNoTests",
    "lint": "tsc --noEmit --project ../../tsconfig.base.json"
  },
  "dependencies": {
    "@jixia/db": "workspace:*"
  },
  "devDependencies": {
    "tsx": "latest"
  }
}
```

`packages/db/package.json`:

```json
{
  "name": "@jixia/db",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc --noEmit --project ../../tsconfig.base.json",
    "test": "vitest run --passWithNoTests",
    "lint": "tsc --noEmit --project ../../tsconfig.base.json",
    "prisma": "prisma"
  },
  "dependencies": {
    "@prisma/client": "latest"
  },
  "devDependencies": {
    "prisma": "latest"
  }
}
```

`packages/shared/package.json`:

```json
{
  "name": "@jixia/shared",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc --noEmit --project ../../tsconfig.base.json",
    "test": "vitest run --passWithNoTests",
    "lint": "tsc --noEmit --project ../../tsconfig.base.json"
  }
}
```

- [ ] **Step 2: Create local service dependencies**

`docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: jixia
      POSTGRES_PASSWORD: jixia_dev_password
      POSTGRES_DB: jixia
    ports:
      - "5432:5432"
    volumes:
      - jixia-postgres:/var/lib/postgresql/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: jixia_minio
      MINIO_ROOT_PASSWORD: jixia_minio_password
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - jixia-minio:/data

volumes:
  jixia-postgres:
  jixia-minio:
```

`.env.example`:

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://jixia:jixia_dev_password@localhost:5432/jixia
SESSION_COOKIE_NAME=jixia_session
SESSION_SECRET=replace-with-32-byte-random-secret
MASTER_KEY=replace-with-32-byte-random-master-key
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=jixia-dev
S3_ACCESS_KEY_ID=jixia_minio
S3_SECRET_ACCESS_KEY=jixia_minio_password
```

For local attachment review without public cloud credentials, the API falls back to an isolated local object-storage driver when `NODE_ENV` is not `production` and no `S3_*` settings are present. Partial `S3_*` settings fail loudly as incomplete configuration instead of silently falling back. Set `ATTACHMENT_STORAGE_DRIVER=local` to force local mode, optionally override `LOCAL_OBJECT_STORAGE_ROOT=storage/attachments`, `LOCAL_OBJECT_STORAGE_PUBLIC_BASE_URL=http://127.0.0.1:3000/local-object-storage`, and `LOCAL_OBJECT_STORAGE_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173`. Production still requires the complete S3-compatible settings and rejects the local driver.

- [ ] **Step 3: Verify scaffold commands**

Run:

```bash
pnpm install
pnpm build
```

Expected: dependency installation succeeds; `pnpm build` may fail until app package entry files exist. Proceed to Task 2 before treating build failure as a defect.

---

## Task 2: Define shared domain types

**Files:**

- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/auth.ts`
- Create: `packages/shared/src/documents.ts`
- Create: `packages/shared/src/attachments.ts`
- Create: `packages/shared/src/ai.ts`

- [ ] **Step 1: Add auth shared types**

`packages/shared/src/auth.ts`:

```ts
export const spaceRoles = ["SpaceAdmin", "SpaceMember"] as const;
export type SpaceRole = (typeof spaceRoles)[number];

export const projectRoles = ["ProjectOwner", "ProjectEditor", "ProjectViewer"] as const;
export type ProjectRole = (typeof projectRoles)[number];

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  spaceRole: SpaceRole;
};
```

- [ ] **Step 2: Add document shared types**

`packages/shared/src/documents.ts`:

```ts
export const documentTypes = ["notebook", "project"] as const;
export type DocumentType = (typeof documentTypes)[number];

export const documentStatuses = ["active", "archived"] as const;
export type DocumentStatus = (typeof documentStatuses)[number];

export const blockTypes = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "todo",
  "quote",
  "callout",
  "codeBlock",
  "divider",
  "table",
  "image",
  "file"
] as const;
export type BlockType = (typeof blockTypes)[number];

export type EditorSnapshot = {
  editorSchemaVersion: number;
  blocks: Array<Record<string, unknown>>;
};
```

- [ ] **Step 3: Add attachment and AI shared types**

`packages/shared/src/attachments.ts`:

```ts
export const uploadIntentStatuses = ["pending", "confirmed", "failed", "expired", "cleaned"] as const;
export type UploadIntentStatus = (typeof uploadIntentStatuses)[number];

export const uploadFailureReasons = [
  "expired",
  "object_missing",
  "size_mismatch",
  "mime_mismatch",
  "storage_error",
  "permission_revoked"
] as const;
export type UploadFailureReason = (typeof uploadFailureReasons)[number];
```

`packages/shared/src/ai.ts`:

```ts
export type AIProviderConfigView = {
  id: string;
  name: string;
  provider: string;
  baseURL: string;
  model: string;
  temperature: number;
  maxTokens: number;
  hasKey: boolean;
  keyPreview: string | null;
  isDefault: boolean;
};
```

`packages/shared/src/index.ts`:

```ts
export * from "./auth";
export * from "./documents";
export * from "./attachments";
export * from "./ai";
```

- [ ] **Step 4: Verify shared package**

Run:

```bash
pnpm --filter @jixia/shared build
pnpm --filter @jixia/shared test
```

Expected: TypeScript build succeeds; tests pass with the package scripts from Task 1.

---

## Task 3: Create Prisma schema and database client

**Files:**

- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/vitest.config.ts`
- Test: `packages/db/src/schema-rules.test.ts`

- [ ] **Step 1: Write schema for core objects**

`packages/db/prisma/schema.prisma` must include these models:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum SpaceRole {
  SpaceAdmin
  SpaceMember
}

enum ProjectRole {
  ProjectOwner
  ProjectEditor
  ProjectViewer
}

enum DocumentType {
  notebook
  project
}

enum DocumentStatus {
  active
  archived
}

enum UploadIntentStatus {
  pending
  confirmed
  failed
  expired
  cleaned
}

enum UploadFailureReason {
  expired
  object_missing
  size_mismatch
  mime_mismatch
  storage_error
  permission_revoked
}

model User {
  id                  String             @id @default(cuid())
  email               String             @unique
  displayName         String
  passwordHash        String
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt
  spaceMembers        SpaceMember[]
  projectMembers      ProjectMember[]
  sessions            Session[]
  documents           Document[]         @relation("DocumentOwner")
  documentDrafts      DocumentDraft[]
  documentRevisions   DocumentRevision[]
  uploadIntents       UploadIntent[]
  aiProviderConfigs   AIProviderConfig[]
  aiConversations     AIConversation[]
  aiUsageAggregates   AIUsageAggregate[]
  auditEvents         AuditEvent[]       @relation("ActorAuditEvents")
  invitationsCreated  Invitation[]       @relation("InvitationCreator")
  invitationsAccepted Invitation[]       @relation("InvitationAcceptedBy")
}

model Space {
  id                String             @id @default(cuid())
  name              String
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
  members           SpaceMember[]
  projects          Project[]
  invitations       Invitation[]
  aiUsageAggregates AIUsageAggregate[]
}

model SpaceMember {
  id        String    @id @default(cuid())
  spaceId   String
  userId    String
  role      SpaceRole
  createdAt DateTime  @default(now())
  space     Space     @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([spaceId, userId])
}

model Project {
  id        String          @id @default(cuid())
  spaceId   String
  name      String
  createdBy String
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt
  space     Space           @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  members   ProjectMember[]
  documents Document[]
}

model ProjectMember {
  id        String      @id @default(cuid())
  projectId String
  userId    String
  role      ProjectRole
  createdAt DateTime    @default(now())
  project   Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
}

model Session {
  id        String    @id @default(cuid())
  userId    String
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt, expiresAt])
}

model Invitation {
  id               String    @id @default(cuid())
  spaceId          String
  email            String
  tokenHash        String    @unique
  createdByUserId  String
  acceptedByUserId String?
  expiresAt        DateTime
  acceptedAt       DateTime?
  createdAt        DateTime  @default(now())
  space            Space     @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  createdBy        User      @relation("InvitationCreator", fields: [createdByUserId], references: [id], onDelete: Restrict)
  acceptedBy       User?     @relation("InvitationAcceptedBy", fields: [acceptedByUserId], references: [id], onDelete: SetNull)

  @@index([spaceId, email])
}

model Document {
  id                String               @id @default(cuid())
  type              DocumentType
  status            DocumentStatus       @default(active)
  title             String
  ownerUserId       String?
  projectId         String?
  currentRevisionId String?              @unique
  revisionNumber    Int                  @default(0)
  createdAt         DateTime             @default(now())
  updatedAt         DateTime             @updatedAt
  owner             User?                @relation("DocumentOwner", fields: [ownerUserId], references: [id], onDelete: Cascade)
  project           Project?             @relation(fields: [projectId], references: [id], onDelete: Cascade)
  currentRevision   DocumentRevision?    @relation("CurrentDocumentRevision", fields: [currentRevisionId], references: [id], onDelete: SetNull)
  drafts            DocumentDraft[]
  revisions         DocumentRevision[]   @relation("DocumentRevisions")
  attachments       DocumentAttachment[]

  @@index([ownerUserId])
  @@index([projectId])
}

model DocumentDraft {
  id         String   @id @default(cuid())
  documentId String
  userId     String
  content    Json
  updatedAt  DateTime @updatedAt
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([documentId, userId])
}

model DocumentRevision {
  id                 String    @id @default(cuid())
  documentId         String
  authorUserId       String
  revisionNumber     Int
  content            Json
  createdAt          DateTime  @default(now())
  document           Document  @relation("DocumentRevisions", fields: [documentId], references: [id], onDelete: Cascade)
  author             User      @relation(fields: [authorUserId], references: [id], onDelete: Restrict)
  currentForDocument Document? @relation("CurrentDocumentRevision")

  @@unique([documentId, revisionNumber])
}

model DocumentAttachment {
  id             String        @id @default(cuid())
  documentId     String
  uploadIntentId String?       @unique
  objectKey      String        @unique
  fileName       String
  mimeType       String
  sizeBytes      Int
  createdAt      DateTime      @default(now())
  document       Document      @relation(fields: [documentId], references: [id], onDelete: Cascade)
  uploadIntent   UploadIntent? @relation(fields: [uploadIntentId], references: [id], onDelete: SetNull)
}

model UploadIntent {
  id            String               @id @default(cuid())
  documentId    String
  actorUserId   String
  objectKey     String               @unique
  fileName      String
  mimeType      String
  sizeBytes     Int
  status        UploadIntentStatus   @default(pending)
  failureReason UploadFailureReason?
  expiresAt     DateTime
  confirmedAt   DateTime?
  cleanedAt     DateTime?
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt
  document      Document             @relation(fields: [documentId], references: [id], onDelete: Cascade)
  actor         User                 @relation(fields: [actorUserId], references: [id], onDelete: Cascade)
  attachment    DocumentAttachment?

  @@index([status, expiresAt])
}

model AIProviderConfig {
  id              String   @id @default(cuid())
  ownerUserId     String
  name            String
  provider        String
  baseURL         String
  model           String
  temperature     Float
  maxTokens       Int
  encryptedApiKey String?
  keyPreview      String?
  isDefault       Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  owner           User     @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)

  @@unique([ownerUserId, name])
}

model AIConversation {
  id          String    @id @default(cuid())
  ownerUserId String
  title       String
  messages    Json
  deletedAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  owner       User      @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)

  @@index([ownerUserId, deletedAt])
}

model AIUsageAggregate {
  id               String   @id @default(cuid())
  ownerUserId      String?
  spaceId          String?
  periodStart      DateTime
  periodEnd        DateTime
  provider         String
  model            String
  promptTokens     Int      @default(0)
  completionTokens Int      @default(0)
  costMicros       Int      @default(0)
  createdAt        DateTime @default(now())
  owner            User?    @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)
  space            Space?   @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  @@index([ownerUserId, periodStart])
  @@index([spaceId, periodStart])
}

model AuditEvent {
  id          String   @id @default(cuid())
  actorUserId String
  action      String
  targetType  String
  targetId    String
  payload     Json
  createdAt   DateTime @default(now())
  actor       User     @relation("ActorAuditEvents", fields: [actorUserId], references: [id], onDelete: Restrict)

  @@index([actorUserId, createdAt])
  @@index([targetType, targetId])
}
```

- [ ] **Step 2: Add database check constraints through SQL migration**

After `prisma migrate dev --name init`, edit the generated SQL migration to add:

```sql
ALTER TABLE "Document"
ADD CONSTRAINT "Document_type_owner_project_check"
CHECK (
  ("type" = 'notebook' AND "ownerUserId" IS NOT NULL AND "projectId" IS NULL)
  OR
  ("type" = 'project' AND "projectId" IS NOT NULL AND "ownerUserId" IS NULL)
);
```

- [ ] **Step 3: Add database client**

`packages/db/src/client.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

`packages/db/src/index.ts`:

```ts
export { prisma } from "./client";
export * from "@prisma/client";
```

- [ ] **Step 4: Write schema invariant tests**

`packages/db/src/schema-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

describe("Document type constraints", () => {
  it("rejects a notebook document without ownerUserId", async () => {
    const prisma = new PrismaClient();
    await expect(
      prisma.document.create({
        data: { type: "notebook", title: "Invalid", status: "active", revisionNumber: 0 }
      })
    ).rejects.toThrow();
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 5: Verify schema**

Run:

```bash
pnpm --filter @jixia/db prisma generate
pnpm --filter @jixia/db prisma migrate dev --name init
pnpm --filter @jixia/db test
```

Expected: Prisma client generates, migration applies, constraint test fails before SQL check is added and passes after the migration contains the check.

---

## Task 4: Build API app foundation

**Files:**

- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/plugins/cookie.ts`
- Test: `apps/api/src/app.test.ts`

- [ ] **Step 1: Add typed environment loader**

Use `zod` in `apps/api/src/config/env.ts`:

```ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().default("jixia_session"),
  SESSION_SECRET: z.string().min(32),
  MASTER_KEY: z.string().min(32),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1)
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 2: Add Fastify app factory**

`apps/api/src/app.ts`:

```ts
import Fastify from "fastify";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  return app;
}
```

`apps/api/src/server.ts`:

```ts
import { buildApp } from "./app";

const app = buildApp();

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
```

- [ ] **Step 3: Verify API foundation**

`apps/api/src/app.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

describe("API health", () => {
  it("returns ok", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
```

Run:

```bash
pnpm --filter @jixia/api test
pnpm --filter @jixia/api build
```

Expected: health test passes and TypeScript build succeeds.

---

## Task 5: Implement auth, invitations, and sessions

**Files:**

- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/auth.routes.ts`
- Create: `apps/api/src/modules/auth/session.service.ts`
- Create: `apps/api/src/modules/auth/password.ts`
- Create: `apps/api/src/modules/auth/invitation.service.ts`
- Test: `apps/api/src/modules/auth/session.service.test.ts`
- Test: `apps/api/src/modules/auth/invitation.service.test.ts`

- [ ] **Step 1: Implement password hashing**

Use `argon2id` through `argon2`.

`apps/api/src/modules/auth/password.ts`:

```ts
import argon2 from "argon2";

export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}
```

- [ ] **Step 2: Implement session rules**

`Session` behavior:

- Cookie stores only `sessionId`
- Session lifetime is 7 days
- Renew only when remaining lifetime is less than 2 days
- Current logout revokes current session
- All-device logout revokes all user sessions

Test case shape:

```ts
it("renews only when less than two days remain", async () => {
  const session = createSessionFixture({ expiresInDays: 1 });
  const renewed = await renewSessionIfNeeded(session.id);
  expect(renewed.expiresAt.getTime()).toBeGreaterThan(session.expiresAt.getTime());
});
```

- [ ] **Step 3: Implement invitations**

Invitation rules:

- Only `SpaceAdmin` creates invitations
- Invitation expires after 7 days
- Store only `tokenHash`
- Acceptance validates token, email, expiry, and unused state
- Acceptance creates `User + SpaceMember`

Test case shape:

```ts
it("rejects expired invitation token", async () => {
  const invitation = await createExpiredInvitationFixture();
  await expect(acceptInvitation({ token: invitation.rawToken, password: "strong-password" })).rejects.toMatchObject({ code: "INVITATION_EXPIRED" });
});
```

- [ ] **Step 4: Add auth routes**

Routes:

```text
POST /auth/login
POST /auth/logout
POST /auth/logout-all
GET  /auth/me
POST /invitations
POST /invitations/accept
```

MVP does not implement password reset routes.

- [ ] **Step 5: Verify auth**

Run:

```bash
pnpm --filter @jixia/api test -- auth
```

Expected: login creates session, session renews only near expiry, logout revokes correctly, invitation acceptance creates user and membership.

---

## Task 6: Implement permission service

**Files:**

- Create: `apps/api/src/modules/permissions/permission.service.ts`
- Create: `apps/api/src/modules/permissions/permission.errors.ts`
- Test: `apps/api/src/modules/permissions/permission.service.test.ts`

- [ ] **Step 1: Add permission functions**

Required functions:

```ts
export async function canReadDocument(userId: string, documentId: string): Promise<boolean>;
export async function canEditDocument(userId: string, documentId: string): Promise<boolean>;
export async function canArchiveDocument(userId: string, documentId: string): Promise<boolean>;
export async function canHardDeleteDocument(userId: string, documentId: string): Promise<boolean>;
export async function canDownloadAttachment(userId: string, attachmentId: string): Promise<boolean>;
```

Rules:

- `notebook`: owner only
- `project`: `ProjectMember` can read
- `ProjectOwner` and `ProjectEditor` can edit project docs
- only `ProjectOwner` archives/restores/deletes project docs
- `SpaceAdmin` cannot read project content unless also a `ProjectMember`

- [ ] **Step 2: Add tests for SpaceAdmin non-bypass**

Test case shape:

```ts
it("does not let SpaceAdmin read a private project document without membership", async () => {
  const { adminUser, projectDocument } = await createProjectWithoutAdminMembershipFixture();
  await expect(canReadDocument(adminUser.id, projectDocument.id)).resolves.toBe(false);
});
```

- [ ] **Step 3: Verify permissions**

Run:

```bash
pnpm --filter @jixia/api test -- permissions
```

Expected: all permission matrix tests pass.

---

## Task 7: Implement Project CRUD and membership

**Files:**

- Create: `apps/api/src/modules/projects/project.service.ts`
- Create: `apps/api/src/modules/projects/project.routes.ts`
- Test: `apps/api/src/modules/projects/project.service.test.ts`

- [ ] **Step 1: Implement project creation**

Rules:

- Any `SpaceMember` can create `Project`
- Creator automatically becomes `ProjectOwner`
- Project defaults private
- `AuditEvent` records project creation

Service signature:

```ts
export async function createProject(input: { spaceId: string; actorUserId: string; name: string }) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({ data: { spaceId: input.spaceId, name: input.name, createdBy: input.actorUserId } });
    await tx.projectMember.create({ data: { projectId: project.id, userId: input.actorUserId, role: "ProjectOwner" } });
    await tx.auditEvent.create({ data: { actorUserId: input.actorUserId, action: "project.created", targetId: project.id, payload: { name: input.name } } });
    return project;
  });
}
```

- [ ] **Step 2: Implement membership changes**

Only `ProjectOwner` can add/remove/change project members.

Routes:

```text
GET    /projects
POST   /projects
GET    /projects/:projectId
GET    /projects/:projectId/members
POST   /projects/:projectId/members
PATCH  /projects/:projectId/members/:userId
DELETE /projects/:projectId/members/:userId
```

- [ ] **Step 3: Verify projects**

Run:

```bash
pnpm --filter @jixia/api test -- projects
```

Expected: regular members can create projects; creator becomes owner; SpaceAdmin has no content bypass.

---

## Task 8: Implement Document service and revisions

**Files:**

- Create: `apps/api/src/modules/documents/document.service.ts`
- Create: `apps/api/src/modules/documents/document.routes.ts`
- Create: `apps/api/src/modules/documents/editor-schema.ts`
- Test: `apps/api/src/modules/documents/document.service.test.ts`

- [ ] **Step 1: Implement document creation**

Rules:

- `notebook` documents require `ownerUserId`
- `project` documents require `projectId`
- Creating project document requires `ProjectOwner` or `ProjectEditor`
- New document starts with `revisionNumber = 0` and an empty editor snapshot

Empty snapshot:

```ts
export const emptyEditorSnapshot = {
  editorSchemaVersion: 1,
  blocks: [{ id: "root-paragraph", type: "paragraph", content: [] }]
} as const;
```

- [ ] **Step 2: Implement draft save**

Draft save updates one `DocumentDraft` per `(documentId, userId)`.

It does not create `DocumentRevision`.

- [ ] **Step 3: Implement formal save**

Formal save checks:

- document is `active`
- actor has edit permission
- `baseRevision` equals current `revisionNumber`

If matched, create `DocumentRevision`, update `Document.currentRevisionId`, increment `revisionNumber`, and clear actor draft.

If stale, return conflict payload with current revision and submitted draft.

- [ ] **Step 4: Implement archive, restore, hard delete**

Rules:

- archived documents cannot save draft or revision
- notebook archive/restore/delete only owner
- project archive/restore/delete only `ProjectOwner`
- hard delete writes metadata-only `AuditEvent`

- [ ] **Step 5: Verify document rules**

Run:

```bash
pnpm --filter @jixia/api test -- documents
```

Expected: draft save does not create revision; formal save creates full snapshot; stale save returns conflict; archived doc rejects save.

---

## Task 9: Implement attachment upload, download, and cleanup

**Files:**

- Create: `apps/api/src/modules/attachments/attachment.service.ts`
- Create: `apps/api/src/modules/attachments/attachment.routes.ts`
- Create: `apps/api/src/modules/attachments/object-storage.ts`
- Create: `apps/worker/src/jobs/cleanup-upload-intents.ts`
- Test: `apps/api/src/modules/attachments/attachment.service.test.ts`
- Test: `apps/worker/src/jobs/cleanup-upload-intents.test.ts`

- [ ] **Step 1: Implement upload intent creation**

Rules:

- actor must be able to edit target document
- image max size 100MB
- file max size 200MB
- object key is server-generated, random, unique, and under temp prefix
- `UploadIntent.expiresAt = createdAt + 1h`

Intent object key shape:

```ts
const objectKey = `tmp/uploads/${crypto.randomUUID()}/${safeFileName}`;
```

- [ ] **Step 2: Implement upload confirmation**

Confirmation succeeds only if:

- intent is pending
- intent is unexpired
- actor owns the intent
- `HEAD objectKey` exists
- object size and mime match intent

On success, transition to `confirmed` and create `DocumentAttachment`.

- [ ] **Step 3: Implement cleanup worker**

Cleanup claims `pending + expired` rows atomically. Then it calls `HEAD`. If object exists, delete it. If missing, mark as cleaned.

Failure reasons use the locked enum.

- [ ] **Step 4: Implement download URL route**

Download route checks `Document` permission and returns a 15-minute signed URL.

Do not create `AuditEvent` for every download.

- [ ] **Step 5: Verify attachment flow**

Run:

```bash
pnpm --filter @jixia/api test -- attachments
pnpm --filter @jixia/worker test -- cleanup-upload-intents
```

Expected: upload intent creates URL; confirm creates attachment after HEAD verification; expired intent cleanup never deletes confirmed attachment.

---

## Task 10: Implement AI provider configs, private conversations, and usage aggregates

**Files:**

- Create: `apps/api/src/modules/ai/ai-config.service.ts`
- Create: `apps/api/src/modules/ai/ai-conversation.service.ts`
- Create: `apps/api/src/modules/ai/ai-usage.service.ts`
- Create: `apps/api/src/modules/ai/crypto.ts`
- Create: `apps/api/src/modules/ai/ai.routes.ts`
- Create: `apps/worker/src/jobs/cleanup-ai-usage.ts`
- Test: `apps/api/src/modules/ai/ai-config.service.test.ts`
- Test: `apps/api/src/modules/ai/ai-conversation.service.test.ts`

- [ ] **Step 1: Implement encrypted API key storage**

Use `MASTER_KEY` from environment. Store `encryptedApiKey`, `keyPreview`, and non-secret config fields.

Never return full API key to frontend.

View response shape:

```ts
{
  id: config.id,
  name: config.name,
  provider: config.provider,
  baseURL: config.baseURL,
  model: config.model,
  temperature: config.temperature,
  maxTokens: config.maxTokens,
  hasKey: Boolean(config.encryptedApiKey),
  keyPreview: config.keyPreview,
  isDefault: config.isDefault
}
```

- [ ] **Step 2: Implement private conversations**

Rules:

- visible only to `ownerUserId`
- cannot be shared
- no document writeback
- old conversation remains readable to owner after project access loss
- new AI calls re-check current document/context permissions
- owner can hard delete conversation without `AuditEvent`

- [ ] **Step 3: Implement AI usage aggregates**

Rules:

- aggregate only, no per-call detail view
- no prompt/response/context body
- user can see own aggregates
- `SpaceAdmin` sees only Space-level aggregate
- retain 30 days

- [ ] **Step 4: Verify AI services**

Run:

```bash
pnpm --filter @jixia/api test -- ai
pnpm --filter @jixia/worker test -- cleanup-ai-usage
```

Expected: full API key is never returned; private conversation is owner-only; usage aggregate contains no prompt or response.

---

## Task 11: Implement audit service

**Files:**

- Create: `apps/api/src/modules/audit/audit.service.ts`
- Create: `apps/api/src/modules/audit/audit.routes.ts`
- Test: `apps/api/src/modules/audit/audit.service.test.ts`

- [ ] **Step 1: Add audit writer**

Service signature:

```ts
export async function writeAuditEvent(input: {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
}) {
  return prisma.auditEvent.create({ data: input });
}
```

- [ ] **Step 2: Enforce redaction**

Reject audit payload containing these keys:

```ts
const forbiddenAuditKeys = [
  "contentSnapshot",
  "draftContent",
  "prompt",
  "response",
  "apiKey",
  "encryptedApiKey",
  "signedUrl",
  "authorization",
  "cookie",
  "token",
  "storageCredentials"
];
```

- [ ] **Step 3: Verify audit redaction**

Run:

```bash
pnpm --filter @jixia/api test -- audit
```

Expected: audit accepts metadata-only payloads and rejects content/secret-bearing payloads.

---

## Task 12: Build web app shell and auth UI

**Files:**

- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app/App.tsx`
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/features/auth/LoginPage.tsx`
- Create: `apps/web/src/features/auth/AcceptInvitationPage.tsx`
- Create: `apps/web/src/features/layout/AppShell.tsx`
- Test: `apps/web/src/features/auth/LoginPage.test.tsx`

- [ ] **Step 1: Add API client**

`apps/web/src/lib/api.ts`:

```ts
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials: "include" });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}
```

- [ ] **Step 2: Add auth pages**

Login submits email/password to `POST /auth/login`. Accept invitation submits token, display name, password to `POST /invitations/accept`.

- [ ] **Step 3: Verify auth UI**

Run:

```bash
pnpm --filter @jixia/web test -- LoginPage
pnpm --filter @jixia/web build
```

Expected: login form posts credentials with cookies enabled; build succeeds.

---

## Task 13: Build project and document UI

**Files:**

- Create: `apps/web/src/features/projects/ProjectListPage.tsx`
- Create: `apps/web/src/features/projects/ProjectDetailPage.tsx`
- Create: `apps/web/src/features/documents/DocumentList.tsx`
- Create: `apps/web/src/features/documents/DocumentEditorPage.tsx`
- Create: `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- Test: `apps/web/src/features/documents/DocumentEditorPage.test.tsx`

- [ ] **Step 1: Add Project pages**

Project list shows projects returned by `GET /projects`. Create project calls `POST /projects` and receives owner membership automatically.

- [ ] **Step 2: Add Tiptap editor wrapper**

Editor supports locked block set:

```text
paragraph, heading, bulletList, orderedList, todo, quote, callout, codeBlock, divider, table, image, file
```

- [ ] **Step 3: Add draft and formal save controls**

Autosave calls draft endpoint. Manual save calls formal save endpoint with `baseRevision`.

Conflict response opens a human merge view. It never calls AI.

- [ ] **Step 4: Verify document UI**

Run:

```bash
pnpm --filter @jixia/web test -- DocumentEditorPage
pnpm --filter @jixia/web build
```

Expected: editor renders blocks; manual save sends `baseRevision`; conflict state is shown when API returns conflict.

---

## Task 14: Build attachment UI

**Files:**

- Create: `apps/web/src/features/attachments/uploadAttachment.ts`
- Create: `apps/web/src/features/attachments/AttachmentBlock.tsx`
- Test: `apps/web/src/features/attachments/uploadAttachment.test.ts`

- [ ] **Step 1: Implement upload helper**

Flow:

```text
POST /attachments/upload-intents
PUT presignedUrl
POST /attachments/upload-intents/:id/confirm
Insert block with returned attachmentId
```

- [ ] **Step 2: Implement download helper**

Clicking file block calls backend download endpoint, receives signed URL, then opens it.

- [ ] **Step 3: Verify attachment UI**

Run:

```bash
pnpm --filter @jixia/web test -- uploadAttachment
```

Expected: helper requests intent, uploads to URL, confirms, and never receives object-storage credentials.

---

## Task 15: Build AI config and private conversation UI

**Files:**

- Create: `apps/web/src/features/ai/AISettingsPage.tsx`
- Create: `apps/web/src/features/ai/AIConversationPanel.tsx`
- Create: `apps/web/src/features/ai/AIUsagePage.tsx`
- Test: `apps/web/src/features/ai/AISettingsPage.test.tsx`

- [ ] **Step 1: Add AI settings UI**

UI shows `hasKey` and `keyPreview`. It never displays full old API key.

- [ ] **Step 2: Add AI conversation panel**

Panel uses current document plus user-selected extra context. It writes only into conversation UI, not into `Document`.

- [ ] **Step 3: Add usage UI**

User sees own aggregate usage. SpaceAdmin sees Space aggregate page without per-user detail.

- [ ] **Step 4: Verify AI UI**

Run:

```bash
pnpm --filter @jixia/web test -- AISettingsPage
pnpm --filter @jixia/web build
```

Expected: settings form never renders full API key; conversation UI has no document writeback action.

---

## Task 16: Add worker jobs

**Files:**

- Create: `apps/worker/src/index.ts`
- Create: `apps/worker/src/jobs/cleanup-upload-intents.ts`
- Create: `apps/worker/src/jobs/cleanup-ai-usage.ts`
- Create: `apps/worker/src/jobs/cleanup-upload-intent-metadata.ts`
- Test: `apps/worker/src/jobs/cleanup-upload-intents.test.ts`

- [ ] **Step 1: Add worker entrypoint**

Worker runs jobs on interval:

```text
cleanupUploadIntents every 5 minutes
cleanupUploadIntentMetadata every 1 day
cleanupAIUsage every 1 day
```

- [ ] **Step 2: Verify worker jobs**

Run:

```bash
pnpm --filter @jixia/worker test
pnpm --filter @jixia/worker build
```

Expected: expired pending upload intent is cleaned; confirmed intent is skipped; old AI usage aggregate is deleted after retention.

---

## Task 17: End-to-end smoke tests

**Files:**

- Create: `apps/web/e2e/auth-and-project.spec.ts`
- Create: `apps/web/e2e/document-save.spec.ts`
- Create: `apps/web/e2e/attachment-upload.spec.ts`
- Create: `playwright.config.ts`

- [ ] **Step 1: Add Playwright setup**

Configure Playwright to run against local web and API services.

- [ ] **Step 2: Add smoke paths**

Test these flows:

```text
accept invitation -> login -> create project
create project document -> draft save -> formal save
upload image block -> reload document -> image block still resolves
logout current device -> auth/me returns unauthenticated
```

- [ ] **Step 3: Verify smoke tests**

Run:

```bash
pnpm test
pnpm build
pnpm --filter @jixia/web e2e
```

Expected: unit tests, builds, and browser smoke tests pass.


---

## Post-MVP manual QA implementation sequence

Manual QA confirmed that Jixia should not add full `Home`, `Search`, `Library`,
or `Notebook` pages on top of the current card-heavy MVP shell. The next
implementation stage must first establish a compact research workbench foundation,
then expand product surfaces in an order that follows available server-owned
contracts.

This sequence extends the MVP after Tasks 12-17. It must not weaken the
server-first rules already implemented for cookie sessions, project permissions,
document drafts, formal revisions, attachment storage, AI keys, AI writeback
boundaries, or audit redaction.

### Post-MVP Stage A: Refactor workbench shell and UI primitives

**Decision:** do this before building new top-level product surfaces.

**Primary files:**

- Update: `apps/web/src/app/App.tsx`
- Update: `apps/web/src/features/layout/AppShell.tsx`
- Create or update: shared web workbench primitives under `apps/web/src/features/layout/` or a focused shared UI directory
- Update tests that encode route labels, headings, and shell navigation

- [ ] **Step 1: Define the target surface matrix**

Represent the post-MVP product spine explicitly:

```text
Home
Search
Library
Projects
Notebook
AI
Setting
```

`Setting` must be bottom-pinned and visually separated from daily work surfaces.
`AI` is a first-class standalone chat workspace. It must open to a clean private
conversation surface without automatic current-document context; future document
grounding belongs behind explicit server-authorized attachment controls.

- [ ] **Step 2: Extract only demanded workbench primitives**

Keep this narrow. Extract primitives already repeated by current pages instead
of creating a speculative design system:

```text
WorkbenchSurface
SurfaceHeader
Toolbar
Pane
Panel
SplitPane
ListRow
MetaGrid
Field
Button
Pill
Notice
EmptyState
StatusStrip
```

Cards may remain for empty states, onboarding, compact summaries, and visual
assets, but object-heavy surfaces must default to rows, tables, panes,
inspectors, and compact toolbars.

- [ ] **Step 3: Apply primitives to existing implemented surfaces**

Refactor existing UI without changing product behavior:

```text
ProjectListPage
ProjectDetailPage
DocumentList
DocumentEditorPage
AISettingsPage
AIUsagePage
AIConversationPanel
AIChatDialog
AttachmentBlock
```

Preserve existing API calls, cookie-based auth, document permissions, attachment
upload/download flows, AI key secrecy, and AI no-writeback behavior.

- [ ] **Step 4: Verify shell primitive refactor**

Run the smallest relevant web checks first, then broader checks before handoff:

```bash
pnpm --filter @jixia/web test
pnpm --filter @jixia/web build
```

Expected: current auth, project, document, attachment, and AI behavior remains
semantically unchanged while the shell/navigation can host the target IA.

### Post-MVP Stage B: Redesign Document Editor as the proof surface

**Decision:** use the document editor to prove the workbench direction before
implementing broad new pages.

**Primary files:**

- Update: `apps/web/src/features/documents/DocumentEditorPage.tsx`
- Update: `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- Update: `apps/web/src/features/ai/AIConversationPanel.tsx`
- Update: `apps/web/src/features/attachments/AttachmentBlock.tsx`
- Update: `apps/web/src/features/documents/DocumentEditorPage.test.tsx`
- Update: `apps/web/e2e/document-save.spec.ts`

- [ ] **Step 1: Make the editor editor-first**

Move away from one heavy card per block. The editor should feel closer to a
continuous Notion-like writing surface with lightweight block controls, compact
insert affordances, and unobtrusive block type changes.

- [ ] **Step 2: Preserve server-first document behavior**

Keep these behaviors intact:

```text
GET /documents/:documentId
PUT /documents/:documentId/draft
POST /documents/:documentId/revisions
409 conflict opens human merge flow
archived documents are read-only
AI cannot write into Document
```

- [ ] **Step 3: Reframe AI as contextual copilot/inspector**

The embedded AI panel should remain document-scoped and suggestion-oriented. It
may become a right workbench pane, but it must not become the authoritative edit
path or silently persist generated content.

- [ ] **Step 4: Verify editor redesign**

Run:

```bash
pnpm --filter @jixia/web test -- DocumentEditorPage
pnpm --filter @jixia/web build
pnpm --filter @jixia/web e2e -- document-save
```

Expected: draft save, formal revision save, conflict display, read-only state,
and AI no-writeback guarantees still pass.

### Post-MVP Stage C: Add Notebook as the first new product surface

**Decision:** Notebook comes before full Home/Search/Library because notebook
contracts already exist in the document model.

**Primary files:**

- Update: `apps/web/src/app/App.tsx`
- Update: `apps/web/src/features/layout/AppShell.tsx`
- Create: notebook web surface under `apps/web/src/features/notebook/`
- Update or add server routes only if a notebook listing/opening contract is missing
- Update shared contracts only if needed for transport-safe notebook list payloads

- [ ] **Step 1: Reuse the shared document editor frame**

Notebook and Project Docs share the same editor grammar, draft mechanism,
revision mechanism, attachment behavior, and document-scoped AI. Ownership and
visibility semantics differ; the editor core should not fork.

- [ ] **Step 2: Confirm server-owned notebook list behavior**

Use existing server contracts where possible:

```text
Document.type = notebook | project
POST /documents/notebook
GET /documents/:documentId
PUT /documents/:documentId/draft
POST /documents/:documentId/revisions
```

If notebook listing is not available, add a minimal server-authorized notebook
listing endpoint before building a rich Notebook landing page.

- [ ] **Step 3: Preserve Notebook-to-Project boundary**

Do not implement automatic promotion from personal Notebook to Project Docs.
Only explicit copy, rewrite, or organization flows are allowed.

- [ ] **Step 4: Verify Notebook surface**

Run focused API/web tests for notebook creation, listing/opening, draft save,
formal save, and permission boundaries before broader web verification.

### Post-MVP Stage D: Add lightweight Home only after Notebook stabilizes

**Decision:** Home should aggregate real server-authorized work state; it should
not become a card dashboard or project-list wrapper.

- [ ] **Step 1: Show continuation, not a generic dashboard**

Home should start with compact rows such as recent documents, recent projects,
recent notebooks, unresolved save/conflict status, and relevant AI/job status
only when those records are server-backed.

- [ ] **Step 2: Keep Home card-light**

Cards are acceptable for short summaries or empty states. Do not use Home to
reintroduce the SaaS dashboard/card pattern that manual QA rejected.

- [ ] **Step 3: Verify Home data boundaries**

Home must only render records the current user is authorized to see. Project
content still requires project membership.

### Post-MVP Stage E: Define Search and Library contracts before full UI

**Decision:** defer full `Search` and `Library` implementation until server-owned
literature, asset, citation, and external discovery contracts are explicit.

- [ ] **Step 1: Keep Search semantics external**

Top-level `Search` means external literature/DOI/URL discovery, not internal
global object search. Internal object lookup should be handled by command/global
search separately.

- [ ] **Step 2: Keep Library semantics personal/local**

`Library` means stored literature/assets owned by the user's workspace context,
with local search over saved assets. It is not the same as external discovery.

- [ ] **Step 3: Add contracts before UI-heavy work**

Do not build full Search/Library pages until the relevant server-owned models
and shared payloads exist, such as external discovery results, saved literature
assets, reader metadata, references, citations, excerpts, and provenance.

- [ ] **Step 4: Verify no fake client-owned library state**

Search and Library must not rely on fake browser-only state or raw provider keys.
They must follow the same server-first storage, authorization, and audit rules as
Projects, Documents, Attachments, and AI.

---

## Self-review checklist

- [ ] Product boundary follows `doc/MVP_rule.md`
- [ ] No evidence/reference machinery is implemented in MVP
- [ ] `SpaceAdmin` cannot read project content unless also project member
- [ ] All document permission checks happen on API server
- [ ] `Document.type` DB constraint exists
- [ ] Draft save and formal revision save are separate
- [ ] AI cannot write into documents
- [ ] Attachment buckets stay private
- [ ] Signed download URLs expire after 15 minutes
- [ ] Upload intents expire after 1 hour
- [ ] AI keys are encrypted and never echoed to browser
- [ ] Audit payload redacts content and secrets
- [ ] Task 0 confirmed repository hygiene before any implementation commit
- [ ] Every git command used `GIT_MASTER=1`
- [ ] Each checkpoint staged only files listed under `Git and commit protocol`

## Execution handoff

Plan is ready for implementation in milestone order.

Recommended execution mode: main-session implementation, one milestone at a time, with read-only subagents for context gathering and review.

Alternative execution mode: inline execution, stopping after each task group for verification.
