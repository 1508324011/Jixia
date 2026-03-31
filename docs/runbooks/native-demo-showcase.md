# Native Demo Showcase Runbook

This runbook resets the branch to a deterministic server-backed demo and walks a reviewer through the strongest truthful browser story now available on `demo-native-showcase`: start from `/home`, confirm the editorial-lab `Research workbench`, open the seeded tumor-board project, continue into the dense project library, open a paper in the document-first `Reader`, continue in the docked `AI Workspace` or the private `Notebook`, then verify the shared `Project Docs` surface on the seeded tumor-board project. The branch still runs natively on Node, uses user-owned runtime paths, and avoids Docker or sudo for the primary showcase path.

The downstream demo branch now carries the implemented reset from the March workbench passes: canonical `/projects/...` routes, dense Search/Library feeder surfaces, an independent global `AI Workspace`, a fully private document-first `Notebook`, a document-first `Reader`, and project-owned `Project Docs` with a visible `Reference rail`.

## Inherited current host beta path

The inherited **current host** / **no-Docker** beta path still exists on this branch even though the primary reviewer story here is the native showcase. That beta path uses `http://127.0.0.1:3000`, confirms `登录` and `个人工作台`, opens `设置`, checks `API key not configured`, uses `Search intake boards`, performs `导入到个人 Library`, uses `Open reader`, `Open notebook`, `Save notebook`, `Insert into project docs`, `Open project docs`, and finally `restart the app process` to verify persistence in `server-state.json`. That inherited path is still product truth; this runbook keeps the `demo-native-showcase` reviewer choreography and packaged reset as a demo-only convenience, not as a second product model.

## Honest milestone framing

The currently approved milestone remains **Unified Intake & Deep Reading Workbench**. This runbook documents the parts that are already runnable and truthful on this worktree:

- `Home`, `Projects`, `Search`, `Library`, `Notebooks`, and `AI` now form the truthful browser surface for reviewer walkthroughs
- `Search` and `Library` are feeder surfaces into Reader, Notebook, and Project Docs rather than the center of the story
- `Reader`, `Notebook`, and `Project Docs` are separate surfaces with explicit ownership boundaries
- `AI Workspace` is global and appears docked on the right by default when you enter Reader
- only **imported inventory** enters `Reader`, `Notebook`, and `Project Docs`
- `Notebook` remains fully private and document-first
- `Project Docs` remain project-owned shared writing objects
- notebook-to-project crossing happens only through the explicit **Insert into project docs** projection flow, which creates a project-owned reference without exposing notebook bodies

This means the demo can now truthfully show the rebuilt workbench shell in its compact state: a single global `Activity Rail`, a contextual second column, a denser open-view strip, a dominant editor canvas, dense Search/Library feeder surfaces, the document-first Reader, docked AI, browser-side projection, and shared Project Docs. The shell primitives landed first, and the compact-shell pass removed repeated navigation, default right-rail filler, and large explanatory chrome from the main workbench routes so `Home`, `Projects`, `Search`, `Library`, `Notebook`, `Notebooks`, and `AI` read much more like one concise workbench rather than chrome wrapped around old page cards. It does **not** claim that shell convergence is complete across every route yet: companion surfaces such as `Project`, `Today`, `Project Docs`, and `Settings` still retain parts of the older `page-shell` presentation. It also does **not** claim that automatic recommendation ranking or the full `Push lane` are already complete.

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

All deep-reading and project-doc steps in this runbook start from an **imported library item**. Raw discovery candidates are not used directly in Reader, Notebook, or Project Docs flows.

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

Home -> Projects -> Library -> Reader -> AI Workspace / Notebook -> Project Docs

### A. Feeder-surface walkthrough

1. Open **Research workbench** at `/home` and confirm the compact workbench shell is present: the far-left Activity Rail is the only global mode switcher, the second column is contextual instead of a repeated route list, the top open-view strip is compact and tool-like, the center canvas dominates, and `Home` reads as a more de-carded resumption surface without a default right-rail filler.
2. In **Recent projects**, click **Open tumor board workspace** and confirm the project overview offers **Open active reader**, **Open active notebook**, and **Open project docs** as sibling surfaces rather than one embedded desk.
3. In **Recent imports**, click **Open project library** and confirm the browser lands in the dense project `Library` feeder surface.
4. Confirm the library inventory is broad, scan-friendly, and still preserves the row actions **Open notebook**, **Open reader**, and **Open project docs**.
5. Click **Open reader** on the seeded imported paper and confirm the browser lands in **Reader** with a document-first canvas on the left, **AI Workspace** docked on the right, and **Reader supporting context** below the AI shell. The Reader route should now feel flattened into one reading workspace instead of stacked boxed panels, and the shell should no longer waste space on repeated explanatory header copy.
6. In Reader, confirm **Open notebook**, **Open AI workspace**, **Open project docs**, and **Back to project** are all visible as exits rather than the page’s defining architecture.
7. Click **Open notebook** and confirm the browser lands in **Notebook** with the shared `document-editor` surface and the textbox labeled **Private notebook document**.
8. Type a private notebook note, click **Save notebook**, then confirm the saved notebook content persists in the editor.
9. Click **Insert into project docs** and confirm the browser shows **Project-owned reference created.**
10. Click **Open project docs** and confirm the browser lands in **Project docs** with the shared `document-editor` surface and the new projected reference visible in **Reference rail**.

### B. Shared project docs flow

11. Reopen the seeded project route `/projects/tumor-board` (or `/projects/tumor-board?spaceId=shared-space` if you want the explicit space context in the URL).
12. In the **Project docs** section, click **Open project docs**.
13. Confirm the page title is **Project docs**, the textbox label is **Project document**, and the **Reference rail** shows the projected excerpt.
14. Edit **Project document**, click **Save draft**, then click **Reload draft** and confirm the saved content persists after the reload.
15. Click **Publish** and confirm the publish state changes to `published`.
16. Optionally click **Run governed summary** to show the governed job finale with queued/running/succeeded events and audit records.
17. Restart the app process, reopen `/projects/tumor-board/writing/doc-1`, and verify the shared document state still exists after restart.

## Optional Search feeder check

If you want to verify the intake side of the same architecture, open `/search`, confirm **Search intake boards** render as a dense feeder surface, import a result, then continue through **Open reader** on the imported inventory item rather than using raw discovery candidates as direct Reader inputs.

## Route truth

- canonical browser routes now live under `/home`, `/search`, `/library`, `/notebooks`, `/ai`, `/projects`, and `/projects/:projectId/...`
- nested `/spaces/...` deep links are compatibility redirects into the canonical `/projects/...` tree
- `/today` is no longer the canonical reviewer entry point for this showcase walkthrough
- the runbook no longer treats `/spaces` as the primary route authority

## What this demo proves

- the native reset path restores a known server-owned state
- the rebuilt browser shell now uses a compact `Research workbench` frame with one global `Activity Rail`, a contextual second column, a compressed open-view strip, a dominant editor canvas, and a conditional inspector rail
- the compact-shell pass removes repeated sidebar navigation, default recent-opened filler, and oversized route-explainer copy from the main workbench routes so the shell reads more like one tool rather than shell plus repeated page-level navigation
- shell convergence is materially advanced but not complete yet; several companion routes still retain older `page-shell` presentation patterns
- Search and Library now behave as dense feeder surfaces into deeper work
- `Reader` is now document-first on the left with docked AI and supporting context on the right
- `AI Workspace` is global, independent, and reachable both directly and from Reader
- `Notebook` is private, document-first, and no longer organized around notebook-question scaffolding
- `Project Docs` remain separate project-owned shared writing surfaces
- notebook material can be projected into project-owned references from the browser without leaking notebook bodies into project routes
- shared project docs persist through save, reload, publish, and process restart
- the governed job finale leaves audit-visible artifacts without exposing raw secrets in browser payloads

## What this demo does not claim yet

- it does not claim that the full `Push lane` / automatic recommendation domain is complete
- it does not claim that automatic recommendation ranking, refresh loops, or adaptive feedback are production-complete

## Why operator support is next

This branch is intentionally a native single-host showcase, not the final operator contract. It now truthfully proves the rebuilt workbench surfaces, canonical `/projects/...` routes, dense feeder pages, independent AI workspace, private notebook document model, and project-owned document persistence with user-owned runtime paths. A production handoff still needs operator-owned service supervision, durable storage layout, secret provisioning, backups, and optional Docker or other managed runtime packaging. The next operational step is to turn this working workbench demo into a repeatable operator-owned deployment contract rather than asking reviewers to run the app manually.
