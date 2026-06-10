import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createAuditRepository,
  createLibraryRepository,
  createPrismaClient,
  initializeAuditPersistence,
} from '../../src/db';
import { createJixiaApp } from '../../src/server/app';
import { createAuditService } from '../../src/server/services/audit.service';
import {
  createHttpTestPubmedConnector,
  loginAs,
  startTestServer,
  withSessionCookie,
} from './http-session-test-helpers';

describe('generic governance audit', () => {
  it('backfills existing job audit rows with canonical scope and object fields', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-audit-backfill-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-audit-backfill.db')}`;
    const prisma = createPrismaClient({ url: databaseUrl });

    try {
      await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "User" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "email" TEXT NOT NULL,
          "displayName" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "Space" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "name" TEXT NOT NULL,
          "kind" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "ProviderCredential" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "provider" TEXT NOT NULL,
          "secretRef" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "Job" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "spaceId" TEXT NOT NULL,
          "scopeType" TEXT NOT NULL DEFAULT 'user',
          "scopeId" TEXT NOT NULL,
          "requestedByUserId" TEXT NOT NULL,
          "credentialRef" TEXT NOT NULL,
          "kind" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          "payload" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "AuditLog" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "spaceId" TEXT NOT NULL,
          "actorUserId" TEXT NOT NULL,
          "jobId" TEXT,
          "action" TEXT NOT NULL,
          "detail" TEXT NOT NULL,
          "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "User" ("id", "email", "displayName")
        VALUES ('user-alice', 'alice@example.test', 'Alice')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Space" ("id", "name", "kind")
        VALUES ('space-audit', 'Audit Space', 'shared')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "ProviderCredential" ("id", "userId", "provider", "secretRef")
        VALUES ('cred-audit', 'user-alice', 'openai', 'secret-audit')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Job" ("id", "spaceId", "scopeType", "scopeId", "requestedByUserId", "credentialRef", "kind", "status", "payload")
        VALUES ('job-audit', 'space-audit', 'project', 'project-audit', 'user-alice', 'cred-audit', 'ai.summary', 'queued', '{}')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "AuditLog" ("id", "spaceId", "actorUserId", "jobId", "action", "detail")
        VALUES ('audit-audit', 'space-audit', 'user-alice', 'job-audit', 'job.created', 'Created legacy job audit row.')
      `);

      await initializeAuditPersistence(prisma);

      const records = await createAuditRepository(prisma).listAuditRecordsByJob('job-audit');

      expect(records).toEqual([
        expect.objectContaining({
          action: 'job.created',
          jobId: 'job-audit',
          object: { id: 'job-audit', type: 'job' },
          projectId: 'project-audit',
          scope: { id: 'project-audit', type: 'project' },
          spaceId: 'space-audit',
        }),
      ]);
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('sanitizes audit detail and rejects forbidden metadata keys', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-audit-sanitize-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-audit-sanitize.db')}`;
    const prisma = createPrismaClient({ url: databaseUrl });
    const auditService = createAuditService({
      auditRepository: createAuditRepository(prisma),
      nextId: (prefix) => `${prefix}-sanitize`,
    });

    try {
      const app = createJixiaApp({ env: { JIXIA_DATABASE_URL: databaseUrl, JIXIA_STORAGE_ROOT: storageRoot } });

      let spaceId = '';

      try {
        const space = await app.spaces.createSpace(
          { kind: 'shared', name: 'Audit' },
          'user-alice',
        );
        spaceId = space.id;
      } finally {
        await app.close();
      }

      await expect(
        auditService.createRecord({
          action: 'project_doc.saved',
          actorUserId: 'user-alice',
          detail: 'Saved doc with credential cred-secret and rawSecret=sk-secret.',
          metadata: { content: 'private body' },
          object: { id: 'doc-audit', type: 'project_doc' },
          projectId: 'project-audit',
          scope: { id: 'project-audit', type: 'project' },
          spaceId,
        }),
      ).rejects.toThrow(/content is not accepted for audit metadata/i);

      const record = await auditService.createRecord({
        action: 'project_doc.saved',
        actorUserId: 'user-alice',
        detail: 'Saved doc with credential cred-secret and rawSecret=sk-secret.',
        metadata: { citationCount: 3, publishState: 'review' },
        object: { id: 'doc-audit', type: 'project_doc' },
        projectId: 'project-audit',
        scope: { id: 'project-audit', type: 'project' },
        spaceId,
      });

      expect(record.detail).not.toContain('cred-secret');
      expect(record.detail).not.toContain('sk-secret');
      expect(record.metadata).toEqual({ citationCount: 3, publishState: 'review' });
      expect(JSON.stringify(record)).not.toMatch(/rawSecret|sk-secret|cred-secret|content|body/i);
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('serves project audit through ProjectMember authorization and safe filters', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-project-audit-http-'));
    const env = {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-project-audit-http.db')}`,
      JIXIA_STORAGE_ROOT: storageRoot,
    };

    try {
      const app = createJixiaApp({
        connectors: { pubmed: createHttpTestPubmedConnector() },
        env,
      });
      let auditedJobId = '';
      let projectId = '';

      try {
        const sharedSpace = await app.spaces.createSpace(
          { kind: 'shared', name: 'Project Audit HTTP' },
          'user-alice',
        );
        const project = await app.projects.createProject(
          { name: 'Audited Project', spaceId: sharedSpace.id },
          'user-alice',
        );
        projectId = project.project.id;
        await app.projects.addProjectMember(
          projectId,
          { role: 'viewer', userId: 'user-bob' },
          'user-alice',
        );
        const credential = await app.credentials.createCredential(
          { provider: 'openai', rawSecret: 'project-audit-secret', userId: 'user-alice' },
          'user-alice',
        );
        const job = await app.jobs.createJob(
          {
            credentialRef: credential.credentialRef,
            kind: 'ai.summary',
            payload: { prompt: 'Project audit route.' },
            scope: { id: projectId, type: 'project' },
            spaceId: sharedSpace.id,
          },
          'user-alice',
        );
        auditedJobId = job.id;
      } finally {
        await app.close();
      }

      const server = await startTestServer(env);

      try {
        const missingSessionResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit`,
        );
        expect(missingSessionResponse.status).toBe(401);

        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');
        const charlieCookie = await loginAs(server.url, 'user-charlie');

        const bobResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?objectType=job`,
          { headers: withSessionCookie(bobCookie) },
        );
        const bobPayload = await bobResponse.json() as Array<{
          action: string;
          detail: string;
          object: { id: string; type: string };
          projectId?: string;
          scope: { id: string; type: string };
        }>;

        expect(bobResponse.status).toBe(200);
        expect(bobPayload).toHaveLength(1);
        expect(bobPayload[0]).toMatchObject({
          action: 'job.created',
          object: { type: 'job' },
          projectId,
          scope: { id: projectId, type: 'project' },
        });
        expect(JSON.stringify(bobPayload)).not.toMatch(/rawSecret|credentialRef|cred-|payload|storageKey|checksum|project-audit-secret/i);

        const objectFilterResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?objectType=job&objectId=${auditedJobId}`,
          { headers: withSessionCookie(bobCookie) },
        );
        const objectFilterPayload = await objectFilterResponse.json() as Array<{
          object: { id: string; type: string };
        }>;

        expect(objectFilterResponse.status).toBe(200);
        expect(objectFilterPayload).toHaveLength(1);
        expect(objectFilterPayload[0]?.object).toEqual({ id: auditedJobId, type: 'job' });

        const charlieResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit`,
          { headers: withSessionCookie(charlieCookie) },
        );
        expect(charlieResponse.status).toBe(403);

        const legacyQueryResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?actorUserId=user-alice`,
          { headers: withSessionCookie(aliceCookie) },
        );
        expect(legacyQueryResponse.status).toBe(400);

        const projectContextResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?projectId=${projectId}`,
          { headers: withSessionCookie(aliceCookie) },
        );
        expect(projectContextResponse.status).toBe(400);

        const metadataJsonResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?metadataJson={}`,
          { headers: withSessionCookie(aliceCookie) },
        );
        expect(metadataJsonResponse.status).toBe(400);

        const rawSecretFilterResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?rawSecret=sk-not-a-filter`,
          { headers: withSessionCookie(aliceCookie) },
        );
        expect(rawSecretFilterResponse.status).toBe(400);

        const legacyActorSpaceResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?actorSpaceId=space-legacy`,
          { headers: withSessionCookie(aliceCookie) },
        );
        expect(legacyActorSpaceResponse.status).toBe(400);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('records new Project Library source adoption audits without duplicating reused or denied attempts', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-project-library-audit-'));
    const env = {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-project-library-audit.db')}`,
      JIXIA_STORAGE_ROOT: storageRoot,
    };

    try {
      const app = createJixiaApp({
        connectors: { pubmed: createHttpTestPubmedConnector() },
        env,
      });
      let projectId = '';
      let editorSourceLibraryEntryId = '';
      let editorTargetProjectLibraryEntryId = '';
      let rollbackSourcePaperAssetId = '';
      let sourceLibraryEntryId = '';
      let targetProjectLibraryEntryId = '';
      let rejectedHttpSourceLibraryEntryId = '';
      let sharedSpaceId = '';

      try {
        const sharedSpace = await app.spaces.createSpace(
          { kind: 'shared', name: 'Project Library Audit Space' },
          'user-alice',
        );
        sharedSpaceId = sharedSpace.id;
        const project = await app.projects.createProject(
          { name: 'Project Library Audit Project', spaceId: sharedSpace.id },
          'user-alice',
        );
        projectId = project.project.id;
        await app.projects.addProjectMember(
          projectId,
          { role: 'viewer', userId: 'user-bob' },
          'user-alice',
        );
        await app.projects.addProjectMember(
          projectId,
          { role: 'editor', userId: 'user-editor' },
          'user-alice',
        );

        const personalSource = await app.imports.importPaper(
          {
            scope: { id: 'user-alice', type: 'user' },
            sourceLocator: '10.1000/project-library-adoption-audit-source',
            sourceType: 'doi',
            spaceId: sharedSpace.id,
            visibility: 'private',
          },
          'user-alice',
        );
        sourceLibraryEntryId = personalSource.entry.id;
        await app.reading.createNote({
          actorUserId: 'user-alice',
          body: 'Private adoption audit note must not leak.',
          libraryEntryId: personalSource.entry.id,
        });

        const rejectedHttpSource = await app.imports.importPaper(
          {
            scope: { id: 'user-alice', type: 'user' },
            sourceLocator: '10.1000/project-library-adoption-rejected-http-source',
            sourceType: 'doi',
            spaceId: sharedSpace.id,
            visibility: 'private',
          },
          'user-alice',
        );
        rejectedHttpSourceLibraryEntryId = rejectedHttpSource.entry.id;

        const editorPersonalSource = await app.imports.importPaper(
          {
            scope: { id: 'user-editor', type: 'user' },
            sourceLocator: '10.1000/project-library-adoption-editor-source',
            sourceType: 'doi',
            spaceId: sharedSpace.id,
            visibility: 'private',
          },
          'user-editor',
        );
        editorSourceLibraryEntryId = editorPersonalSource.entry.id;

        const rollbackPersonalSource = await app.imports.importPaper(
          {
            scope: { id: 'user-alice', type: 'user' },
            sourceLocator: '10.1000/project-library-adoption-audit-rollback-source',
            sourceType: 'doi',
            spaceId: sharedSpace.id,
            visibility: 'private',
          },
          'user-alice',
        );
        rollbackSourcePaperAssetId = rollbackPersonalSource.asset.id;

        const firstAdoption = await app.library.adoptProjectLibraryEntry({
          actorUserId: 'user-alice',
          projectId,
          sourceLibraryEntryId,
        });
        targetProjectLibraryEntryId = firstAdoption.entry.entry.id;
        const repeatedAdoption = await app.library.adoptProjectLibraryEntry({
          actorUserId: 'user-alice',
          projectId,
          sourceLibraryEntryId,
        });
        const editorAdoption = await app.library.adoptProjectLibraryEntry({
          actorUserId: 'user-editor',
          projectId,
          sourceLibraryEntryId: editorSourceLibraryEntryId,
        });
        editorTargetProjectLibraryEntryId = editorAdoption.entry.entry.id;

        expect(firstAdoption.reused).toBe(false);
        expect(repeatedAdoption.reused).toBe(true);
        expect(repeatedAdoption.entry.entry.id).toBe(targetProjectLibraryEntryId);
        expect(editorAdoption.reused).toBe(false);
        expect(editorAdoption.entry.entry.scope).toEqual({ id: projectId, type: 'project' });

        await expect(
          app.library.adoptProjectLibraryEntry({
            actorUserId: 'user-bob',
            projectId,
            sourceLibraryEntryId: targetProjectLibraryEntryId,
          }),
        ).rejects.toThrow(/mutation|access denied/i);
        await expect(
          app.library.adoptProjectLibraryEntry({
            actorUserId: 'user-charlie',
            projectId,
            sourceLibraryEntryId: targetProjectLibraryEntryId,
          }),
        ).rejects.toThrow(/access denied/i);
        await expect(
          app.library.adoptProjectLibraryEntry({
            actorUserId: 'user-editor',
            projectId,
            sourceLibraryEntryId,
          }),
        ).rejects.toThrow(/access denied/i);
        await expect(
          app.library.adoptProjectLibraryEntry({
            actorUserId: 'user-alice',
            projectId,
            sourceLibraryEntryId: '',
          }),
        ).rejects.toThrow(/sourceLibraryEntryId/i);
        await expect(
          app.library.adoptProjectLibraryEntry({
            actorUserId: 'user-alice',
            projectId,
            sourceLibraryEntryId: 'entry-missing-adoption-audit-source',
          }),
        ).rejects.toThrow(/does not exist/i);
        await expect(
          app.library.adoptProjectLibraryEntry({
            actorUserId: 'user-alice',
            projectId: 'project-missing-adoption-audit-target',
            sourceLibraryEntryId,
          }),
        ).rejects.toThrow(/does not exist/i);
      } finally {
        await app.close();
      }

      const rollbackPrisma = createPrismaClient({ url: env.JIXIA_DATABASE_URL });

      try {
        const libraryRepository = createLibraryRepository(rollbackPrisma);

        await expect(
          libraryRepository.adoptExistingPaperAsset({
            addedByUserId: 'user-alice',
            audit: {
              action: 'project_library.source_adopted',
              actorUserId: 'user-alice',
              detail: 'Adopted source into Project Library.',
              metadata: { sourceType: 'doi' },
              objectType: 'library_entry',
              projectId,
              scope: { id: projectId, type: 'project' },
              spaceId: 'space-missing-adoption-audit-rollback',
            },
            paperAssetId: rollbackSourcePaperAssetId,
            scope: { id: projectId, type: 'project' },
          }),
        ).rejects.toThrow();

        const rollbackEntries = await libraryRepository.listLibraryEntriesForAsset(
          rollbackSourcePaperAssetId,
        );

        expect(
          rollbackEntries.some(
            (view) =>
              view.entry.scope.type === 'project' && view.entry.scope.id === projectId,
          ),
        ).toBe(false);
      } finally {
        await rollbackPrisma.$disconnect();
      }

      const server = await startTestServer(env);

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');
        const charlieCookie = await loginAs(server.url, 'user-charlie');

        const objectFilterResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?objectType=library_entry&objectId=${targetProjectLibraryEntryId}`,
          { headers: withSessionCookie(bobCookie) },
        );
        const objectFilterPayload = await objectFilterResponse.json() as Array<{
          action: string;
          actorUserId: string;
          detail: string;
          metadata?: Record<string, string | number | boolean | null>;
          object: { id: string; type: string };
          projectId?: string;
          scope: { id: string; type: string };
          spaceId?: string;
        }>;

        expect(objectFilterResponse.status).toBe(200);
        expect(objectFilterPayload).toHaveLength(1);
        expect(objectFilterPayload[0]).toMatchObject({
          action: 'project_library.source_adopted',
          actorUserId: 'user-alice',
          detail: 'Adopted source into Project Library.',
          metadata: { sourceType: 'doi' },
          object: { id: targetProjectLibraryEntryId, type: 'library_entry' },
          projectId,
          scope: { id: projectId, type: 'project' },
          spaceId: sharedSpaceId,
        });
        expect(JSON.stringify(objectFilterPayload)).not.toContain(sourceLibraryEntryId);
        expect(JSON.stringify(objectFilterPayload)).not.toContain(editorSourceLibraryEntryId);
        expect(JSON.stringify(objectFilterPayload)).not.toContain(rejectedHttpSourceLibraryEntryId);
        expect(JSON.stringify(objectFilterPayload)).not.toMatch(
          /sourceLibraryEntryId|rawSecret|credentialRef|payload|storageKey|checksum|content|snapshot|body|private note|JIXIA_STORAGE_ROOT|papers\//i,
        );
        expect(JSON.stringify(objectFilterPayload)).not.toContain(
          'HTTP DOI paper 10.1000/project-library-adoption-audit-source',
        );

        const allLibraryEntryAuditResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?objectType=library_entry`,
          { headers: withSessionCookie(bobCookie) },
        );
        const allLibraryEntryAuditPayload = await allLibraryEntryAuditResponse.json() as Array<{
          action: string;
          actorUserId: string;
          object: { id: string; type: string };
        }>;

        expect(allLibraryEntryAuditResponse.status).toBe(200);
        expect(allLibraryEntryAuditPayload).toHaveLength(2);
        expect(allLibraryEntryAuditPayload).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'project_library.source_adopted',
              actorUserId: 'user-alice',
              object: { id: targetProjectLibraryEntryId, type: 'library_entry' },
            }),
            expect.objectContaining({
              action: 'project_library.source_adopted',
              actorUserId: 'user-editor',
              object: { id: editorTargetProjectLibraryEntryId, type: 'library_entry' },
            }),
          ]),
        );
        expect(JSON.stringify(allLibraryEntryAuditPayload)).not.toContain(sourceLibraryEntryId);
        expect(JSON.stringify(allLibraryEntryAuditPayload)).not.toContain(editorSourceLibraryEntryId);

        const nonMemberAuditResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?objectType=library_entry`,
          { headers: withSessionCookie(charlieCookie) },
        );
        expect(nonMemberAuditResponse.status).toBe(403);

        const unsafeAuditQueryResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?objectType=library_entry&metadataJson={}`,
          { headers: withSessionCookie(aliceCookie) },
        );
        expect(unsafeAuditQueryResponse.status).toBe(400);

        const rejectedAdoptionQueryResponse = await fetch(
          `${server.url}/api/projects/${projectId}/library/adoptions?projectId=${projectId}`,
          {
            body: JSON.stringify({ sourceLibraryEntryId: rejectedHttpSourceLibraryEntryId }),
            headers: withSessionCookie(aliceCookie, { 'Content-Type': 'application/json' }),
            method: 'POST',
          },
        );
        expect(rejectedAdoptionQueryResponse.status).toBe(400);

        const rejectedCreatedByQueryResponse = await fetch(
          `${server.url}/api/projects/${projectId}/library/adoptions?createdByUserId=user-alice`,
          {
            body: JSON.stringify({ sourceLibraryEntryId: rejectedHttpSourceLibraryEntryId }),
            headers: withSessionCookie(aliceCookie, { 'Content-Type': 'application/json' }),
            method: 'POST',
          },
        );
        expect(rejectedCreatedByQueryResponse.status).toBe(400);

        const rejectedArbitraryQueryResponse = await fetch(
          `${server.url}/api/projects/${projectId}/library/adoptions?payload=ignored`,
          {
            body: JSON.stringify({ sourceLibraryEntryId: rejectedHttpSourceLibraryEntryId }),
            headers: withSessionCookie(aliceCookie, { 'Content-Type': 'application/json' }),
            method: 'POST',
          },
        );
        expect(rejectedArbitraryQueryResponse.status).toBe(400);

        const rejectedAdoptionBodyResponse = await fetch(
          `${server.url}/api/projects/${projectId}/library/adoptions`,
          {
            body: JSON.stringify({
              sourceLibraryEntryId: rejectedHttpSourceLibraryEntryId,
              visibility: 'published_to_project',
            }),
            headers: withSessionCookie(aliceCookie, { 'Content-Type': 'application/json' }),
            method: 'POST',
          },
        );
        expect(rejectedAdoptionBodyResponse.status).toBe(400);

        const rejectedCreatedByBodyResponse = await fetch(
          `${server.url}/api/projects/${projectId}/library/adoptions`,
          {
            body: JSON.stringify({
              createdByUserId: 'user-alice',
              sourceLibraryEntryId: rejectedHttpSourceLibraryEntryId,
            }),
            headers: withSessionCookie(aliceCookie, { 'Content-Type': 'application/json' }),
            method: 'POST',
          },
        );
        expect(rejectedCreatedByBodyResponse.status).toBe(400);

        const rejectedArbitraryBodyResponse = await fetch(
          `${server.url}/api/projects/${projectId}/library/adoptions`,
          {
            body: JSON.stringify({
              payload: 'ignored',
              sourceLibraryEntryId: rejectedHttpSourceLibraryEntryId,
            }),
            headers: withSessionCookie(aliceCookie, { 'Content-Type': 'application/json' }),
            method: 'POST',
          },
        );
        expect(rejectedArbitraryBodyResponse.status).toBe(400);

        const allAfterRejectedHttpResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?objectType=library_entry`,
          { headers: withSessionCookie(bobCookie) },
        );
        const allAfterRejectedHttpPayload = await allAfterRejectedHttpResponse.json() as unknown[];

        expect(allAfterRejectedHttpResponse.status).toBe(200);
        expect(allAfterRejectedHttpPayload).toHaveLength(2);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('records Project Doc writes through the project audit route without leaking write payloads', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-project-doc-audit-'));
    const env = {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-project-doc-audit.db')}`,
      JIXIA_STORAGE_ROOT: storageRoot,
    };

    try {
      const app = createJixiaApp({
        connectors: { pubmed: createHttpTestPubmedConnector() },
        env,
      });
      let documentId = '';
      let projectId = '';
      let sharedSpaceId = '';
      let failedWorkbenchProjectId = '';
      let workbenchDocumentId = '';
      let workbenchProjectId = '';

      try {
        const sharedSpace = await app.spaces.createSpace(
          { kind: 'shared', name: 'Project Doc Audit Space' },
          'user-alice',
        );
        sharedSpaceId = sharedSpace.id;
        const project = await app.projects.createProject(
          { name: 'Project Doc Audit Project', spaceId: sharedSpace.id },
          'user-alice',
        );
        projectId = project.project.id;
        await app.projects.addProjectMember(
          projectId,
          { role: 'viewer', userId: 'user-bob' },
          'user-alice',
        );
        const projectSource = await app.imports.importPaper(
          {
            scope: { id: projectId, type: 'project' },
            sourceLocator: '10.1000/project-doc-audit-source',
            sourceType: 'doi',
            spaceId: sharedSpace.id,
            visibility: 'published_to_project',
          },
          'user-alice',
        );
        const privateSource = await app.imports.importPaper(
          {
            scope: { id: 'user-alice', type: 'user' },
            sourceLocator: '10.1000/project-doc-audit-private-source',
            sourceType: 'doi',
            spaceId: sharedSpace.id,
            visibility: 'private',
          },
          'user-alice',
        );
        const projectDoc = await app.projectDocs.createDocument(
          { projectId, title: 'Audited Project Doc' },
          'user-alice',
        );
        documentId = projectDoc.id;
        await app.projectDocs.saveDocument(
          {
            citations: [
              {
                evidenceSpan: 'citation evidence text must not leak',
                paperAssetId: projectSource.asset.id,
              },
            ],
            content: 'Shared Project Doc body must not leak into audit records.',
            documentId,
          },
          'user-alice',
        );
        await app.projectDocs.transitionPublishState(
          { documentId, publishState: 'review' },
          'user-alice',
        );
        const notebook = await app.notebooks.createDocument(
          { title: 'Private audit adoption notebook' },
          'user-alice',
        );
        await app.notebooks.saveDocument(
          {
            citations: [],
            content: 'Private notebook body must not leak into audit records.',
            documentId: notebook.id,
          },
          'user-alice',
        );
        await app.projectDocs.adoptNotebook(
          { documentId, notebookDocumentId: notebook.id },
          'user-alice',
        );

        await expect(
          app.projectDocs.saveDocument(
            {
              citations: [],
              content: 'Viewer write body must not produce audit records.',
              documentId,
            },
            'user-bob',
          ),
        ).rejects.toThrow(/mutation/i);
        await expect(
          app.projectDocs.saveDocument(
            {
              citations: [],
              content: 'Non-member write body must not produce audit records.',
              documentId,
            },
            'user-charlie',
          ),
        ).rejects.toThrow(/access denied/i);
        await expect(
          app.projectDocs.createDocument(
            { projectId, title: 'Viewer forbidden Project Doc' },
            'user-bob',
          ),
        ).rejects.toThrow(/mutation/i);
        await expect(
          app.projectDocs.saveDocument(
            {
              citations: [
                {
                  evidenceSpan: 'private citation evidence must not produce audit records',
                  paperAssetId: privateSource.asset.id,
                },
              ],
              content: 'Invalid citation save body must not produce audit records.',
              documentId,
            },
            'user-alice',
          ),
        ).rejects.toThrow(/not available in project/i);
        await expect(
          app.projectDocs.adoptNotebook(
            { documentId, notebookDocumentId: 'notebook-missing-project-doc-audit' },
            'user-alice',
          ),
        ).rejects.toThrow(/does not exist/i);

        const failedWorkbenchProject = await app.projects.createProject(
          { name: 'Failed Workbench Project Doc Audit Project', spaceId: sharedSpace.id },
          'user-alice',
        );
        failedWorkbenchProjectId = failedWorkbenchProject.project.id;
        await expect(
          app.projectDocs.saveWorkbenchDocument(
            {
              citations: [
                {
                  evidenceSpan: 'failed workbench citation evidence must not produce audit records',
                  paperAssetId: privateSource.asset.id,
                },
              ],
              content: 'Failed workbench compatibility body must not produce audit records.',
              projectId: failedWorkbenchProjectId,
              title: 'Failed Workbench Draft',
            },
            'user-alice',
          ),
        ).rejects.toThrow(/not available in project/i);

        const workbenchProject = await app.projects.createProject(
          { name: 'Workbench Project Doc Audit Project', spaceId: sharedSpace.id },
          'user-alice',
        );
        workbenchProjectId = workbenchProject.project.id;
        const workbenchDocument = await app.projectDocs.saveWorkbenchDocument(
          {
            citations: [],
            content: 'Workbench compatibility body must not leak into audit records.',
            projectId: workbenchProjectId,
            title: 'Audited Workbench Draft',
          },
          'user-alice',
        );
        workbenchDocumentId = workbenchDocument.documentId;
      } finally {
        await app.close();
      }

      const server = await startTestServer(env);

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');

        const invalidPublishStateResponse = await fetch(
          `${server.url}/api/project-docs/${documentId}/publish-state`,
          {
            body: JSON.stringify({ publishState: 'archived' }),
            headers: withSessionCookie(aliceCookie, { 'Content-Type': 'application/json' }),
            method: 'POST',
          },
        );
        expect(invalidPublishStateResponse.status).toBe(400);

        const bobResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?objectType=project_doc&objectId=${documentId}`,
          { headers: withSessionCookie(bobCookie) },
        );
        const bobPayload = await bobResponse.json() as Array<{
          action: string;
          actorUserId: string;
          detail: string;
          metadata?: Record<string, string | number | boolean | null>;
          object: { id: string; type: string };
          projectId?: string;
          scope: { id: string; type: string };
          spaceId?: string;
        }>;

        expect(bobResponse.status).toBe(200);
        expect(bobPayload.map((record) => record.action)).toEqual(
          expect.arrayContaining([
            'project_doc.created',
            'project_doc.saved',
            'project_doc.publish_state_changed',
            'project_doc.notebook_adopted',
          ]),
        );
        expect(bobPayload).toHaveLength(4);
        for (const record of bobPayload) {
          expect(record.actorUserId).toBe('user-alice');
          expect(record.object).toEqual({ id: documentId, type: 'project_doc' });
          expect(record.projectId).toBe(projectId);
          expect(record.scope).toEqual({ id: projectId, type: 'project' });
          expect(record.spaceId).toBe(sharedSpaceId);
        }
        expect(bobPayload.find((record) => record.action === 'project_doc.created')?.metadata).toEqual({
          publishState: 'draft',
        });
        expect(bobPayload.find((record) => record.action === 'project_doc.saved')?.metadata).toMatchObject({
          citationCount: 1,
          versionNumber: 1,
        });
        expect(bobPayload.find((record) => record.action === 'project_doc.saved')?.metadata?.versionId).toEqual(expect.any(String));
        expect(bobPayload.find((record) => record.action === 'project_doc.publish_state_changed')?.metadata).toEqual({
          publishState: 'review',
        });
        expect(bobPayload.find((record) => record.action === 'project_doc.notebook_adopted')?.metadata).toMatchObject({
          citationCount: 0,
          sourceCount: 0,
          versionNumber: 2,
        });
        expect(bobPayload.find((record) => record.action === 'project_doc.notebook_adopted')?.metadata?.versionId).toEqual(expect.any(String));
        expect(JSON.stringify(bobPayload)).not.toMatch(
          /rawSecret|credentialRef|payload|storageKey|checksum|content|snapshot|body|private note|citation evidence text|private citation evidence|Shared Project Doc body|Private notebook body|Workbench compatibility body/i,
        );

        const allProjectDocResponse = await fetch(
          `${server.url}/api/projects/${projectId}/audit?objectType=project_doc`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const allProjectDocPayload = await allProjectDocResponse.json() as Array<{
          action: string;
          object: { id: string; type: string };
        }>;
        expect(allProjectDocResponse.status).toBe(200);
        expect(allProjectDocPayload).toHaveLength(4);
        expect(allProjectDocPayload.every((record) => record.object.id === documentId)).toBe(true);

        const failedWorkbenchResponse = await fetch(
          `${server.url}/api/projects/${failedWorkbenchProjectId}/audit?objectType=project_doc`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const failedWorkbenchPayload = await failedWorkbenchResponse.json() as unknown[];
        expect(failedWorkbenchResponse.status).toBe(200);
        expect(failedWorkbenchPayload).toHaveLength(0);

        const workbenchResponse = await fetch(
          `${server.url}/api/projects/${workbenchProjectId}/audit?objectType=project_doc&objectId=${workbenchDocumentId}`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const workbenchPayload = await workbenchResponse.json() as Array<{
          action: string;
          metadata?: Record<string, string | number | boolean | null>;
          object: { id: string; type: string };
          projectId?: string;
          scope: { id: string; type: string };
        }>;

        expect(workbenchResponse.status).toBe(200);
        expect(workbenchPayload.map((record) => record.action)).toEqual(
          expect.arrayContaining(['project_doc.created', 'project_doc.saved']),
        );
        expect(workbenchPayload).toHaveLength(2);
        expect(workbenchPayload.every((record) => record.object.id === workbenchDocumentId)).toBe(true);
        expect(workbenchPayload.every((record) => record.projectId === workbenchProjectId)).toBe(true);
        expect(workbenchPayload.every((record) => record.scope.id === workbenchProjectId)).toBe(true);
        expect(workbenchPayload.find((record) => record.action === 'project_doc.saved')?.metadata).toMatchObject({
          citationCount: 0,
          versionNumber: 1,
        });
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 30_000);
});
