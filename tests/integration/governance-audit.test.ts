import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createAuditRepository,
  createPrismaClient,
  initializeAuditPersistence,
} from '../../src/db';
import { createJixiaApp } from '../../src/server/app';
import { createAuditService } from '../../src/server/services/audit.service';
import {
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
      const app = createJixiaApp({ env });
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
});
