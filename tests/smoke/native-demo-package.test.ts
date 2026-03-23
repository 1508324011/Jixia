import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const RUNBOOK_PATH = 'docs/runbooks/native-demo-showcase.md';

function read(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('native demo package contract', () => {
  it('declares a source-independent native package path', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>;
    };
    const runbook = read(RUNBOOK_PATH);

    expect(packageJson.scripts?.['package:native-demo']).toBeTruthy();
    expect(existsSync('scripts/package-native-demo.mjs')).toBe(true);
    expect(runbook).toContain('npm run package:native-demo');
    expect(runbook).toContain('.native-demo-package/native-demo');
    expect(runbook).toContain('run-native-demo.sh');
  });
});
