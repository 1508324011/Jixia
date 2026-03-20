# Jixia Open Source Bootstrap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare `Jixia` as a governance-first public GitHub repository with `AGENTS.md`, Apache-2.0 licensing, bilingual README files, community health files, engineering guardrails, minimal TypeScript scaffold, local git history, and post-publish GitHub security settings.

**Architecture:** Build the repository in four layers: identity, governance, engineering guardrails, and minimal scaffold. Keep the first public version intentionally narrow: no real product code yet, but a complete enough repository that contributors can understand purpose, rules, and safe contribution boundaries.

**Tech Stack:** Git, GitHub, Markdown, TypeScript, Node.js, Vitest, GitHub Actions

---

### Task 1: Create the base repository metadata and verification scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `tests/smoke/repo-identity.test.ts`

**Step 1: Write the failing test**

Create `tests/smoke/repo-identity.test.ts` to assert that the repository contains the expected top-level identity and scaffold files once bootstrapped.

```ts
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('repository identity scaffold', () => {
  it('will expose the expected top-level files', () => {
    expect(existsSync('package.json')).toBe(true);
    expect(existsSync('tsconfig.json')).toBe(true);
    expect(existsSync('vitest.config.ts')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke/repo-identity.test.ts`

Expected: FAIL because the scaffold files do not exist yet.

**Step 3: Write minimal implementation**

Create a minimal Node/TypeScript/Vitest setup so the repository can validate itself before any product code exists.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke/repo-identity.test.ts`

Expected: PASS with the verification scaffold present.

**Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts tests/smoke/repo-identity.test.ts
git commit -m "chore: add repository verification scaffold"
```

### Task 2: Add README, bilingual project description, and Apache-2.0 license

**Files:**
- Create: `README.md`
- Create: `README_CN.md`
- Create: `LICENSE`
- Modify: `tests/smoke/repo-identity.test.ts`

**Step 1: Write the failing test**

Extend `tests/smoke/repo-identity.test.ts` to verify that:
- `README.md` exists
- `README_CN.md` exists
- `LICENSE` exists
- the English README contains `Jixia`
- the Chinese README contains `稷下`

```ts
import { readFileSync } from 'node:fs';

it('includes bilingual readmes and a license', () => {
  expect(existsSync('README.md')).toBe(true);
  expect(existsSync('README_CN.md')).toBe(true);
  expect(existsSync('LICENSE')).toBe(true);
  expect(readFileSync('README.md', 'utf8')).toContain('Jixia');
  expect(readFileSync('README_CN.md', 'utf8')).toContain('稷下');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke/repo-identity.test.ts`

Expected: FAIL because the README and license files are missing.

**Step 3: Write minimal implementation**

Create bilingual README files and add the Apache-2.0 license text. Keep the README content focused on project identity, current phase, and where detailed plans live.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke/repo-identity.test.ts`

Expected: PASS with visible repository identity files.

**Step 5: Commit**

```bash
git add README.md README_CN.md LICENSE tests/smoke/repo-identity.test.ts
git commit -m "docs: add repository readmes and apache license"
```

### Task 3: Add AGENTS.md as the repository engineering charter

**Files:**
- Create: `AGENTS.md`
- Create: `tests/smoke/agents-charter.test.ts`

**Step 1: Write the failing test**

Create `tests/smoke/agents-charter.test.ts` to verify that `AGENTS.md` contains:
- the project identity
- top-level architecture boundary language
- no-secrets guidance
- verification requirements
- git/PR workflow expectations

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('agents charter', () => {
  it('defines hard engineering constraints', () => {
    const content = readFileSync('AGENTS.md', 'utf8');
    expect(content).toContain('Jixia');
    expect(content).toContain('no secrets');
    expect(content).toContain('verification');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke/agents-charter.test.ts`

Expected: FAIL because `AGENTS.md` does not exist yet.

**Step 3: Write minimal implementation**

Write `AGENTS.md` as a repository-level engineering charter, not as a generic AI note. Include project scope, architectural invariants, forbidden actions, testing expectations, git workflow, and documentation sync rules.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke/agents-charter.test.ts`

Expected: PASS with the charter in place.

**Step 5: Commit**

```bash
git add AGENTS.md tests/smoke/agents-charter.test.ts
git commit -m "docs: add repository engineering charter"
```

### Task 4: Add contribution, conduct, and security policies

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `SECURITY.md`
- Create: `tests/smoke/community-health.test.ts`

**Step 1: Write the failing test**

Create `tests/smoke/community-health.test.ts` to verify that the repository contains the three core community-health files and that `SECURITY.md` includes a private vulnerability reporting path.

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('community health files', () => {
  it('includes contribution, conduct, and security docs', () => {
    expect(existsSync('CONTRIBUTING.md')).toBe(true);
    expect(existsSync('CODE_OF_CONDUCT.md')).toBe(true);
    expect(existsSync('SECURITY.md')).toBe(true);
    expect(readFileSync('SECURITY.md', 'utf8')).toContain('vulnerability');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke/community-health.test.ts`

Expected: FAIL because the community-health files are missing.

**Step 3: Write minimal implementation**

Create concise, early-stage versions of the contribution guide, code of conduct, and security policy. Keep the governance author-led but open to issues and PRs.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke/community-health.test.ts`

Expected: PASS with the community-health files in place.

**Step 5: Commit**

```bash
git add CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md tests/smoke/community-health.test.ts
git commit -m "docs: add community health policies"
```

### Task 5: Add issue templates, PR template, and GitHub repository metadata

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/pull_request_template.md`
- Create: `docs/plans/2026-03-20-jixia-github-settings.md`
- Modify: `tests/smoke/community-health.test.ts`

**Step 1: Write the failing test**

Extend `tests/smoke/community-health.test.ts` to verify that:
- both issue templates exist
- the PR template exists
- the GitHub settings checklist doc exists

```ts
it('includes GitHub issue and PR templates', () => {
  expect(existsSync('.github/ISSUE_TEMPLATE/bug_report.md')).toBe(true);
  expect(existsSync('.github/ISSUE_TEMPLATE/feature_request.md')).toBe(true);
  expect(existsSync('.github/pull_request_template.md')).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke/community-health.test.ts`

Expected: FAIL because the GitHub templates are missing.

**Step 3: Write minimal implementation**

Add bug-report and feature-request templates, a PR template, and a repo-settings checklist doc that records what to enable after first push: branch protection, push protection, Dependabot, topics, description, and private vulnerability reporting.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke/community-health.test.ts`

Expected: PASS with the GitHub collaboration templates ready.

**Step 5: Commit**

```bash
git add .github/ISSUE_TEMPLATE/bug_report.md .github/ISSUE_TEMPLATE/feature_request.md .github/ISSUE_TEMPLATE/config.yml .github/pull_request_template.md docs/plans/2026-03-20-jixia-github-settings.md tests/smoke/community-health.test.ts
git commit -m "docs: add github collaboration templates"
```

### Task 6: Add engineering guardrails for formatting, text normalization, and secrets

**Files:**
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.gitattributes`
- Create: `.env.example`
- Create: `tests/smoke/guardrails.test.ts`

**Step 1: Write the failing test**

Create `tests/smoke/guardrails.test.ts` to verify that:
- `.gitignore` ignores `.env`, secrets, and local files
- `.editorconfig` exists
- `.gitattributes` exists
- `.env.example` exists and contains placeholders rather than real secrets

```ts
import { readFileSync } from 'node:fs';

it('includes secret-safe repository guardrails', () => {
  expect(readFileSync('.gitignore', 'utf8')).toContain('.env');
  expect(readFileSync('.env.example', 'utf8')).toContain('YOUR_');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke/guardrails.test.ts`

Expected: FAIL because the guardrail files are missing.

**Step 3: Write minimal implementation**

Add ignore rules for secrets and local config files, normalize editor settings, add text normalization rules, and create a placeholder-based `.env.example` file.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke/guardrails.test.ts`

Expected: PASS with the repository guardrails present.

**Step 5: Commit**

```bash
git add .gitignore .editorconfig .gitattributes .env.example tests/smoke/guardrails.test.ts
git commit -m "chore: add repository guardrails"
```

### Task 7: Add minimal source, docs, and tests directories plus CI

**Files:**
- Create: `src/.gitkeep`
- Create: `tests/.gitkeep`
- Create: `.github/workflows/ci.yml`
- Create: `docs/adr/.gitkeep`
- Modify: `tests/smoke/repo-identity.test.ts`

**Step 1: Write the failing test**

Extend `tests/smoke/repo-identity.test.ts` to verify that:
- `src/` exists
- `tests/` exists
- `.github/workflows/ci.yml` exists
- the CI workflow references at least lint, test, or typecheck placeholders

```ts
it('includes the first CI workflow and source directories', () => {
  expect(existsSync('src/.gitkeep')).toBe(true);
  expect(existsSync('tests/.gitkeep')).toBe(true);
  expect(existsSync('.github/workflows/ci.yml')).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke/repo-identity.test.ts`

Expected: FAIL because the directories and workflow are missing.

**Step 3: Write minimal implementation**

Create empty source and docs anchors plus a CI workflow that runs install, lint, test, and typecheck placeholders against the initial scaffold.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke/repo-identity.test.ts`

Expected: PASS with the minimal engineering scaffold ready.

**Step 5: Commit**

```bash
git add src/.gitkeep tests/.gitkeep .github/workflows/ci.yml docs/adr/.gitkeep tests/smoke/repo-identity.test.ts
git commit -m "ci: add initial repository workflow"
```

### Task 8: Initialize local git and create the first clean history

**Files:**
- Modify: `docs/plans/2026-03-20-jixia-github-settings.md`

**Step 1: Write the failing verification step**

Record in `docs/plans/2026-03-20-jixia-github-settings.md` that local git initialization is incomplete until:
- `git status` succeeds
- the default branch is `main`
- the repository has a clean working tree after the bootstrap commits

**Step 2: Run verification to show the repo is not initialized yet**

Run: `git status`

Expected: FAIL with `not a git repository`.

**Step 3: Write minimal implementation**

Initialize git locally, rename the default branch to `main`, then create atomic commits for the repository bootstrap tasks already completed above.

**Step 4: Run verification to confirm the repo is ready**

Run:
- `git status`
- `git branch --show-current`

Expected:
- `git status` succeeds with a clean working tree
- current branch is `main`

**Step 5: Commit**

```bash
git add docs/plans/2026-03-20-jixia-github-settings.md
git commit -m "docs: record local git bootstrap status"
```

### Task 9: Create the GitHub repository and apply post-publish hardening

**Files:**
- Modify: `docs/plans/2026-03-20-jixia-github-settings.md`
- Modify: `README.md`
- Modify: `README_CN.md`

**Step 1: Write the failing verification checklist**

Extend `docs/plans/2026-03-20-jixia-github-settings.md` with a checklist for:
- repository description
- topics
- branch protection
- secret scanning / push protection
- Dependabot alerts
- private vulnerability reporting
- issue templates and PR template visible on GitHub

**Step 2: Run the publish steps and note the expected incomplete state**

Run:
- `gh repo create <owner>/Jixia --public --source=. --remote=origin --push`
- `gh repo view --json name,visibility,url`

Expected: the repository exists publicly and returns a GitHub URL, but the settings checklist is not yet fully checked off.

**Step 3: Write minimal implementation**

Apply the repository settings on GitHub and update both README files with the public repository URL and contribution entry points if those changed after publication.

**Step 4: Run verification to confirm the public repo posture**

Run:
- `gh repo view --json name,visibility,url`
- `gh api repos/<owner>/Jixia`

Expected: the repo is public, named correctly, and the documented hardening checklist is complete.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-20-jixia-github-settings.md README.md README_CN.md
git commit -m "docs: record github publication state"
```

### Task 10: Run final bootstrap verification

**Files:**
- Modify: `README.md`
- Modify: `README_CN.md`
- Modify: `AGENTS.md`

**Step 1: Run the full verification suite**

Run:
- `npm run test`
- `npm run lint`
- `npm run typecheck`

Expected: PASS with the bootstrap scaffold healthy.

**Step 2: Review the public repository against the bootstrap acceptance criteria**

Confirm all of the following are true:
- repository identity files exist
- community health files exist
- AGENTS charter exists
- GitHub templates exist
- guardrails exist
- CI exists
- local git is clean
- public GitHub repo is visible and hardened

**Step 3: Write minimal implementation**

If any verification item fails, update the affected docs or config files and re-run the failing command.

**Step 4: Re-run verification**

Run:
- `npm run test`
- `npm run lint`
- `npm run typecheck`

Expected: PASS after the final cleanup.

**Step 5: Commit**

```bash
git add README.md README_CN.md AGENTS.md
git commit -m "chore: finish jixia bootstrap verification"
```

Plan complete and saved to `docs/plans/2026-03-20-jixia-open-source-bootstrap-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
