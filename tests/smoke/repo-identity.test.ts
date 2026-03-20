import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('repository identity scaffold', () => {
  it('will expose the expected top-level files', () => {
    expect(existsSync('package.json')).toBe(true);
    expect(existsSync('tsconfig.json')).toBe(true);
    expect(existsSync('vitest.config.ts')).toBe(true);

    const tsconfig = readFileSync('tsconfig.json', 'utf8');

    expect(tsconfig).toContain('src/**/*.ts');
    expect(tsconfig).toContain('src/**/*.tsx');
  });

  it('includes bilingual readmes and a license', () => {
    expect(existsSync('README.md')).toBe(true);
    expect(existsSync('README_CN.md')).toBe(true);
    expect(existsSync('LICENSE')).toBe(true);
    expect(readFileSync('README.md', 'utf8')).toContain('Jixia');
    expect(readFileSync('README_CN.md', 'utf8')).toContain('稷下');
  });

  it('includes the first CI workflow and source directories', () => {
    expect(existsSync('src/.gitkeep')).toBe(true);
    expect(existsSync('tests/.gitkeep')).toBe(true);
    expect(existsSync('docs/adr/.gitkeep')).toBe(true);
    expect(existsSync('.github/workflows/ci.yml')).toBe(true);

    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

    expect(workflow).toMatch(/lint|test|typecheck/);
  });
});
