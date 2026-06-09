import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const createPrScript = join(
  process.cwd(),
  '.trellis/scripts/multi_agent/create_pr.py',
);
const describeCreatePrScript = existsSync(createPrScript) ? describe : describe.skip;

interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface TempRepo {
  root: string;
}

interface ToolWrapperEnv {
  commandLog: string;
  env: Record<string, string | undefined>;
}

interface TestTaskOptions {
  baseBranch?: string;
  branch?: string;
  devType?: string;
  includeScope?: boolean;
  name: string;
  scope?: unknown;
}

function runCommand(
  cwd: string,
  command: string,
  args: string[],
  env: Record<string, string | undefined> = { ...process.env, GIT_MASTER: '1' },
): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env,
  });

  return {
    status: result.status ?? 1,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

function runGit(cwd: string, args: string[]): CommandResult {
  const result = runCommand(cwd, 'git', args);

  expect(
    result.status,
    `git ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  ).toBe(0);

  return result;
}

function resolveExecutable(command: string): string {
  for (const pathEntry of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(pathEntry, command);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to resolve executable: ${command}`);
}

function createTempRepo(): TempRepo {
  const root = mkdtempSync(join(tmpdir(), 'jixia-trellis-create-pr-'));

  mkdirSync(join(root, '.trellis/tasks'), { recursive: true });
  writeFileSync(join(root, '.trellis/.developer'), 'name=trellis-test\n');
  writeFileSync(
    join(root, '.gitignore'),
    [
      '.claude/',
      '.cursor/',
      '.trellis/',
      'tool-wrappers/',
      'trellis-command-log.txt',
      '',
    ].join('\n'),
  );
  writeFileSync(join(root, 'README.md'), '# Trellis create-pr fixture\n');

  runGit(root, ['init', '-b', 'main']);
  runGit(root, ['config', 'user.name', 'Trellis Test']);
  runGit(root, ['config', 'user.email', 'trellis@example.test']);
  runGit(root, ['add', 'README.md', '.gitignore']);
  runGit(root, ['commit', '-m', 'initial fixture']);

  return { root };
}

function removeTempRepo(repo: TempRepo): void {
  rmSync(repo.root, { force: true, recursive: true });
}

function writeTask(
  repo: TempRepo,
  slug: string,
  options: TestTaskOptions,
): string {
  const taskDir = join(repo.root, '.trellis/tasks', slug);
  mkdirSync(taskDir, { recursive: true });

  const taskData: Record<string, unknown> = {
    actions: [],
    base_branch: options.baseBranch ?? 'main',
    branch: options.branch ?? 'task/create-pr-guardrail',
    current_phase: 'finish',
    dev_type: options.devType ?? 'backend',
    id: slug,
    meta: {},
    name: options.name,
    notes: '',
    status: 'in-progress',
  };

  if (options.includeScope !== false) {
    taskData.scope = options.scope ?? null;
  }

  writeFileSync(
    join(taskDir, 'task.json'),
    JSON.stringify(taskData, null, 2),
  );
  writeFileSync(join(taskDir, 'prd.md'), `# ${options.name}\n`);

  return relative(repo.root, taskDir).replaceAll('\\', '/');
}

function createToolWrappers(repo: TempRepo): ToolWrapperEnv {
  const wrapperDir = join(repo.root, 'tool-wrappers');
  const commandLog = join(repo.root, 'trellis-command-log.txt');
  const realGit = resolveExecutable('git');

  mkdirSync(wrapperDir, { recursive: true });
  writeFileSync(
    join(wrapperDir, 'git'),
    [
      '#!/usr/bin/env bash',
      'printf "git" >> "$TRELLIS_COMMAND_LOG"',
      'for arg in "$@"; do printf " %s" "$arg" >> "$TRELLIS_COMMAND_LOG"; done',
      'printf "\\n" >> "$TRELLIS_COMMAND_LOG"',
      `exec ${JSON.stringify(realGit)} "$@"`,
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(wrapperDir, 'gh'),
    [
      '#!/usr/bin/env bash',
      'printf "gh" >> "$TRELLIS_COMMAND_LOG"',
      'for arg in "$@"; do printf " %s" "$arg" >> "$TRELLIS_COMMAND_LOG"; done',
      'printf "\\n" >> "$TRELLIS_COMMAND_LOG"',
      'exit 97',
      '',
    ].join('\n'),
  );
  chmodSync(join(wrapperDir, 'git'), 0o755);
  chmodSync(join(wrapperDir, 'gh'), 0o755);

  return {
    commandLog,
    env: {
      ...process.env,
      GIT_MASTER: '1',
      PATH: `${wrapperDir}${delimiter}${process.env.PATH ?? ''}`,
      TRELLIS_COMMAND_LOG: commandLog,
    },
  };
}

function readCommandLog(commandLog: string): string {
  if (!existsSync(commandLog)) {
    return '';
  }

  return readFileSync(commandLog, 'utf8');
}

function runCreatePrDryRun(
  repo: TempRepo,
  taskDir: string,
  toolWrapperEnv: ToolWrapperEnv,
): CommandResult {
  return runCommand(
    repo.root,
    'python3',
    [createPrScript, taskDir, '--dry-run'],
    toolWrapperEnv.env,
  );
}

function outputOf(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`;
}

function stagedFiles(repo: TempRepo): string[] {
  const result = runGit(repo.root, ['diff', '--cached', '--name-only']);
  return result.stdout.split('\n').filter((line) => line.length > 0);
}

describeCreatePrScript('Trellis create-pr script guardrails', () => {
  it('fails same-branch PR attempts before staging, pushing, or submitting', () => {
    const repo = createTempRepo();

    try {
      mkdirSync(join(repo.root, 'src'), { recursive: true });
      writeFileSync(
        join(repo.root, 'src/demo.ts'),
        'export const demo = true;\n',
      );
      const taskDir = writeTask(repo, 'same-branch', {
        baseBranch: 'main',
        branch: 'main',
        name: 'Same branch guardrail',
        scope: 'tooling',
      });
      const wrappers = createToolWrappers(repo);

      const result = runCreatePrDryRun(repo, taskDir, wrappers);
      const output = outputOf(result);
      const commandLog = readCommandLog(wrappers.commandLog);

      expect(result.status).toBe(1);
      expect(output).toContain("current branch 'main'");
      expect(output).toContain("task base_branch 'main'");
      expect(output).toContain(
        'Create/switch to a task branch or update task.json branch/base_branch',
      );
      expect(output).toContain(
        'No files were staged, committed, pushed, or submitted.',
      );
      expect(output).not.toContain('Checking for changes');
      expect(commandLog).toContain(
        'git -c i18n.logOutputEncoding=UTF-8 branch --show-current',
      );
      expect(commandLog).not.toMatch(/^git\b.*\badd\b/m);
      expect(commandLog).not.toContain(' add -A');
      expect(commandLog).not.toContain(' commit');
      expect(commandLog).not.toContain(' push');
      expect(commandLog).not.toContain('gh ');
      expect(stagedFiles(repo)).toEqual([]);
    } finally {
      removeTempRepo(repo);
    }
  });

  it('dry-runs distinct-branch PRs with ignored artifacts excluded and staging reset', () => {
    const repo = createTempRepo();

    try {
      runGit(repo.root, ['checkout', '-b', 'task/create-pr-guardrail']);
      mkdirSync(join(repo.root, 'src'), { recursive: true });
      mkdirSync(join(repo.root, '.claude'), { recursive: true });
      mkdirSync(join(repo.root, '.cursor'), { recursive: true });
      writeFileSync(join(repo.root, 'src/demo.ts'), 'export const demo = true;\n');
      writeFileSync(
        join(repo.root, '.claude/local.md'),
        'ignored claude state\n',
      );
      writeFileSync(join(repo.root, '.cursor/state.json'), '{}\n');
      const taskDir = writeTask(repo, 'distinct-branch', {
        baseBranch: 'main',
        branch: 'task/create-pr-guardrail',
        name: 'Distinct branch guardrail',
        scope: 'tooling',
      });
      const wrappers = createToolWrappers(repo);

      const result = runCreatePrDryRun(repo, taskDir, wrappers);
      const output = outputOf(result);
      const commandLog = readCommandLog(wrappers.commandLog);

      expect(result.status).toBe(0);
      expect(commandLog).toContain(
        'git -c i18n.logOutputEncoding=UTF-8 add -A',
      );
      expect(commandLog).toContain(
        'git -c i18n.logOutputEncoding=UTF-8 reset HEAD',
      );
      expect(commandLog).not.toContain(
        'git -c i18n.logOutputEncoding=UTF-8 commit',
      );
      expect(commandLog).not.toContain(
        'git -c i18n.logOutputEncoding=UTF-8 push',
      );
      expect(commandLog).not.toContain('gh ');
      expect(output).toContain(
        '[DRY-RUN] Would commit with message: feat(tooling): Distinct branch guardrail',
      );
      expect(output).toContain('  - src/demo.ts');
      expect(output).toContain('Title: feat(tooling): Distinct branch guardrail');
      expect(output).toContain('Base:  main');
      expect(output).toContain('Head:  task/create-pr-guardrail');
      expect(output).not.toContain('.claude');
      expect(output).not.toContain('.cursor');
      expect(stagedFiles(repo)).toEqual([]);
    } finally {
      removeTempRepo(repo);
    }
  });

  it('normalizes missing, empty, non-string, and explicit scopes for commit and PR titles', () => {
    const repo = createTempRepo();

    try {
      runGit(repo.root, ['checkout', '-b', 'task/scope-rendering']);
      mkdirSync(join(repo.root, 'src'), { recursive: true });
      writeFileSync(
        join(repo.root, 'src/scope.ts'),
        'export const scope = true;\n',
      );
      const wrappers = createToolWrappers(repo);
      const cases: Array<{
        expectedScope: string;
        includeScope?: boolean;
        name: string;
        scope?: unknown;
        slug: string;
      }> = [
        {
          expectedScope: 'core',
          includeScope: false,
          name: 'Scope fallback missing',
          slug: 'scope-missing',
        },
        {
          expectedScope: 'core',
          name: 'Scope fallback null',
          scope: null,
          slug: 'scope-null',
        },
        {
          expectedScope: 'core',
          name: 'Scope fallback empty',
          scope: '',
          slug: 'scope-empty',
        },
        {
          expectedScope: 'core',
          name: 'Scope fallback whitespace',
          scope: '   ',
          slug: 'scope-whitespace',
        },
        {
          expectedScope: 'core',
          name: 'Scope fallback non string',
          scope: ['tooling'],
          slug: 'scope-non-string',
        },
        {
          expectedScope: 'tooling',
          name: 'Scope explicit',
          scope: 'tooling',
          slug: 'scope-explicit',
        },
        {
          expectedScope: 'research',
          name: 'Scope trimmed',
          scope: '  research  ',
          slug: 'scope-trimmed',
        },
      ];

      for (const testCase of cases) {
        const taskDir = writeTask(repo, testCase.slug, {
          baseBranch: 'main',
          branch: 'task/scope-rendering',
          includeScope: testCase.includeScope,
          name: testCase.name,
          scope: testCase.scope,
        });

        const result = runCreatePrDryRun(repo, taskDir, wrappers);
        const output = outputOf(result);
        const expectedTitle = `feat(${testCase.expectedScope}): ${testCase.name}`;

        expect(result.status, output).toBe(0);
        expect(output).toContain(
          `[DRY-RUN] Would commit with message: ${expectedTitle}`,
        );
        expect(output).toContain(`Title: ${expectedTitle}`);
        expect(output).not.toContain('feat(None):');
        expect(output).not.toContain('feat():');
        expect(stagedFiles(repo)).toEqual([]);
      }
    } finally {
      removeTempRepo(repo);
    }
  });

});

describe('Trellis create-pr temp repository guardrails', () => {
  it('keeps .claude and .cursor artifacts ignored in temp create-pr repositories', () => {
    const repo = createTempRepo();

    try {
      mkdirSync(join(repo.root, '.claude'), { recursive: true });
      mkdirSync(join(repo.root, '.cursor'), { recursive: true });
      writeFileSync(
        join(repo.root, '.claude/local.md'),
        'ignored claude state\n',
      );
      writeFileSync(join(repo.root, '.cursor/state.json'), '{}\n');

      const result = runGit(repo.root, [
        'check-ignore',
        '-v',
        '.claude/local.md',
        '.cursor/state.json',
      ]);

      expect(result.stdout).toContain('.gitignore:1:.claude/');
      expect(result.stdout).toContain('.gitignore:2:.cursor/');
    } finally {
      removeTempRepo(repo);
    }
  });
});
