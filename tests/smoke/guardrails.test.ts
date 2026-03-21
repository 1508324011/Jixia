import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('repository guardrails', () => {
  it('includes secret-safe repository guardrails', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');

    expect(gitignore).toContain('.env');
    expect(gitignore).toContain('*.env');
    expect(gitignore).toContain('*api*key*');
    expect(gitignore).toContain('*apikey*');
    expect(gitignore).toContain('*.pem');
    expect(gitignore).toContain('*.key');
    expect(readFileSync('.env.example', 'utf8')).toContain('YOUR_');
    expect(readFileSync('.editorconfig', 'utf8')).toContain('root = true');
    expect(readFileSync('.gitattributes', 'utf8')).toContain('* text=auto');
  });
});
