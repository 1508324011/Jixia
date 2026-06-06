import type {
  AiResultApplyInsertion,
  AiResultArtifactRecord,
  AiResultProvenance,
  ApplyAiResultToNotebookRequest,
  ApplyAiResultToNotebookResponse,
  ApplyAiResultToProjectDocRequest,
  ApplyAiResultToProjectDocResponse,
  GetAiResultResponse,
  ListAiResultArtifactsResponse,
} from '@shared/contracts/ai-results';
import { aiResultsContract } from '@shared/contracts/ai-results';
import {
  createEmptyDocumentBlockDocument,
  documentBlockDocumentToLegacyText,
  legacyTextToDocumentBlockDocument,
  normalizeDocumentBlockDocument,
} from '@shared/contracts/document-content';
import type { DocumentBlockDocument } from '@shared/contracts/document-content';
import type { ScopeRef } from '@shared/contracts/projects';

import type {
  AiResultArtifactRepository,
  JobRepository,
  PersistedAiResultArtifactRecord,
  ProjectDocRepository,
  ProjectRepository,
  SpaceRepository,
} from '../../db';

import type { AuditService } from './audit.service';
import type { NotebookService } from './notebooks.service';
import type { ProjectDocsService } from './project-docs.service';
import {
  findAuthorizedJob,
  resolveAuthorizedListJobScopeContext,
} from '../jobs/job-governance';

export interface CreateAiResultArtifactRequest {
  documentContent?: DocumentBlockDocument;
  jobId: string;
  kind?: string;
  plainTextPreview?: string;
  provenance?: AiResultProvenance;
  summary?: string;
  title?: string;
}

export interface ListAiResultArtifactsRequest {
  actorUserId: string;
  scope?: ScopeRef;
  scopeId?: string;
  scopeType?: ScopeRef['type'];
  spaceId?: string;
}

export interface AiResultsService {
  applyToNotebook(
    resultId: string,
    input: ApplyAiResultToNotebookRequest,
    actorUserId: string,
  ): Promise<ApplyAiResultToNotebookResponse>;
  applyToProjectDoc(
    resultId: string,
    input: ApplyAiResultToProjectDocRequest,
    actorUserId: string,
  ): Promise<ApplyAiResultToProjectDocResponse>;
  createFromJob(
    input: CreateAiResultArtifactRequest,
    actorUserId: string,
  ): Promise<AiResultArtifactRecord>;
  getArtifact(
    resultId: string,
    actorUserId: string,
  ): Promise<GetAiResultResponse>;
  listArtifacts(
    input: ListAiResultArtifactsRequest,
  ): Promise<ListAiResultArtifactsResponse>;
}

export interface AiResultsStore {
  aiResultRepository: AiResultArtifactRepository;
  auditService: AuditService;
  jobRepository: JobRepository;
  nextId(prefix: string): string;
  notebookService: NotebookService;
  projectDocRepository: ProjectDocRepository;
  projectDocsService: ProjectDocsService;
  projectRepository: ProjectRepository;
  spaceRepository: SpaceRepository;
}

const PROVENANCE_ARRAY_KEYS = [
  'contextItemIds',
  'generatedInsightIds',
  'paperAssetIds',
  'projectDocCitationIds',
  'projectDocIds',
  'projectDocVersionIds',
  'projectLibraryEntryIds',
  'readerExcerptIds',
] as const;

function normalizeText(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function normalizeIdArray(value: string[] | undefined): string[] | undefined {
  const normalized = value
    ?.map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized?.length ? [...new Set(normalized)] : undefined;
}

function normalizeProvenance(
  provenance: AiResultProvenance | undefined,
): AiResultProvenance {
  if (!provenance) {
    return {};
  }

  const normalized: AiResultProvenance = {};
  const contextPackId = provenance.contextPackId?.trim();

  if (contextPackId) {
    normalized.contextPackId = contextPackId;
  }

  for (const key of PROVENANCE_ARRAY_KEYS) {
    const ids = normalizeIdArray(provenance[key]);

    if (ids) {
      normalized[key] = ids;
    }
  }

  return normalized;
}

function mergeIdArrays(
  existing: string[] | undefined,
  additions: string[] | undefined,
): string[] | undefined {
  return normalizeIdArray([...(existing ?? []), ...(additions ?? [])]);
}

function mergeProvenance(
  base: AiResultProvenance,
  additions: AiResultProvenance,
): AiResultProvenance {
  const merged: AiResultProvenance = {
    contextPackId: base.contextPackId ?? additions.contextPackId,
  };

  for (const key of PROVENANCE_ARRAY_KEYS) {
    const ids = mergeIdArrays(base[key], additions[key]);

    if (ids) {
      merged[key] = ids;
    }
  }

  return merged;
}

function readStringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function deriveProvenanceFromJobPayload(payload: string): AiResultProvenance {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  const payloadRecord = parsed as Record<string, unknown>;
  const provenance: AiResultProvenance = {};
  const contextPackId = readStringField(payloadRecord.contextPackId);

  if (contextPackId) {
    provenance.contextPackId = contextPackId;
  }

  const contextRefs = payloadRecord.contextRefs;

  if (!Array.isArray(contextRefs)) {
    return provenance;
  }

  for (const contextRef of contextRefs) {
    if (!contextRef || typeof contextRef !== 'object' || Array.isArray(contextRef)) {
      continue;
    }

    const ref = contextRef as Record<string, unknown>;

    switch (ref.sourceType) {
      case 'generatedInsight': {
        provenance.generatedInsightIds = mergeIdArrays(
          provenance.generatedInsightIds,
          [readStringField(ref.generatedInsightId)].filter((id): id is string => Boolean(id)),
        );
        provenance.projectLibraryEntryIds = mergeIdArrays(
          provenance.projectLibraryEntryIds,
          [readStringField(ref.libraryEntryId)].filter((id): id is string => Boolean(id)),
        );
        break;
      }
      case 'projectDocCitation': {
        provenance.projectDocCitationIds = mergeIdArrays(
          provenance.projectDocCitationIds,
          [readStringField(ref.citationId)].filter((id): id is string => Boolean(id)),
        );
        provenance.projectDocIds = mergeIdArrays(
          provenance.projectDocIds,
          [readStringField(ref.projectDocId)].filter((id): id is string => Boolean(id)),
        );
        provenance.projectDocVersionIds = mergeIdArrays(
          provenance.projectDocVersionIds,
          [readStringField(ref.projectDocVersionId)].filter((id): id is string => Boolean(id)),
        );
        break;
      }
      case 'projectDocVersion': {
        provenance.projectDocIds = mergeIdArrays(
          provenance.projectDocIds,
          [readStringField(ref.projectDocId)].filter((id): id is string => Boolean(id)),
        );
        provenance.projectDocVersionIds = mergeIdArrays(
          provenance.projectDocVersionIds,
          [readStringField(ref.projectDocVersionId)].filter((id): id is string => Boolean(id)),
        );
        break;
      }
      case 'projectLibraryEntry': {
        provenance.projectLibraryEntryIds = mergeIdArrays(
          provenance.projectLibraryEntryIds,
          [readStringField(ref.libraryEntryId)].filter((id): id is string => Boolean(id)),
        );
        break;
      }
      case 'readerExcerpt': {
        provenance.readerExcerptIds = mergeIdArrays(
          provenance.readerExcerptIds,
          [readStringField(ref.readerExcerptId)].filter((id): id is string => Boolean(id)),
        );
        break;
      }
    }
  }

  return normalizeProvenance(provenance);
}

function countProvenanceRefs(provenance: AiResultProvenance): number {
  return PROVENANCE_ARRAY_KEYS.reduce(
    (total, key) => total + (provenance[key]?.length ?? 0),
    provenance.contextPackId ? 1 : 0,
  );
}

function toAiResultRecord(
  artifact: PersistedAiResultArtifactRecord,
): AiResultArtifactRecord {
  return {
    appliedAt: artifact.appliedAt,
    appliedTarget: artifact.appliedTarget,
    createdAt: artifact.createdAt,
    createdByUserId: artifact.createdByUserId,
    documentContent: artifact.documentContent
      ? normalizeDocumentBlockDocument(artifact.documentContent)
      : undefined,
    id: artifact.id,
    jobId: artifact.jobId,
    kind: artifact.kind,
    plainTextPreview: artifact.plainTextPreview,
    projectId: artifact.projectId,
    provenance: normalizeProvenance(artifact.provenance),
    scope: artifact.scope,
    status: artifact.status,
    summary: artifact.summary,
    title: artifact.title,
    updatedAt: artifact.updatedAt,
  };
}

function createFallbackDocumentContent(
  artifact: PersistedAiResultArtifactRecord,
): DocumentBlockDocument {
  const text = artifact.summary ?? artifact.plainTextPreview ?? artifact.title;

  if (!text) {
    return createEmptyDocumentBlockDocument();
  }

  return normalizeDocumentBlockDocument({
    blocks: [
      {
        text,
        type: 'paragraph',
      },
    ],
    schemaVersion: 1,
  });
}

function getArtifactDocumentContent(
  artifact: PersistedAiResultArtifactRecord,
): DocumentBlockDocument {
  return artifact.documentContent
    ? normalizeDocumentBlockDocument(artifact.documentContent)
    : createFallbackDocumentContent(artifact);
}

function snapshotToDocumentContent(snapshot: {
  content: string;
  documentContent?: DocumentBlockDocument;
}): DocumentBlockDocument {
  return snapshot.documentContent
    ? normalizeDocumentBlockDocument(snapshot.documentContent)
    : legacyTextToDocumentBlockDocument(snapshot.content);
}

function applyInsertionToDocumentContent(input: {
  current: DocumentBlockDocument;
  insertion?: AiResultApplyInsertion;
  result: DocumentBlockDocument;
}): DocumentBlockDocument {
  const current = normalizeDocumentBlockDocument(input.current);
  const result = normalizeDocumentBlockDocument(input.result);
  const mode = input.insertion?.mode ?? 'append';
  const targetBlockId = input.insertion?.targetBlockId?.trim();

  if (!targetBlockId) {
    return mode === 'replace'
      ? result
      : normalizeDocumentBlockDocument({
          blocks: [...current.blocks, ...result.blocks],
          schemaVersion: 1,
        });
  }

  const targetIndex = current.blocks.findIndex((block) => block.id === targetBlockId);

  if (targetIndex < 0) {
    throw new Error(`Target document block ${targetBlockId} does not exist.`);
  }

  const nextBlocks = [...current.blocks];

  if (mode === 'replace') {
    nextBlocks.splice(targetIndex, 1, ...result.blocks);
  } else {
    nextBlocks.splice(targetIndex + 1, 0, ...result.blocks);
  }

  return normalizeDocumentBlockDocument({
    blocks: nextBlocks,
    schemaVersion: 1,
  });
}

async function requireAuthorizedArtifact(
  store: AiResultsStore,
  resultId: string,
  actorUserId: string,
): Promise<PersistedAiResultArtifactRecord> {
  const artifact = await store.aiResultRepository.getArtifact(resultId);

  if (!artifact) {
    throw new Error(`AI result artifact ${resultId} does not exist.`);
  }

  await findAuthorizedJob(
    store,
    {
      actorUserId,
      jobId: artifact.jobId,
    },
  );

  return artifact;
}

function buildAuditMetadata(input: {
  artifact: PersistedAiResultArtifactRecord;
  targetId?: string;
  targetType?: string;
  versionId?: string;
  versionNumber?: number;
}): Record<string, unknown> {
  return {
    resultArtifactId: input.artifact.id,
    resultKind: input.artifact.kind,
    sourceCount: countProvenanceRefs(input.artifact.provenance),
    targetId: input.targetId,
    targetType: input.targetType,
    versionId: input.versionId,
    versionNumber: input.versionNumber,
  };
}

function pruneUndefinedMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => typeof value !== 'undefined'),
  );
}

async function recordCreatedAudit(
  store: AiResultsStore,
  artifact: PersistedAiResultArtifactRecord,
): Promise<void> {
  const metadata = pruneUndefinedMetadata(buildAuditMetadata({ artifact }));
  const job = await store.jobRepository.getJob({ jobId: artifact.jobId });

  if (!job) {
    throw new Error(`Job ${artifact.jobId} does not exist.`);
  }

  await store.auditService.createRecord({
    action: 'ai_result.created',
    actorUserId: artifact.createdByUserId,
    detail: `Created AI result artifact ${artifact.id} from governed job ${artifact.jobId}.`,
    jobId: artifact.jobId,
    metadata,
    object: { id: artifact.id, type: 'ai_result' },
    projectId: artifact.projectId,
    scope: artifact.scope,
    spaceId: job.spaceId,
  });
}

async function recordAppliedAudit(
  store: AiResultsStore,
  input: {
    actorUserId: string;
    artifact: PersistedAiResultArtifactRecord;
    detail: string;
    targetId: string;
    targetProjectId?: string;
    targetType: string;
    versionId: string;
    versionNumber: number;
  },
): Promise<void> {
  const job = await store.jobRepository.getJob({ jobId: input.artifact.jobId });

  if (!job) {
    throw new Error(`Job ${input.artifact.jobId} does not exist.`);
  }

  await store.auditService.createRecord({
    action: `ai_result.applied.${input.targetType}`,
    actorUserId: input.actorUserId,
    detail: input.detail,
    jobId: input.artifact.jobId,
    metadata: pruneUndefinedMetadata(
      buildAuditMetadata({
        artifact: input.artifact,
        targetId: input.targetId,
        targetType: input.targetType,
        versionId: input.versionId,
        versionNumber: input.versionNumber,
      }),
    ),
    object: { id: input.artifact.id, type: 'ai_result' },
    projectId: input.targetProjectId ?? input.artifact.projectId,
    scope: input.artifact.scope,
    spaceId: job.spaceId,
  });
}

export function createAiResultsService(store: AiResultsStore): AiResultsService {
  return {
    async applyToNotebook(
      resultId: string,
      input: ApplyAiResultToNotebookRequest,
      actorUserId: string,
    ): Promise<ApplyAiResultToNotebookResponse> {
      const artifact = await requireAuthorizedArtifact(store, resultId, actorUserId);

      if (artifact.status === 'applied') {
        throw new Error(`AI result artifact ${resultId} is already applied.`);
      }

      if (artifact.status !== 'draft') {
        throw new Error(`AI result artifact ${resultId} is not available for application.`);
      }

      const documentContent = getArtifactDocumentContent(artifact);
      const currentSnapshot = await store.notebookService.getLatestSnapshot(
        { documentId: input.notebookDocumentId },
        actorUserId,
      );
      const nextDocumentContent = applyInsertionToDocumentContent({
        current: snapshotToDocumentContent(currentSnapshot),
        insertion: input.insertion,
        result: documentContent,
      });
      const snapshot = await store.notebookService.saveDocument(
        {
          citations: currentSnapshot.citations,
          content: documentBlockDocumentToLegacyText(nextDocumentContent),
          documentContent: nextDocumentContent,
          documentId: input.notebookDocumentId,
        },
        actorUserId,
      );
      const appliedTarget = {
        notebookDocumentId: input.notebookDocumentId,
        notebookVersionId: snapshot.versionId,
        notebookVersionNumber: snapshot.versionNumber,
        type: 'notebookDocument' as const,
      };
      const applied = await store.aiResultRepository.markArtifactApplied({
        appliedTarget,
        resultId,
      });

      await recordAppliedAudit(store, {
        actorUserId,
        artifact: applied,
        detail: `Applied AI result artifact ${applied.id} to Notebook document ${input.notebookDocumentId}.`,
        targetId: input.notebookDocumentId,
        targetType: 'notebookDocument',
        versionId: snapshot.versionId,
        versionNumber: snapshot.versionNumber,
      });

      return {
        appliedTarget,
        contract: aiResultsContract,
        result: toAiResultRecord(applied),
        snapshot,
      };
    },
    async applyToProjectDoc(
      resultId: string,
      input: ApplyAiResultToProjectDocRequest,
      actorUserId: string,
    ): Promise<ApplyAiResultToProjectDocResponse> {
      const artifact = await requireAuthorizedArtifact(store, resultId, actorUserId);

      if (artifact.status === 'applied') {
        throw new Error(`AI result artifact ${resultId} is already applied.`);
      }

      if (artifact.status !== 'draft') {
        throw new Error(`AI result artifact ${resultId} is not available for application.`);
      }

      const targetDocument = await store.projectDocRepository.findDocument(input.projectDocId);

      if (!targetDocument) {
        throw new Error(`Project Doc ${input.projectDocId} does not exist.`);
      }

      if (
        artifact.scope.type === 'project' &&
        targetDocument.projectId !== artifact.scope.id
      ) {
        throw new Error('Access denied for applying this AI result to a different project document.');
      }

      const documentContent = getArtifactDocumentContent(artifact);
      const currentSnapshot = await store.projectDocsService.getDocument(
        { documentId: input.projectDocId },
        actorUserId,
      );
      const nextDocumentContent = applyInsertionToDocumentContent({
        current: snapshotToDocumentContent(currentSnapshot),
        insertion: input.insertion,
        result: documentContent,
      });
      const snapshot = await store.projectDocsService.saveDocument(
        {
          citations: currentSnapshot.citations,
          content: documentBlockDocumentToLegacyText(nextDocumentContent),
          documentContent: nextDocumentContent,
          documentId: input.projectDocId,
        },
        actorUserId,
      );
      const appliedTarget = {
        projectDocId: input.projectDocId,
        projectDocVersionId: snapshot.versionId,
        projectDocVersionNumber: snapshot.versionNumber,
        projectId: snapshot.document.projectId,
        type: 'projectDoc' as const,
      };
      const applied = await store.aiResultRepository.markArtifactApplied({
        appliedTarget,
        resultId,
      });

      await recordAppliedAudit(store, {
        actorUserId,
        artifact: applied,
        detail: `Applied AI result artifact ${applied.id} to Project Doc ${input.projectDocId}.`,
        targetId: input.projectDocId,
        targetProjectId: snapshot.document.projectId,
        targetType: 'projectDoc',
        versionId: snapshot.versionId,
        versionNumber: snapshot.versionNumber,
      });

      return {
        appliedTarget,
        contract: aiResultsContract,
        result: toAiResultRecord(applied),
        snapshot,
      };
    },
    async createFromJob(
      input: CreateAiResultArtifactRequest,
      actorUserId: string,
    ): Promise<AiResultArtifactRecord> {
      const job = await findAuthorizedJob(
        store,
        {
          actorUserId,
          jobId: input.jobId,
        },
        'run',
      );

      if (job.status !== 'succeeded') {
        throw new Error('AI result artifacts may only be created from completed jobs.');
      }

      const documentContent = input.documentContent
        ? normalizeDocumentBlockDocument(input.documentContent)
        : undefined;
      const plainTextPreview = normalizeText(
        input.plainTextPreview ?? (documentContent ? documentBlockDocumentToLegacyText(documentContent) : undefined),
        1000,
      );
      const artifact = await store.aiResultRepository.createArtifact({
        createdByUserId: actorUserId,
        documentContent,
        id: store.nextId('ai-result'),
        jobId: job.id,
        kind: normalizeText(input.kind, 120) ?? job.kind,
        plainTextPreview,
        projectId: job.scope.type === 'project' ? job.scope.id : undefined,
        provenance: mergeProvenance(
          deriveProvenanceFromJobPayload(job.payload),
          normalizeProvenance(input.provenance),
        ),
        scope: job.scope,
        summary: normalizeText(input.summary, 1000),
        title: normalizeText(input.title, 180),
      });

      await recordCreatedAudit(store, artifact);

      return toAiResultRecord(artifact);
    },
    async getArtifact(
      resultId: string,
      actorUserId: string,
    ): Promise<GetAiResultResponse> {
      return {
        contract: aiResultsContract,
        result: toAiResultRecord(
          await requireAuthorizedArtifact(store, resultId, actorUserId),
        ),
      };
    },
    async listArtifacts(
      input: ListAiResultArtifactsRequest,
    ): Promise<ListAiResultArtifactsResponse> {
      const listingContext = await resolveAuthorizedListJobScopeContext(store, input);
      const artifacts = await store.aiResultRepository.listArtifactsForScope(
        listingContext.scope,
      );

      return {
        contract: aiResultsContract,
        results: artifacts.map(toAiResultRecord),
        scope: listingContext.scope,
      };
    },
  };
}
