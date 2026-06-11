import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * These allowlists are an executable inventory and review control point for the
 * compatibility surfaces Jixia currently retains. They are not a promise that
 * the listed compatibility routes will be retained forever; any addition or
 * retirement should go through an explicit product/spec review instead of
 * silently expanding legacy Space or browser-supplied actor authority surfaces.
 */
const browserCompatibilityRouteAllowlist = [
  '/spaces',
  '/spaces/:spaceId/projects/:projectId/library',
  '/spaces/:spaceId/projects/:projectId/library/:entryId/reader',
  '/spaces/:spaceId/projects/:projectId/writing/:docId',
];

const spaceGovernanceApiAllowlist = [
  '/api/spaces',
  '/api/spaces/:spaceId/memberships',
];

const writingCompatibilityApiAllowlist = [
  '/api/writing/:spaceId/projects/:projectId/document',
  '/api/projects/:projectId/writing/document',
  '/api/projects/:projectId/writing-document',
];

const legacyInternalProjectDocIngestionAllowlist = [
  '/api/project-docs/:documentId/notebook-adoptions',
];

const routeDefinitionFiles = [
  'src/web/router.tsx',
  'src/server/http-server.ts',
  'src/server/http-api.ts',
];

const productionBrowserRoots = [
  'src/web/pages',
  'src/web/components',
  'src/web/presenters',
  'src/web/lib',
];

const productionBrowserScanExclusions = new Set([
  // Compatibility/test-only facade already quarantined by route guardrails.
  'src/web/lib/demo-api.ts',
]);

const expectedBrowserActorAuthorityScanCoverage = [
  'src/web/lib/http-client.ts',
  'src/web/lib/session-auth.tsx',
  'src/web/pages/home-page.tsx',
  'src/web/pages/search-page.tsx',
  'src/web/pages/writing-page.tsx',
  'src/web/presenters/jobs-presenter.ts',
  'src/web/presenters/project-doc-presenter.ts',
  'src/web/presenters/search-presenter.ts',
];

const browserActorAuthorityFields = [
  'actorUserId',
  'requestedByUserId',
  'authorUserId',
  'startedByUserId',
  'actorSpaceId',
];

type ApiRouteBucket =
  | 'spaceGovernanceApis'
  | 'writingCompatibilityApis'
  | 'legacyInternalProjectDocIngestionApis';

interface DiscoveredRoute {
  raw: string;
  route: string;
  source: string;
}

interface ApiRouteInventory {
  legacyInternalProjectDocIngestionApis: DiscoveredRoute[];
  spaceGovernanceApis: DiscoveredRoute[];
  unclassifiedCompatibilityCandidates: string[];
  writingCompatibilityApis: DiscoveredRoute[];
}

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

function sortedUnique(routes: DiscoveredRoute[]): string[] {
  return [...new Set(routes.map((route) => route.route))].sort();
}

function collectBrowserCompatibilityRoutes(): string[] {
  const routerText = readFileSync(
    join(process.cwd(), 'src/web/router.tsx'),
    'utf8',
  );
  const routePaths = [...routerText.matchAll(/\bpath\s*=\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((routePath) => routePath.startsWith('/spaces'));

  return [...new Set(routePaths)].sort();
}

function collectExactApiRouteLiterals(
  text: string,
  source: string,
): DiscoveredRoute[] {
  return [...text.matchAll(/['"`](\/api\/[^'"`]+)['"`]/g)]
    .map((match) => ({
      raw: match[0],
      route: normalizeTemplateRouteLiteral(match[1]),
      source,
    }));
}

function normalizeTemplateRouteLiteral(route: string): string {
  return route.replaceAll('${spaceId}', ':spaceId')
    .replaceAll('${projectId}', ':projectId')
    .replaceAll('${documentId}', ':documentId')
    .replaceAll('${entryId}', ':entryId');
}

function collectApiRegexLiterals(text: string): string[] {
  const regexLiterals: string[] = [];
  const startNeedle = '/^\\/api';
  let cursor = 0;

  while (cursor < text.length) {
    const startIndex = text.indexOf(startNeedle, cursor);

    if (startIndex === -1) {
      break;
    }

    let isEscaped = false;
    let isInCharacterClass = false;

    for (let index = startIndex + 1; index < text.length; index += 1) {
      const character = text[index];

      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === '\\') {
        isEscaped = true;
        continue;
      }

      if (character === '[') {
        isInCharacterClass = true;
        continue;
      }

      if (character === ']') {
        isInCharacterClass = false;
        continue;
      }

      if (character === '/' && !isInCharacterClass) {
        regexLiterals.push(text.slice(startIndex, index + 1));
        cursor = index + 1;
        break;
      }
    }

    if (cursor <= startIndex) {
      cursor = startIndex + startNeedle.length;
    }
  }

  return regexLiterals;
}

const dynamicRegexSegment = String.raw`(?:\(\[\^\/\]\+\)|\[\^\/\]\+)`;

const knownRegexRouteNormalizers: Array<{
  pattern: RegExp;
  route: string;
}> = [
  {
    pattern: new RegExp(`^/api/spaces/${dynamicRegexSegment}/memberships$`),
    route: '/api/spaces/:spaceId/memberships',
  },
  {
    pattern: new RegExp(
      `^/api/writing/${dynamicRegexSegment}/projects/${dynamicRegexSegment}/document$`,
    ),
    route: '/api/writing/:spaceId/projects/:projectId/document',
  },
  {
    pattern: new RegExp(`^/api/projects/${dynamicRegexSegment}/writing/document$`),
    route: '/api/projects/:projectId/writing/document',
  },
  {
    pattern: new RegExp(`^/api/projects/${dynamicRegexSegment}/writing-document$`),
    route: '/api/projects/:projectId/writing-document',
  },
  {
    pattern: new RegExp(
      `^/api/project-docs/${dynamicRegexSegment}/notebook-adoptions$`,
    ),
    route: '/api/project-docs/:documentId/notebook-adoptions',
  },
];

function stripRegexDelimiters(regexLiteral: string): string {
  const terminatorIndex = regexLiteral.lastIndexOf('/');
  const body = regexLiteral.slice(1, terminatorIndex);

  return body
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replaceAll('\\/', '/');
}

function normalizeApiRegexRouteLiteral(regexLiteral: string): string | null {
  const routeBody = stripRegexDelimiters(regexLiteral);
  const knownRoute = knownRegexRouteNormalizers.find(({ pattern }) =>
    pattern.test(routeBody),
  );

  return knownRoute?.route ?? null;
}

function isCompatibilityApiCandidate(route: string): boolean {
  return route.startsWith('/api/spaces') ||
    route.startsWith('/api/writing') ||
    (route.startsWith('/api/projects') && route.includes('/writing')) ||
    (route.startsWith('/api/project-docs') &&
      route.endsWith('/notebook-adoptions'));
}

function classifyApiRoute(route: string): ApiRouteBucket | null {
  if (route.startsWith('/api/spaces')) {
    return 'spaceGovernanceApis';
  }

  if (
    route.startsWith('/api/writing') ||
    (route.startsWith('/api/projects') && route.includes('/writing'))
  ) {
    return 'writingCompatibilityApis';
  }

  if (
    route.startsWith('/api/project-docs') &&
    route.endsWith('/notebook-adoptions')
  ) {
    return 'legacyInternalProjectDocIngestionApis';
  }

  return null;
}

function collectApiRouteInventory(): ApiRouteInventory {
  const inventory: ApiRouteInventory = {
    legacyInternalProjectDocIngestionApis: [],
    spaceGovernanceApis: [],
    unclassifiedCompatibilityCandidates: [],
    writingCompatibilityApis: [],
  };

  for (const source of routeDefinitionFiles) {
    const sourceText = readFileSync(join(process.cwd(), source), 'utf8');
    const exactRoutes = collectExactApiRouteLiterals(sourceText, source);
    const regexRoutes = collectApiRegexLiterals(sourceText).map((regexLiteral) => {
      const normalizedRoute = normalizeApiRegexRouteLiteral(regexLiteral);

      return {
        raw: regexLiteral,
        route: normalizedRoute ?? stripRegexDelimiters(regexLiteral),
        source,
      };
    });

    for (const candidate of [...exactRoutes, ...regexRoutes]) {
      if (!isCompatibilityApiCandidate(candidate.route)) {
        continue;
      }

      const bucket = classifyApiRoute(candidate.route);

      if (!bucket) {
        inventory.unclassifiedCompatibilityCandidates.push(
          `${candidate.source}: ${candidate.raw}`,
        );
        continue;
      }

      inventory[bucket].push(candidate);
    }
  }

  return inventory;
}

function lineNumberForIndex(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function findBrowserActorAuthorityViolations(relativePath: string): string[] {
  const sourceText = readFileSync(join(process.cwd(), relativePath), 'utf8');
  const violations = new Set<string>();

  for (const field of browserActorAuthorityFields) {
    const patterns: Array<{ label: string; pattern: RegExp }> = [
      {
        label: 'payload/query property definition',
        pattern: new RegExp(
          "(?:\\b|['\"`])" + field + "(?:['\"`])?\\s*[:?]",
          'g',
        ),
      },
      {
        label: 'URL query parameter',
        pattern: new RegExp(`[?&]${field}=`, 'g'),
      },
      {
        label: 'URLSearchParams mutation',
        pattern: new RegExp(
          "searchParams\\.(?:append|set)\\(['\"`]" + field + "['\"`]",
          'g',
        ),
      },
      {
        label: 'JSON.stringify payload shorthand',
        pattern: new RegExp(
          "JSON\\.stringify\\(\\s*\\{[^}]*\\b" + field + "\\b\\s*(?:[,}])",
          'g',
        ),
      },
      {
        label: 'URLSearchParams object shorthand',
        pattern: new RegExp(
          "new\\s+URLSearchParams\\(\\s*\\{[^}]*\\b" + field + "\\b\\s*(?:[,}])",
          'g',
        ),
      },
    ];

    for (const { label, pattern } of patterns) {
      for (const match of sourceText.matchAll(pattern)) {
        violations.add(
          `${relativePath}:${lineNumberForIndex(sourceText, match.index ?? 0)} ` +
            `defines browser-sent ${field} as ${label}`,
        );
      }
    }
  }

  return [...violations].sort();
}

const productionBrowserFiles = productionBrowserRoots
  .flatMap((root) => collectSourceFiles(root))
  .filter((relativePath) => !productionBrowserScanExclusions.has(relativePath))
  .sort();

describe('compatibility surface allowlist guardrail', () => {
  it('keeps retained browser /spaces compatibility deep links explicitly inventoried', () => {
    expect(collectBrowserCompatibilityRoutes()).toEqual(
      browserCompatibilityRouteAllowlist,
    );
  });

  it('keeps retained server compatibility and Space governance APIs explicitly inventoried', () => {
    const inventory = collectApiRouteInventory();

    expect(inventory.unclassifiedCompatibilityCandidates).toEqual([]);
    expect(sortedUnique(inventory.spaceGovernanceApis)).toEqual(
      [...spaceGovernanceApiAllowlist].sort(),
    );
    expect(sortedUnique(inventory.writingCompatibilityApis)).toEqual(
      [...writingCompatibilityApiAllowlist].sort(),
    );
    expect(sortedUnique(inventory.legacyInternalProjectDocIngestionApis)).toEqual(
      [...legacyInternalProjectDocIngestionAllowlist].sort(),
    );
  });

  it('rejects browser protected-call payload or query actor-authority fields', () => {
    expect(productionBrowserFiles).toEqual(
      expect.arrayContaining(expectedBrowserActorAuthorityScanCoverage),
    );
    expect(productionBrowserFiles).not.toContain('src/web/lib/demo-api.ts');

    const violations = productionBrowserFiles.flatMap((relativePath) =>
      findBrowserActorAuthorityViolations(relativePath),
    );

    expect(violations).toEqual([]);
  });
});
