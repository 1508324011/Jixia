import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = dirname(scriptPath);
const projectRoot = resolve(scriptDirectory, '..');
const outputRoot = resolve(projectRoot, '.native-demo-package', 'native-demo');

const requiredPaths = [
  'dist',
  'dist-server',
  '.env.example',
  'docs/runbooks/native-demo-showcase.md',
  'scripts/demo-reset.mjs',
];

for (const relativePath of requiredPaths) {
  if (!existsSync(resolve(projectRoot, relativePath))) {
    throw new Error(
      `Required build/package input is missing: ${relativePath}. Run npm run build first.`,
    );
  }
}

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(outputRoot, { recursive: true });

cpSync(resolve(projectRoot, 'dist'), resolve(outputRoot, 'dist'), { recursive: true });
cpSync(resolve(projectRoot, 'dist-server'), resolve(outputRoot, 'dist-server'), {
  recursive: true,
});
cpSync(resolve(projectRoot, '.env.example'), resolve(outputRoot, '.env.example'));
cpSync(resolve(projectRoot, 'scripts', 'demo-reset.mjs'), resolve(outputRoot, 'demo-reset.mjs'));
cpSync(resolve(projectRoot, 'docs', 'runbooks', 'native-demo-showcase.md'), resolve(outputRoot, 'RUNBOOK.md'));

writeFileSync(
  resolve(outputRoot, 'run-native-demo.sh'),
  [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'cd "$SCRIPT_DIR"',
    'if [ -f .env ]; then',
    '  set -a',
    '  . ./.env',
    '  set +a',
    'fi',
    'node dist-server/http-server.js',
    '',
  ].join('\n'),
  { mode: 0o755 },
);

writeFileSync(
  resolve(outputRoot, 'README.md'),
  [
    '# Jixia Native Demo Package',
    '',
    'This packaged bundle is generated from `demo-native-showcase` and is intended for',
    'operator-proof of the native single-tenant demo without requiring a source checkout.',
    '',
    '## Files',
    '',
    '- `dist/` — built browser assets',
    '- `dist-server/` — bundled Node server runtime',
    '- `.env.example` — demo runtime defaults',
    '- `demo-reset.mjs` — reset helper for storage/database paths',
    '- `run-native-demo.sh` — packaged startup entrypoint',
    '- `RUNBOOK.md` — canonical walkthrough and operator guidance',
    '',
    '## Quick start',
    '',
    '```bash',
    'cp .env.example .env',
    'node demo-reset.mjs',
    './run-native-demo.sh',
    '```',
    '',
    'Then open `/spaces` and follow `RUNBOOK.md`.',
    '',
  ].join('\n'),
);

console.log(`Packaged native demo bundle at ${outputRoot}`);
