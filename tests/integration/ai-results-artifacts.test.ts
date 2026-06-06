import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import type { DocumentBlockDocument } from '../../src/shared/contracts/document-content';
import { createJixiaApp } from '../../src/server/app';
import {
  loginAs,
  startTestServer,
  withSessionCookie,
} from './http-session-test-helpers';

function createAiResultsEnv(storageRoot: string) {
  return {
    JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-ai-results.db')}`,
    JIXIA_STORAGE_ROOT: storageRoot,
  };
}

const AI_RESULT_DOCUMENT: DocumentBlockDocument = {
  blocks: [
    {
      id: 'result-block',
      text: 'Server-owned synthesis result.',
      type: 'paragraph',
    },
  ],
  schemaVersion: 1,
};

describe('server-owned AI result artifacts', () => {
  it('creates safe artifacts from governed jobs and explicitly applies them through document services', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-ai-results-service-'));

    try {
      const env = createAiResultsEnv(storageRoot);
      const app = createJixiaApp({ env });

      try {
        const personalSpace = await app.spaces.createSpace(
          { kind: 'personal', name: 'Alice AI results space' },
          'user-alice',
        );
        const credential = await app.credentials.createCredential(
          { provider: 'openai', rawSecret: 'ai-results-secret-placeholder' },
          'user-alice',
        );
        const personalJob = await app.jobs.createJob(
          {
            credentialRef: credential.credentialRef,
            kind: 'ai.summary',
            payload: {
              contextPackId: 'context-pack-personal',
              contextRefs: [
                {
                  readerExcerptId: 'reader-excerpt-safe-ref',
                  sourceType: 'readerExcerpt',
                },
              ],
              instruction: 'Safe personal synthesis.',
            },
            scope: { id: 'user-alice', type: 'user' },
            spaceId: personalSpace.id,
          },
          'user-alice',
        );
        await app.jobs.runJob({ actorUserId: 'user-alice', jobId: personalJob.id });
        const personalResult = await app.aiResults.createFromJob(
          {
            documentContent: AI_RESULT_DOCUMENT,
            jobId: personalJob.id,
            provenance: { generatedInsightIds: ['generated-insight-safe-ref'] },
            summary: 'A safe personal result summary.',
            title: 'Personal result',
          },
          'user-alice',
        );
        const notebook = await app.notebooks.createDocument(
          { title: 'AI result target notebook' },
          'user-alice',
        );
        await app.notebooks.saveDocument(
          {
            citations: [],
            documentContent: {
              blocks: [{ id: 'intro', text: 'Existing private note.', type: 'paragraph' }],
              schemaVersion: 1,
            },
            documentId: notebook.id,
          },
          'user-alice',
        );
        const notebookApply = await app.aiResults.applyToNotebook(
          personalResult.id,
          {
            insertion: { mode: 'append', targetBlockId: 'intro' },
            notebookDocumentId: notebook.id,
          },
          'user-alice',
        );

        expect(personalResult).toMatchObject({
          provenance: {
            contextPackId: 'context-pack-personal',
            generatedInsightIds: ['generated-insight-safe-ref'],
            readerExcerptIds: ['reader-excerpt-safe-ref'],
          },
          status: 'draft',
        });
        expect(JSON.stringify(personalResult)).not.toMatch(
          /rawSecret|ai-results-secret-placeholder|credentialRef|payload|storageKey|checksum|private note/i,
        );
        expect(notebookApply).toMatchObject({
          appliedTarget: {
            notebookDocumentId: notebook.id,
            notebookVersionNumber: 2,
            type: 'notebookDocument',
          },
          contract: 'jixia-ai-results-contract-v1',
          result: { status: 'applied' },
          snapshot: {
            document: { id: notebook.id, ownerId: 'user-alice' },
            versionNumber: 2,
          },
        });
        expect(notebookApply.snapshot.documentContent?.blocks).toEqual([
          { id: 'intro', text: 'Existing private note.', type: 'paragraph' },
          { id: 'result-block', text: 'Server-owned synthesis result.', type: 'paragraph' },
        ]);
        await expect(
          app.aiResults.applyToNotebook(
            personalResult.id,
            { notebookDocumentId: notebook.id },
            'user-alice',
          ),
        ).rejects.toThrow(/already applied/i);
        await expect(
          app.aiResults.getArtifact(personalResult.id, 'user-bob'),
        ).rejects.toThrow(/access denied/i);

        const sharedSpace = await app.spaces.createSpace(
          { kind: 'shared', name: 'Project AI results space' },
          'user-alice',
        );
        const targetProject = await app.projects.createProject(
          { name: 'Target AI result project', spaceId: sharedSpace.id },
          'user-alice',
        );
        const otherProject = await app.projects.createProject(
          { name: 'Wrong AI result project', spaceId: sharedSpace.id },
          'user-alice',
        );
        await app.projects.addProjectMember(
          targetProject.project.id,
          { role: 'editor', userId: 'user-bob' },
          'user-alice',
        );
        await app.projects.addProjectMember(
          targetProject.project.id,
          { role: 'viewer', userId: 'user-charlie' },
          'user-alice',
        );
        const targetDoc = await app.projectDocs.createDocument(
          { projectId: targetProject.project.id, title: 'Target Project Doc' },
          'user-alice',
        );
        const otherDoc = await app.projectDocs.createDocument(
          { projectId: otherProject.project.id, title: 'Wrong Project Doc' },
          'user-alice',
        );
        await app.projectDocs.saveDocument(
          {
            citations: [],
            documentContent: {
              blocks: [{ id: 'project-intro', text: 'Existing shared draft.', type: 'paragraph' }],
              schemaVersion: 1,
            },
            documentId: targetDoc.id,
          },
          'user-alice',
        );
        const projectJob = await app.jobs.createJob(
          {
            credentialRef: credential.credentialRef,
            kind: 'ai.project-summary',
            payload: {
              contextPackId: 'context-pack-project',
              contextRefs: [
                {
                  libraryEntryId: 'project-library-safe-ref',
                  sourceType: 'projectLibraryEntry',
                },
                {
                  projectDocId: targetDoc.id,
                  projectDocVersionId: 'project-doc-version-safe-ref',
                  sourceType: 'projectDocVersion',
                },
              ],
            },
            scope: { id: targetProject.project.id, type: 'project' },
            spaceId: sharedSpace.id,
          },
          'user-alice',
        );
        await app.jobs.runJob({ actorUserId: 'user-alice', jobId: projectJob.id });
        const projectResult = await app.aiResults.createFromJob(
          {
            documentContent: {
              blocks: [{ text: 'Project synthesis result.', type: 'paragraph' }],
              schemaVersion: 1,
            },
            jobId: projectJob.id,
            title: 'Project result',
          },
          'user-alice',
        );

        await expect(
          app.aiResults.applyToProjectDoc(
            projectResult.id,
            { projectDocId: otherDoc.id },
            'user-alice',
          ),
        ).rejects.toThrow(/different project document/i);
        await expect(
          app.aiResults.applyToProjectDoc(
            projectResult.id,
            { projectDocId: targetDoc.id },
            'user-charlie',
          ),
        ).rejects.toThrow(/mutation/i);

        const projectApply = await app.aiResults.applyToProjectDoc(
          projectResult.id,
          { projectDocId: targetDoc.id },
          'user-bob',
        );
        const projectAudits = await app.audit.listByProject({
          objectId: projectResult.id,
          objectType: 'ai_result',
          projectId: targetProject.project.id,
        });

        expect(projectResult.provenance).toMatchObject({
          contextPackId: 'context-pack-project',
          projectDocIds: [targetDoc.id],
          projectDocVersionIds: ['project-doc-version-safe-ref'],
          projectLibraryEntryIds: ['project-library-safe-ref'],
        });
        expect(projectApply).toMatchObject({
          appliedTarget: {
            projectDocId: targetDoc.id,
            projectDocVersionNumber: 2,
            projectId: targetProject.project.id,
            type: 'projectDoc',
          },
          contract: 'jixia-ai-results-contract-v1',
          result: { status: 'applied' },
          snapshot: { document: { id: targetDoc.id }, versionNumber: 2 },
        });
        expect(projectApply.snapshot.documentContent?.blocks).toEqual([
          { id: 'project-intro', text: 'Existing shared draft.', type: 'paragraph' },
          { text: 'Project synthesis result.', type: 'paragraph' },
        ]);
        expect(projectAudits.map((record) => record.action)).toEqual(
          expect.arrayContaining(['ai_result.created', 'ai_result.applied.projectDoc']),
        );
        expect(JSON.stringify(projectAudits)).not.toMatch(
          /rawSecret|ai-results-secret-placeholder|credentialRef|payload|Project synthesis result|Existing shared draft|storageKey|checksum|content|body/i,
        );
        for (const record of projectAudits) {
          expect(record.metadata).toEqual(
            expect.objectContaining({
              resultArtifactId: projectResult.id,
              resultKind: 'ai.project-summary',
              sourceCount: expect.any(Number),
            }),
          );
        }

        const personalOnlyImport = await app.imports.uploadPdf(
          {
            pdfContents: 'Personal-only PDF bytes for AI result citation rejection.',
            scope: { id: 'user-alice', type: 'user' },
            spaceId: sharedSpace.id,
            visibility: 'private',
          },
          'user-alice',
        );
        const citationJob = await app.jobs.createJob(
          {
            credentialRef: credential.credentialRef,
            kind: 'ai.project-citation-summary',
            payload: { contextPackId: 'context-pack-project-citation', contextRefs: [] },
            scope: { id: targetProject.project.id, type: 'project' },
            spaceId: sharedSpace.id,
          },
          'user-alice',
        );
        await app.jobs.runJob({ actorUserId: 'user-alice', jobId: citationJob.id });
        const citationResult = await app.aiResults.createFromJob(
          {
            documentContent: {
              blocks: [
                {
                  label: 'Personal-only citation must not bypass Project Library adoption',
                  paperAssetId: personalOnlyImport.asset.id,
                  type: 'citation',
                },
              ],
              schemaVersion: 1,
            },
            jobId: citationJob.id,
            kind: 'ai.project-doc-citation-draft',
            title: 'Project citation result',
          },
          'user-alice',
        );

        await expect(
          app.aiResults.applyToProjectDoc(
            citationResult.id,
            { projectDocId: targetDoc.id },
            'user-alice',
          ),
        ).rejects.toThrow(/not available in project/i);

        const unappliedCitationResult = await app.aiResults.getArtifact(
          citationResult.id,
          'user-alice',
        );
        expect(unappliedCitationResult.result.status).toBe('draft');
      } finally {
        await app.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 60_000);

  it('protects HTTP result routes with session actors and rejects client authority fields', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-ai-results-http-'));

    try {
      const env = createAiResultsEnv(storageRoot);
      const seedApp = createJixiaApp({ env });
      let resultId = '';
      let notebookId = '';

      try {
        const space = await seedApp.spaces.createSpace(
          { kind: 'personal', name: 'HTTP AI results space' },
          'user-alice',
        );
        const credential = await seedApp.credentials.createCredential(
          { provider: 'openai', rawSecret: 'http-ai-results-secret-placeholder' },
          'user-alice',
        );
        const job = await seedApp.jobs.createJob(
          {
            credentialRef: credential.credentialRef,
            kind: 'ai.http-summary',
            payload: { contextPackId: 'http-context-pack', contextRefs: [] },
            scope: { id: 'user-alice', type: 'user' },
            spaceId: space.id,
          },
          'user-alice',
        );
        await seedApp.jobs.runJob({ actorUserId: 'user-alice', jobId: job.id });
        const result = await seedApp.aiResults.createFromJob(
          {
            documentContent: AI_RESULT_DOCUMENT,
            jobId: job.id,
            title: 'HTTP result',
          },
          'user-alice',
        );
        const notebook = await seedApp.notebooks.createDocument(
          { title: 'HTTP target notebook' },
          'user-alice',
        );

        resultId = result.id;
        notebookId = notebook.id;
      } finally {
        await seedApp.close();
      }

      const server = await startTestServer(env);

      try {
        const missingSession = await fetch(`${server.url}/api/ai-results`);

        expect(missingSession.status).toBe(401);

        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');

        for (const query of [
          'actorUserId=user-alice',
          'ownerId=user-alice',
          'createdByUserId=user-alice',
          'scopeType=user',
          'scopeId=user-alice',
          'projectId=project-spoof',
          'spaceId=space-spoof',
          'visibility=private',
        ]) {
          const response = await fetch(`${server.url}/api/ai-results?${query}`, {
            headers: withSessionCookie(aliceCookie),
          });

          expect(response.status).toBe(400);
        }

        const listResponse = await fetch(`${server.url}/api/ai-results`, {
          headers: withSessionCookie(aliceCookie),
        });
        const listPayload = await listResponse.json() as {
          contract: string;
          results: Array<{ id: string; scope: { id: string; type: string } }>;
          scope: { id: string; type: string };
        };

        expect(listResponse.status).toBe(200);
        expect(listPayload).toMatchObject({
          contract: 'jixia-ai-results-contract-v1',
          scope: { id: 'user-alice', type: 'user' },
        });
        expect(listPayload.results.map((result) => result.id)).toContain(resultId);
        expect(JSON.stringify(listPayload)).not.toMatch(
          /rawSecret|http-ai-results-secret-placeholder|credentialRef|payload|storageKey|checksum/i,
        );

        const bobRead = await fetch(`${server.url}/api/ai-results/${resultId}`, {
          headers: withSessionCookie(bobCookie),
        });
        expect(bobRead.status).toBe(403);

        const getResponse = await fetch(`${server.url}/api/ai-results/${resultId}`, {
          headers: withSessionCookie(aliceCookie),
        });
        const getPayload = await getResponse.json() as {
          contract: string;
          result: { id: string; status: string };
        };

        expect(getResponse.status).toBe(200);
        expect(getPayload).toMatchObject({
          contract: 'jixia-ai-results-contract-v1',
          result: { id: resultId, status: 'draft' },
        });

        const authorityBody = await fetch(
          `${server.url}/api/ai-results/${resultId}/apply/notebook`,
          {
            body: JSON.stringify({
              actorUserId: 'user-alice',
              notebookDocumentId: notebookId,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const nestedAuthorityBody = await fetch(
          `${server.url}/api/ai-results/${resultId}/apply/notebook`,
          {
            body: JSON.stringify({
              insertion: { mode: 'append', projectId: 'project-spoof' },
              notebookDocumentId: notebookId,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );

        expect(authorityBody.status).toBe(400);
        expect(nestedAuthorityBody.status).toBe(400);

        const applyResponse = await fetch(
          `${server.url}/api/ai-results/${resultId}/apply/notebook`,
          {
            body: JSON.stringify({ notebookDocumentId: notebookId }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const applyPayload = await applyResponse.json() as {
          appliedTarget: { notebookDocumentId: string; type: string };
          contract: string;
          result: { status: string };
          snapshot: { content: string; versionNumber: number };
        };

        expect(applyResponse.status).toBe(200);
        expect(applyPayload).toMatchObject({
          appliedTarget: { notebookDocumentId: notebookId, type: 'notebookDocument' },
          contract: 'jixia-ai-results-contract-v1',
          result: { status: 'applied' },
          snapshot: { versionNumber: 1 },
        });
        expect(applyPayload.snapshot.content).toContain('Server-owned synthesis result.');

        const conflictResponse = await fetch(
          `${server.url}/api/ai-results/${resultId}/apply/notebook`,
          {
            body: JSON.stringify({ notebookDocumentId: notebookId }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        expect(conflictResponse.status).toBe(409);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 60_000);
});
