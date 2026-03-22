import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { JixiaAppState } from '../app';
import { createSecretBox } from '../security/secret-box';
import type { StoredCredential } from '../services/credentials.service';
import { resolveStorageRoot, type StorageRootEnv } from '../storage/storage-root';
import {
  applyNativeDemoFixture,
  createEmptyAppState,
  nativeDemoFixture,
} from './demo-fixture';

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
    docVersions: parsed.docVersions ?? initialState.docVersions,
    insights: parsed.insights ?? initialState.insights,
    jobEvents: parsed.jobEvents ?? initialState.jobEvents,
    jobs: parsed.jobs ?? initialState.jobs,
    libraryEntries: parsed.libraryEntries ?? initialState.libraryEntries,
    memberships: parsed.memberships ?? initialState.memberships,
    nextSequence: parsed.nextSequence ?? initialState.nextSequence,
    notes: parsed.notes ?? initialState.notes,
    paperAssets: parsed.paperAssets ?? initialState.paperAssets,
    spaces: parsed.spaces ?? initialState.spaces,
    writingDocs: parsed.writingDocs ?? initialState.writingDocs,
  };
}

function ensureDemoCredential(
  state: JixiaAppState,
  env: StorageRootEnv,
): boolean {
  const existingCredential = state.credentials.find(
    (credential) => credential.credentialRef === nativeDemoFixture.credentialRef,
  );

  if (existingCredential) {
    let changed = false;

    if (existingCredential.createdAt !== '2026-03-22T00:00:00.000Z') {
      existingCredential.createdAt = '2026-03-22T00:00:00.000Z';
      changed = true;
    }

    if (existingCredential.provider !== nativeDemoFixture.credentialProvider) {
      existingCredential.provider = nativeDemoFixture.credentialProvider;
      changed = true;
    }

    if (existingCredential.userId !== nativeDemoFixture.actorUserId) {
      existingCredential.userId = nativeDemoFixture.actorUserId;
      changed = true;
    }

    return changed;
  }

  const secretBox = createSecretBox(env);
  const credential: StoredCredential = {
    createdAt: '2026-03-22T00:00:00.000Z',
    credentialRef: nativeDemoFixture.credentialRef,
    ...secretBox.encrypt('demo-governed-summary-secret'),
    provider: nativeDemoFixture.credentialProvider,
    userId: nativeDemoFixture.actorUserId,
  };

  state.credentials.push(credential);

  return true;
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
  const fixtureChanged = applyNativeDemoFixture(state);
  const credentialChanged = ensureDemoCredential(state, env);
  const changed = fixtureChanged || credentialChanged;

  if (!existsSync(statePath) || changed) {
    mkdirSync(resolveStorageRoot(env), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  return state;
}
