# Jixia Repository Engineering Charter

## Project Identity

Jixia is a server-first research collaboration platform for laboratory teams.
This repository exists to develop the public open-source scaffold first and then
the product implementation around spaces, literature assets, reading workflows,
versioned writing, and governed AI jobs.

## Architecture Boundaries

1. Jixia is a **server-first** system. The server is the source of truth for
   authoritative data, storage keys, jobs, and audit records.
2. Repository bootstrap comes before feature expansion. Governance, safety, and
   verification are not optional polish.
3. Shared contracts must remain transport-safe and must not import desktop-only
   or server-private runtime state into browser-facing boundaries.
4. Privacy and visibility rules must be modeled explicitly. Do not patch broken
   access control with ad-hoc conditionals.

## Directory Responsibilities

- `docs/plans/`: design and implementation plans; update when system intent changes
- `src/server/`: server runtime, APIs, jobs, storage, and governance logic
- `src/web/`: browser-facing UI and navigation
- `src/shared/`: transport-safe shared contracts and types
- `src/db/`: schema, database access, and repository-layer persistence
- `tests/`: smoke, integration, and UI verification

## Hard Blocks

1. no secrets in source control, examples, tests, or screenshots
2. no raw provider keys in business payloads; use references and secure storage
3. no skipping verification after changing behavior, contracts, or docs
4. no undocumented boundary changes that contradict approved plans in `docs/plans/`
5. no feature work that weakens the server-first model or bypasses auditability

## Verification Requirements

Every meaningful change must carry verification evidence.

- Write or update tests first when changing behavior
- Run the smallest relevant test during development
- Re-run broader verification before claiming completion
- Keep verification output clean enough that failures are obvious

If verification fails, fix the issue or update the relevant plan before moving on.

## Git and Pull Request Workflow

1. Keep changes scoped to the current task.
2. Use clear commit messages that explain intent, not just file names.
3. Open a pull request with enough context for reviewers to understand the goal,
   the affected boundary, and the verification performed.
4. Do not merge architectural changes that conflict with the approved design docs
   without updating those docs first.

## Documentation Sync Rules

When the repository structure, platform boundaries, or operator workflow changes,
update the affected README, plan, and policy documents in the same line of work.

Repository documentation should stay aligned with reality so new contributors can
understand what Jixia is, what phase it is in, and which rules govern changes.
