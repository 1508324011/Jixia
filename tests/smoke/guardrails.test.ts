import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('repository guardrails', () => {
  it('includes secret-safe repository guardrails', () => {
    expect(readFileSync('.gitignore', 'utf8')).toContain('.env');
    expect(readFileSync('.env.example', 'utf8')).toContain('YOUR_');
    expect(readFileSync('.editorconfig', 'utf8')).toContain('root = true');
    expect(readFileSync('.gitattributes', 'utf8')).toContain('* text=auto');
  });
});
