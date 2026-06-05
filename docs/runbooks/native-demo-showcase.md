# Current-Host Workbench Beta Runbook

This runbook is the truthful **current host** browser path for `main`.
It is intentionally a **no-Docker** walkthrough that starts from the integrated workbench beta,
proves the persisted vertical slice once, restarts the process, and reopens the same state.

The packaged reset/showcase path is a **demo-only convenience** that belongs to the downstream
`demo-native-showcase` branch. On `main`, use this runbook when you want to validate the product
truth rather than the extra demo packaging.

## Runtime contract

Use a user-owned local runtime path on the current host. One concrete example:

- `JIXIA_STORAGE_ROOT=/home/zhurui/.local/share/jixia-beta/storage`
- `JIXIA_DATABASE_URL=file:/home/zhurui/.local/share/jixia-beta/data/jixia.db`
- `JIXIA_HOST=127.0.0.1`
- `JIXIA_PORT=3000`

Normal runtime authority lives in Prisma/SQLite, not `server-state.json`. A
missing `JIXIA_STORAGE_ROOT/server-state.json` is expected on a fresh host and
does not block startup or collaborative persistence. Any remaining legacy JSON
handling is a one-time compatibility bootstrap path; after bootstrap, durable
provider credential rows require the same `JIXIA_DATABASE_URL` plus the durable
`JIXIA_STORAGE_ROOT/credentials.key` file. If that key is missing or replaced,
existing encrypted credential rows fail closed instead of being exposed or
silently recreated.

Paper uploads use the same server-owned storage boundary. `POST /api/import/pdf`
writes uploaded paper bytes under `JIXIA_STORAGE_ROOT`, computes the checksum on
the server, deduplicates global file-backed `PaperAsset` rows by checksum, and
returns only browser-safe availability such as `asset.hasFile`. Reader file access
must go through `GET|HEAD /api/library/:entryId/file`; the browser never receives
raw storage keys, `papers/...` paths, checksums, or filesystem locations.

## Native startup on the current host

```bash
cp .env.example .env
# edit .env so the values match your current-host paths
npm install
npm run build
npm run start:server
```

After startup, open `http://127.0.0.1:3000`.
The root route redirects to `/home`, and unauthenticated browsers are sent to
`/login?redirect=/home`. The current beta path now starts with a real
session-backed login.

Before walking the full browser flow, confirm `http://127.0.0.1:3000/health`
and the API-scoped mirror `http://127.0.0.1:3000/api/health` both return
`{"service":"jixia-server","status":"ok"}` so you know the Node runtime and
API boundary are up before validating workbench behavior.

## Truthful beta acceptance flow

The full happy path, when the upstream PubMed request returns at least one result, is:

workbench entry -> Home project review check -> settings ready -> PubMed search -> personal import -> explicit project-source adoption -> project Reader evidence persistence -> explicit Reader evidence capture into private Notebook -> project page review check -> Project Doc creation/reopen -> selected evidence/citation trace verification -> restart -> reopen persisted state

Live PubMed is intentionally not backed by a synthetic fallback on `main`. Success
depends on upstream PubMed availability, current network access, and the runtime
configuration of the host. If **检索 PubMed** returns an empty result set or a
provider error, that is an acceptable degraded pass for the discovery slice as
long as the UI truthfully shows the empty/error state and does not fabricate a
paper. In that degraded path, record the failure/empty-result behavior, skip the
import/Reader/Project Doc subsequence that requires a real discovered source, and
continue validating startup, login, Settings persistence, `/health`,
`/api/health`, and restart behavior. When PubMed later returns a real result,
rerun the import persistence
steps below to validate the full vertical slice.

1. Open `http://127.0.0.1:3000` and confirm the browser is redirected to **登录**.
2. Keep the default lab user or choose another lab user, then click **进入工作台**.
3. Confirm the browser lands in **个人工作台** and that **Project review and attention** renders server-provided project review items or its server-provided empty state.
4. Open **设置**.
5. Confirm the page initially reports that no provider credential is configured and that the default import target is **Personal Library**.
6. If credential storage needs validation, enter a temporary fixture value in **Credential secret** and click **Save credential**. Credential plaintext is sent only to `/api/credentials`, not to the settings preference payload.
7. Keep the default import target on **Personal Library**, click **保存设置**, and confirm the page reports **Settings saved**.
8. Open **搜索**.
9. In **检索主题**, enter `tumor board biomarkers`, then click **检索 PubMed**.
10. If PubMed returns a real result card, click **导入到个人 Library**. If the
    page instead shows an empty-result or provider-failure message, treat that as
    the truthful no-fallback degraded path described above rather than a blocker
    for startup/runtime acceptance.
11. When a result was imported, open **Library** and confirm the imported paper is present on the Personal shelf.
12. In **Adopt personal source into project**, choose a visible target project, then click **Adopt into selected project** for the imported paper. This is the explicit boundary crossing that creates or reuses the server-owned project `LibraryEntry`; private notes and Notebook content stay personal.
13. Follow **Open target project library**, then click **Open reader** for the adopted project source. Confirm the metadata-only asset message is shown when no server-owned file has been uploaded for that entry.
14. In the project **Reader**, enter a short reader excerpt quote plus offsets/locator, then click **Save reader excerpt**.
15. Enter a short private note into **Private note draft**, then click **Save private note**.
16. Enter a short project-visible comment into **Project comment draft**, then click **Save project comment**.
17. Click **Generate insight** / **Save insight** to persist a governed Reader insight backed by the project-scoped source.
18. Confirm the saved reader excerpt, private note, project comment, and governed insight remain visible in the paper workspace.
19. Click **Send latest excerpt to Notebook** and/or **Send latest insight to Notebook**. This is an explicit Reader-to-Notebook capture request: the browser sends source identifiers only, while the server derives the actor from the session, verifies source access, writes an owner-only Notebook version, and normalizes citations.
20. Confirm the success message names the private **Reader evidence notebook**, then click **Open Notebook** if you want to inspect the captured private synthesis. The Notebook may show private capture notes because it remains owner-only.
21. Return to the project Reader and click **Use latest insight in Project Doc draft**. This creates or updates the server-owned Project Doc used as the project's shared knowledge center.
22. Open **Projects** and confirm the top-level list now loads real server-visible projects.
23. Open the same concrete project from the list, then confirm the selected-evidence Project Doc appears in **Project Docs 共享知识中心** and that the project page renders **Project review and attention** from the server workspace DTO.
24. Click **Open Project Doc**.
25. In **Project Doc editor**, confirm the **Citation trace** panel is visible. Before citations exist it truthfully shows an empty state; after saved citations it shows browser-safe source rows and availability/adoption-needed status without storage keys, checksums, private note text, or actor authority fields. The Project Doc page should describe selected Reader evidence, project Library citations, and reviewed references as the bridge from private work to shared knowledge.
26. Confirm **Notebook** remains a private synthesis surface: it can save and reload owner-only content, but it does not expose a foreground whole-Notebook Project Docs action or preserve Project Doc query intent.
27. If a citation source is not yet project-available, verify the UI shows the adoption-needed state and the explicit Project Library source-adoption path instead of fabricating source details.
28. In **Project Doc editor**, update **Draft content**, click **Save draft**, then click **Reload draft**.
29. Confirm the Project Doc editor reopens with the saved document content and citation trace still present.
30. Stop the server process and restart the app process with the same `.env` and `npm run start:server` command.
31. Reopen `http://127.0.0.1:3000`, return to **Library**, the project **Reader**, **Notebook**, and the same `/projects/:projectId` Project Doc route, and confirm:
     - the imported personal-library paper still exists
     - the project-adopted library source still exists
     - the saved reader excerpt still exists with its quote, offsets, and locator
     - the saved private note still exists only in the reader owner's private context
     - the saved project comment is visible to project members
     - the private Reader evidence Notebook still reopens for its owner
     - the Project Doc still reopens with saved selected evidence and citations
     - the Project Doc citation trace still shows browser-safe availability/adoption-needed state

## What this beta currently proves

- the workbench can start natively on the current host without Docker and answer
  both `/health` and `/api/health`
- settings persist through Prisma-backed workbench settings, while encrypted
  credential secret rows are created only through dedicated credential mutation
  payloads without exposing raw credential material in settings
- PubMed-backed discovery can import into Personal Library through the real server path when the upstream provider returns results; empty-result/provider-failure states are acceptable degraded outcomes and must not synthesize fallback papers
- Reader file availability is explicit: metadata-only imports do not pretend a
  file exists, while uploaded PDFs are read only through the session-authorized
  `GET|HEAD /api/library/:entryId/file` route
- the paper workspace persists a private note separately from a project-visible comment
- reader excerpts and governed insights can be explicitly captured into an owner-only private Notebook without browser-supplied actor or project authority
- private Notebook remains an owner-only synthesis surface; selected Reader evidence, citations, references, and explicit Project Library source adoption are the foreground bridge into Project Docs
- Project Docs expose a browser-safe citation trace with truthful empty, available, adoption-needed, and error states instead of leaking private Notebook bodies, Reader private notes, storage internals, or credential/authority metadata
- Home and project pages expose server-owned project review/attention read models without browser-side authority or visibility inference
- a governed insight can be used in a Project Doc draft and reopened after reload and process restart

## What still belongs to demo-native-showcase

The following are still demo-only convenience features and should not be confused with `main`’s product-truth beta path:

- deterministic reset helpers
- packaged runnable showcase bundles
- seeded showcase choreography around the legacy `/spaces/...` story
- operator/demo polish that exists only to help a reviewer evaluate the downstream demo branch

If you need those conveniences, switch to `demo-native-showcase`. If you need the product-truth browser path on the current host, stay on `main` and use this runbook.

## Manual walkthrough notes

Current-host pass completed on 2026-03-23 with `JIXIA_STORAGE_ROOT=/home/zhurui/.local/share/jixia-beta/storage` and the built app served from `npm run start:server`.

- The root route still redirects straight to `/home`, but unauthenticated browsers are now redirected into `/login?redirect=/home` and establish a real `jixia_session` cookie before entering the workbench.
- Live PubMed search returned a real result set for `tumor board biomarkers` during this manual pass; the first rendered identifier was `PubMed · pmid:38181798`. Future current-host passes may instead see an empty-result or provider-failure state depending on upstream/network conditions, and that degraded state is acceptable when the UI remains truthful and does not synthesize fallback titles.
- The top-level **Projects** page now loads real server-visible projects and links into canonical `/projects/:projectId` routes.
- Reopened Project Doc routes now stay on canonical `/projects/:projectId/writing/:docId` paths for the main workbench flow, while legacy `/spaces/...` routes remain compatibility-only deep links.
- Persistence itself worked cleanly after restart: the imported paper, private note, project comment, governed insight, and reopened Project Doc were all still present after the app process restarted.
