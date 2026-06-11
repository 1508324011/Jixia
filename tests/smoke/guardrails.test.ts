import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('repository guardrails', () => {
  it('includes secret-safe repository guardrails', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');
    const envExample = readFileSync('.env.example', 'utf8');

    expect(gitignore).toContain('.env');
    expect(gitignore).toContain('*.env');
    expect(gitignore).toContain('*api*key*');
    expect(gitignore).toContain('*apikey*');
    expect(gitignore).toContain('*.pem');
    expect(gitignore).toContain('*.key');
    expect(gitignore).toContain('.claude/');
    expect(gitignore).toContain('.cursor/');
    expect(gitignore).toContain('.trellis/');
    expect(envExample).toContain('YOUR_');
    expect(readFileSync('.editorconfig', 'utf8')).toContain('root = true');
    expect(readFileSync('.gitattributes', 'utf8')).toContain('* text=auto');
  });

  it('keeps the operator env example placeholder-only and recovery-safe', () => {
    const envExample = readFileSync('.env.example', 'utf8');
    const assignments = envExample
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='));

    expect(assignments).toEqual([
      'JIXIA_STORAGE_ROOT=YOUR_STORAGE_ROOT',
      'JIXIA_DATABASE_URL=YOUR_DATABASE_URL',
      'JIXIA_HOST=YOUR_SERVER_HOST',
      'JIXIA_PORT=YOUR_SERVER_PORT',
    ]);
    for (const assignment of assignments) {
      expect(assignment.split('=')[1]).toMatch(/^YOUR_/);
    }

    expect(envExample).toContain('JIXIA_STORAGE_ROOT/credentials.key');
    expect(envExample).toContain('encrypted credentials need the same DB plus this key');
    expect(envExample).toContain('fail closed');
    expect(envExample).toContain('GET|HEAD /api/library/:entryId/file');
    expect(envExample).not.toMatch(/sk-[A-Za-z0-9]/);
    expect(envExample).not.toMatch(/password\s*=/i);
    expect(envExample).not.toMatch(/token\s*=/i);
    expect(envExample).not.toMatch(/api[_-]?key\s*=/i);
  });
});
