import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('community health files', () => {
  it('includes contribution, conduct, and security docs', () => {
    expect(existsSync('CONTRIBUTING.md')).toBe(true);
    expect(existsSync('CODE_OF_CONDUCT.md')).toBe(true);
    expect(existsSync('SECURITY.md')).toBe(true);
    expect(readFileSync('SECURITY.md', 'utf8')).toContain('vulnerability');
  });

  it('includes GitHub issue and PR templates', () => {
    expect(existsSync('.github/ISSUE_TEMPLATE/bug_report.md')).toBe(true);
    expect(existsSync('.github/ISSUE_TEMPLATE/feature_request.md')).toBe(true);
    expect(existsSync('.github/ISSUE_TEMPLATE/config.yml')).toBe(true);
    expect(existsSync('.github/pull_request_template.md')).toBe(true);
    expect(existsSync('docs/plans/2026-03-20-jixia-github-settings.md')).toBe(true);
  });

  it('records post-publish GitHub settings with a concrete repository owner', () => {
    const settings = readFileSync(
      'docs/plans/2026-03-20-jixia-github-settings.md',
      'utf8'
    );
    const issueTemplateConfig = readFileSync(
      '.github/ISSUE_TEMPLATE/config.yml',
      'utf8'
    );

    expect(settings).toContain('Repository Protection');
    expect(settings).toContain('1508324011/Jixia');
    expect(settings).not.toContain('Replace `OWNER`');
    expect(settings).toContain('Local Git Bootstrap Checkpoints');
    expect(issueTemplateConfig).toContain(
      'https://github.com/1508324011/Jixia/security/advisories/new'
    );
    expect(issueTemplateConfig).not.toContain('OWNER');
  });
});
