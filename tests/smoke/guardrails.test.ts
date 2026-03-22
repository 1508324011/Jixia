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
    expect(envExample).toContain('JIXIA_STORAGE_ROOT=');
    expect(envExample).toContain('JIXIA_DATABASE_URL=');
    expect(envExample).toContain('JIXIA_HOST=');
    expect(envExample).toContain('JIXIA_PORT=');
    expect(envExample).not.toContain('YOUR_');
    expect(envExample).not.toMatch(/sk-[A-Za-z0-9]/);
    expect(envExample).not.toMatch(/gh[pours]_[A-Za-z0-9]/);
    expect(envExample).not.toMatch(/AKIA[0-9A-Z]{16}/);
    expect(readFileSync('.editorconfig', 'utf8')).toContain('root = true');
    expect(readFileSync('.gitattributes', 'utf8')).toContain('* text=auto');
  });
});
