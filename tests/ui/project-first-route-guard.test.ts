import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getRecentOpenedItems } from '../../src/web/lib/recent-opened-store';

const bannedTokens = [
  'project-1',
  'personal-space-user-alice',
  'shared-space',
  'doc-1',
  'entry-1',
];

const bannedProductionAffordances = [
  'Add Bob as viewer',
  'addSampleProjectMember',
  'defaultProjectMemberUserId',
  'user-bob',
  'Create sample credential',
  'Creating credential…',
  'local-settings-credential-placeholder',
  '10.1000/jixia-demo',
  'Connector staging',
  'Loading state placeholder',
  'Empty shelf placeholder',
];

const bannedDemoApiUsages = [
  'createDemoApi',
  '../lib/demo-api',
  './demo-api',
  'demo-api',
];

const productionWebRoots = [
  'src/web/pages',
  'src/web/components',
  'src/web/presenters',
  'src/web/lib',
];

const productionScanExclusions = new Set([
  // Compatibility/test-only facade. Authenticated production surfaces must not
  // import or call it, but the wrapper itself is allowed to define the symbol.
  'src/web/lib/demo-api.ts',
]);

const expectedProductionCoverage = [
  'src/web/pages/ai-workspace-page.tsx',
  'src/web/pages/home-page.tsx',
  'src/web/pages/library-page.tsx',
  'src/web/pages/notebook-page.tsx',
  'src/web/pages/project-page.tsx',
  'src/web/pages/projects-page.tsx',
  'src/web/pages/reader-page.tsx',
  'src/web/pages/search-page.tsx',
  'src/web/pages/settings-page.tsx',
  'src/web/pages/today-page.tsx',
  'src/web/pages/writing-page.tsx',
  'src/web/components/app-shell.tsx',
  'src/web/components/recent-opened-panel.tsx',
  'src/web/components/workbench-layout.tsx',
  'src/web/lib/http-client.ts',
  'src/web/lib/recent-opened-store.ts',
  'src/web/lib/shell-project-context.tsx',
  'src/web/lib/workbench-navigation.ts',
  'src/web/presenters/library-presenter.ts',
  'src/web/presenters/project-workspace-presenter.ts',
  'src/web/presenters/projects-presenter.ts',
  'src/web/presenters/runtime-context.ts',
  'src/web/presenters/search-presenter.ts',
];

const recentOpenedStoreBannedTokens = [
  'localStorage',
  'sessionStorage',
  'window.location',
  'location.pathname',
  'location.search',
  'URLSearchParams',
  'matchPath',
  'useLocation',
  'useParams',
  'paper-',
  'project-',
  'document-',
  'doc-',
  'entry-',
];

function toProjectPath(pathname: string): string {
  return relative(process.cwd(), pathname).replaceAll('\\', '/');
}

function collectSourceFiles(root: string): string[] {
  return readdirSync(join(process.cwd(), root), { withFileTypes: true })
    .flatMap((entry) => {
      const childPath = join(root, entry.name);

      if (entry.isDirectory()) {
        return collectSourceFiles(childPath);
      }

      if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) {
        return [];
      }

      return [toProjectPath(join(process.cwd(), childPath))];
    });
}

const productionFiles = productionWebRoots
  .flatMap((root) => collectSourceFiles(root))
  .filter((relativePath) => !productionScanExclusions.has(relativePath))
  .sort();

describe('project-first route static guard', () => {
  it('scans authenticated pages, components, presenters, and libs broadly', () => {
    expect(productionFiles).toEqual(
      expect.arrayContaining(expectedProductionCoverage),
    );
    expect(productionFiles).not.toContain('src/web/lib/demo-api.ts');
  });

  it('rejects hardcoded demo project, document, entry, and space defaults in production web files', () => {
    for (const relativePath of productionFiles) {
      const fileText = readFileSync(join(process.cwd(), relativePath), 'utf8');

      for (const bannedToken of bannedTokens) {
        expect(fileText).not.toContain(bannedToken);
      }
    }
  });

  it('rejects compatibility demo-api imports and calls in authenticated production web files', () => {
    for (const relativePath of productionFiles) {
      const fileText = readFileSync(join(process.cwd(), relativePath), 'utf8');

      for (const bannedUsage of bannedDemoApiUsages) {
        expect(fileText).not.toContain(bannedUsage);
      }
    }
  });

  it('rejects demo credentials, demo import defaults, and shell placeholder copy in production files', () => {
    for (const relativePath of productionFiles) {
      const fileText = readFileSync(join(process.cwd(), relativePath), 'utf8');

      for (const bannedAffordance of bannedProductionAffordances) {
        expect(fileText).not.toContain(bannedAffordance);
      }
    }
  });

  it('keeps Recent Opened explicitly empty until server-derived continuation owns it', () => {
    const relativePath = 'src/web/lib/recent-opened-store.ts';
    const fileText = readFileSync(join(process.cwd(), relativePath), 'utf8');

    // Recent Opened is product data, not a browser-local source of authority.
    // It must remain truthfully empty until a later server-derived continuation
    // task introduces an authenticated read model for this panel.
    expect(getRecentOpenedItems()).toEqual([]);

    for (const bannedToken of recentOpenedStoreBannedTokens) {
      expect(fileText).not.toContain(bannedToken);
    }

    expect(fileText).not.toMatch(/return\s+\[\s*{/);
    expect(fileText).not.toMatch(/=\s*\[\s*{/);
    expect(fileText).not.toMatch(
      /\b(?:const|let|var)\s+\w*(?:recent|Recent)\w*\s*(?::[^=]+)?=\s*\[/,
    );
  });
});
