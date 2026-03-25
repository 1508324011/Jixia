# Native Demo Showcase Runbook

This runbook resets the branch to a deterministic server-backed demo and walks a reviewer through the strongest truthful browser story now available on `demo-native-showcase`: start from `/home`, inspect the editorial-lab `Research workbench`, open the seeded tumor-board project, continue into the active notebook, use the reader as an evidence companion, project selected notebook material into shared writing, then verify the shared `Project Docs` surface on the seeded tumor-board project. The branch still runs natively on Node, uses user-owned runtime paths, and avoids Docker or sudo for the primary showcase path.

The downstream demo branch now carries the implemented reset from Tasks 1–9: canonical `/projects/...` routes, imported-inventory-only deep reading, a fully private `Notebook`, a three-pane workbench shell, a browser-side **Insert into project docs** action, and project-owned `Project Docs` with a visible reference rail.

## Inherited current host beta path

The inherited **current host** / **no-Docker** beta path still exists on this branch even though the primary reviewer story here is the native showcase. The current-host beta path uses `http://127.0.0.1:3000`, confirms `登录` and `个人工作台`, opens `设置`, checks `API key not configured`, uses `Search intake boards`, performs `导入到个人 Library`, uses `Open reader`, `Open notes workspace`, `Save private note`, `Insert into project docs`, `Open project docs`, and finally `restart the app process` to verify persistence in `server-state.json`. That inherited path is product truth; this runbook keeps the `demo-native-showcase` reviewer choreography and packaged reset as a demo-only convenience, not as a second product model.

## Honest milestone framing

The currently approved milestone remains **Unified Intake & Deep Reading Workbench**. This runbook now documents the parts that are already runnable and truthful on this worktree:

- `Home`, `Projects`, and `Notebooks` now form the truthful browser front door for reviewer walkthroughs
- `Discovery & Intake` remains available under `Search`, but it is no longer the primary reviewer choreography for this native showcase
- only **imported inventory** enters `Reader`, `Notes Workspace`, and `Project Docs`
- `Notebook` remains fully private
- `Project Docs` remain project-owned shared writing objects
- notebook-to-project crossing now happens only through the explicit **Insert into project docs** projection flow, which creates a project-owned reference without exposing notebook bodies

This means the demo can now truthfully show the rebuilt shell, route cutover, Notes Workspace, browser-side projection, and shared Project Docs. It does **not** claim that automatic recommendation ranking or the full `Push lane` are already complete.

## Runtime contract

Use user-owned runtime paths so the demo can be reproduced on the current host:

- `JIXIA_STORAGE_ROOT=/home/zhurui/.local/share/jixia-demo/storage`
- `JIXIA_DATABASE_URL=file:/home/zhurui/.local/share/jixia-demo/data/jixia-demo.db`

The deterministic walkthrough keeps these reproducible anchors:

- project route: `tumor-board`
- shared project space: `shared-space`
- reproducible import anchor: `pmid:123456`
- example created space name: `Genomics Sandbox`

## Reset and startup

```bash
cp .env.example .env
npm install
npm run build
npm run demo:reset
npm run start:server
```

After startup, open the local server in the browser and begin at `/home`.

All deep-reading and project-doc steps in this runbook start from an **imported library item**. Raw discovery candidates are not used directly in Reader, Notes Workspace, or Project Docs flows.

## Packaged native demo

To prove the operator boundary without Docker, generate a source-independent bundle:

```bash
npm run package:native-demo
```

This writes a runnable artifact to `.native-demo-package/native-demo` with:

- built browser assets in `dist/`
- bundled Node runtime in `dist-server/`
- portable reset helper `demo-reset.mjs`
- startup wrapper `run-native-demo.sh`
- copied walkthrough file `RUNBOOK.md`

Packaged startup path:

```bash
cd .native-demo-package/native-demo
cp .env.example .env
node demo-reset.mjs
./run-native-demo.sh
```

Use this when you want to prove that the demo can be handed off as a runnable artifact rather than only from the source checkout.

## Showcase flow

Home -> Projects -> Notebooks -> Reader -> Project Docs

### A. Project notebook walkthrough

1. Open **Research workbench** at `/home` and confirm the three-pane shell is present.
2. Click **Open tumor board workspace** and confirm the project overview now offers **Open active notebook**, **Open active reader**, and **Open project docs** as sibling companion actions.
3. Click **Open active notebook** and confirm the browser lands in **Notes workspace** with **Notebook questions** visible as the synthesis scaffold.
4. Type a private note into **Private note** and click **Save private note**.
5. Click **Back to reader**.
6. In **Evidence companion**, confirm the reader keeps the paper, evidence summaries, and routing links, then click **Open related reader** only when coming from notebook inventory rows or **Back to notebook** when already inside the seeded project flow.
7. Click **Back to notebook** and confirm the route returns to the notebook surface without leaving canonical `/projects/...` paths.
8. Click **Insert into project docs** and confirm the browser shows **Project-owned reference created.**
9. Click **Open project docs** and confirm the browser lands in the shared writing surface with the new projected reference visible in **Reference rail**.
10. Use **Back to project** to confirm the notebook, reader, and project surfaces now behave as companion routes instead of isolated desks.

### B. Shared project docs flow

11. Reopen the seeded project route `/projects/tumor-board` (or `/projects/tumor-board?spaceId=shared-space` if you want the explicit space context in the URL).
12. In the **Project docs** section, click **Open project docs**.
13. Confirm the page title is **Project docs**, the document tree renders the shared tumor-board draft, and the **Reference rail** shows the projected excerpt.
14. Edit **Draft content**, click **Save draft**, then click **Reload draft** and confirm the saved content persists after the reload.
15. Click **Publish** and confirm the publish state changes to `published`.
16. Optionally click **Run governed summary** to show the governed job finale with queued/running/succeeded events and audit records.
17. Restart the app process, reopen `/projects/tumor-board/writing/doc-1`, and verify the shared document state still exists after restart.

## Route truth

- canonical browser routes now live under `/home`, `/projects`, `/notebooks`, `/search`, `/library`, and `/projects/:projectId/...`
- nested `/spaces/...` deep links are now compatibility redirects into the canonical `/projects/...` tree
- `/today` is no longer the canonical reviewer entry point for this showcase walkthrough
- the runbook no longer treats `/spaces` as the primary route authority

## What this demo proves

- the native reset path restores a known server-owned state
- the rebuilt browser shell is a stable three-pane `Research workbench`
- intake/import is separated from deep reading and shared drafting
- `Reader`, `Notes Workspace`, and `Project Docs` are now separate surfaces
- notebook material can be projected into project-owned references from the browser without leaking notebook bodies into project routes
- shared project docs persist through save, reload, publish, and process restart
- the governed job finale leaves audit-visible artifacts without exposing raw secrets in browser payloads

## What this demo does not claim yet

- it does not claim that the full `Push lane` / automatic recommendation domain is complete
- it does not claim that automatic recommendation ranking, refresh loops, or adaptive feedback are production-complete

## Why operator support is next

This branch is intentionally a native single-host showcase, not the final operator contract. It now truthfully proves the rebuilt workbench surfaces, canonical `/projects/...` routes, and project-owned document persistence with user-owned runtime paths. A production handoff still needs operator-owned service supervision, durable storage layout, secret provisioning, backups, and optional Docker or other managed runtime packaging. The next operational step is to turn this working workbench demo into a repeatable operator-owned deployment contract rather than asking reviewers to run the app manually.
