import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { JixiaAppState } from '../app';
import { resolveStorageRoot, type StorageRootEnv } from '../storage/storage-root';
import { applyNativeDemoFixture, createEmptyAppState } from './demo-fixture';

const APP_STATE_FILE = 'server-state.json';

function resolveAppStatePath(env: StorageRootEnv = process.env): string {
  return join(resolveStorageRoot(env), APP_STATE_FILE);
}

function normalizeState(parsed: Partial<JixiaAppState>): JixiaAppState {
  const initialState = createEmptyAppState();

  return {
    auditLogs: parsed.auditLogs ?? initialState.auditLogs,
    citationLinks: parsed.citationLinks ?? initialState.citationLinks,
    conversations: parsed.conversations ?? initialState.conversations,
    credentials: parsed.credentials ?? initialState.credentials,
    discoveryCandidates: parsed.discoveryCandidates ?? initialState.discoveryCandidates,
    docVersions: parsed.docVersions ?? initialState.docVersions,
    evidenceCards: parsed.evidenceCards ?? initialState.evidenceCards,
    importMappings: parsed.importMappings ?? initialState.importMappings,
    insights: parsed.insights ?? initialState.insights,
    jobEvents: parsed.jobEvents ?? initialState.jobEvents,
    jobs: parsed.jobs ?? initialState.jobs,
    libraryEntries: parsed.libraryEntries ?? initialState.libraryEntries,
    memberships: parsed.memberships ?? initialState.memberships,
    nextSequence: parsed.nextSequence ?? initialState.nextSequence,
    notebookNotes: parsed.notebookNotes ?? initialState.notebookNotes,
    notebookQuestions: parsed.notebookQuestions ?? initialState.notebookQuestions,
    notebookRecords: parsed.notebookRecords ?? initialState.notebookRecords,
    notes: parsed.notes ?? initialState.notes,
    paperAssets: parsed.paperAssets ?? initialState.paperAssets,
    projectDocumentPresences:
      parsed.projectDocumentPresences ?? initialState.projectDocumentPresences,
    projectReferences: parsed.projectReferences ?? initialState.projectReferences,
    spaces: parsed.spaces ?? initialState.spaces,
    workbenchSettings: parsed.workbenchSettings ?? initialState.workbenchSettings,
    writingDocs: parsed.writingDocs ?? initialState.writingDocs,
  };
}

export function bootstrapNativeDemoState(
  env: StorageRootEnv = process.env,
): JixiaAppState {
  const statePath = resolveAppStatePath(env);
  const initialState = createEmptyAppState();
  const parsedState = existsSync(statePath)
    ? (JSON.parse(readFileSync(statePath, 'utf8')) as Partial<JixiaAppState>)
    : initialState;
  const state = normalizeState(parsedState);
  const changed = applyNativeDemoFixture(state);

  if (!existsSync(statePath) || changed) {
    mkdirSync(resolveStorageRoot(env), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  return state;
}
