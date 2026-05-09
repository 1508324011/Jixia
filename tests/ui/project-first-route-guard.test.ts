import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const bannedTokens = [
  'project-1',
  'personal-space-user-alice',
  'shared-space',
  'doc-1',
  'entry-1',
];

const productionFiles = [
  'src/web/pages/project-page.tsx',
  'src/web/pages/reader-page.tsx',
  'src/web/pages/writing-page.tsx',
  'src/web/pages/library-page.tsx',
  'src/web/components/project-writer-list.tsx',
  'src/web/components/app-shell.tsx',
  'src/web/components/workbench-layout.tsx',
  'src/web/lib/recent-opened-store.ts',
];

describe('project-first route static guard', () => {
  it('rejects hardcoded demo project, document, entry, and space defaults in production web files', () => {
    for (const relativePath of productionFiles) {
      const fileText = readFileSync(join(process.cwd(), relativePath), 'utf8');

      for (const bannedToken of bannedTokens) {
        expect(fileText).not.toContain(bannedToken);
      }
    }
  });
});
