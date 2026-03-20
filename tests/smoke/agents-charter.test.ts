import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('agents charter', () => {
  it('defines hard engineering constraints', () => {
    const content = readFileSync('AGENTS.md', 'utf8');

    expect(content).toContain('Jixia');
    expect(content).toContain('no secrets');
    expect(content).toContain('verification');
    expect(content).toContain('pull request');
    expect(content).toContain('server-first');
  });
});
