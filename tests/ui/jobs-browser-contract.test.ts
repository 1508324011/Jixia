import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('jobs browser contract static guard', () => {
  it('rejects first-space authority and demo bootstrap behavior in the jobs surface', () => {
    const presenter = readFileSync(
      join(process.cwd(), 'src/web/presenters/jobs-presenter.ts'),
      'utf8',
    );
    const page = readFileSync(
      join(process.cwd(), 'src/web/pages/jobs-page.tsx'),
      'utf8',
    );

    expect(presenter).not.toContain('spaces[0]');
    expect(presenter).not.toContain('local-demo-credential-placeholder');
    expect(presenter).not.toContain('runSampleJob');
    expect(page).not.toContain('Create and run sample job');
  });
});
