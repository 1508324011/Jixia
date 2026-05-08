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

The current runtime persists its beta state to `server-state.json` under `JIXIA_STORAGE_ROOT`.

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

## Truthful beta acceptance flow

The required flow is:

workbench entry -> settings ready -> PubMed search -> personal import -> Reader persistence -> Writer promotion -> Writer reopen -> restart -> reopen persisted state

1. Open `http://127.0.0.1:3000` and confirm the browser is redirected to **登录**.
2. Keep the default lab user or choose another lab user, then click **进入工作台**.
3. Confirm the browser lands in **个人工作台**.
4. Open **设置**.
5. Confirm the page initially reports **API key not configured**.
6. Enter a temporary browser-side value in **API Key**, keep the default import target on **Personal Library**, then click **保存设置**.
7. Confirm the page reports **Settings saved**.
8. Open **搜索**.
9. In **检索主题**, enter `tumor board biomarkers`, then click **检索 PubMed**.
10. Wait for the PubMed-backed result card and click **导入到个人 Library**.
11. Open **Library** and confirm the imported paper is present on the Personal shelf.
12. Click **Open reader** on that imported paper.
13. In **Reader**, enter a short private note into **Private note**, then click **Save private note**.
14. Enter a short project-visible comment into **Project comment**, then click **Save project comment**.
15. Enter a short governed summary into **Insight summary**, then click **Save insight**.
16. Confirm the saved private note, project comment, and governed insight remain visible in the paper workspace.
17. Click **Promote latest insight to Writer**.
18. Open **Projects** and confirm the top-level list now loads real server-visible projects.
19. Open a concrete project from the list, then confirm the promoted draft preview appears in **Writer 文档区**.
20. Click **打开 Writer 文稿**.
21. In **Writing**, update **Draft content**, click **Save draft**, then click **Reload draft**.
22. Confirm the Writer view reopens with the saved draft content still present.
23. Stop the server process and restart the app process with the same `.env` and `npm run start:server` command.
24. Reopen `http://127.0.0.1:3000`, return to **Library**, **Reader**, and the same `/projects/:projectId` route, and confirm:
     - the imported personal-library paper still exists
     - the saved private note still exists
     - the saved project comment still exists
     - the promoted Writer draft still reopens with its saved content

## What this beta currently proves

- the workbench can start natively on the current host without Docker
- settings persist without exposing raw API keys in browser payloads
- PubMed-backed discovery can import into Personal Library through the real server path
- the paper workspace persists a private note separately from a project-visible comment
- a governed insight can be promoted into Writer and reopened after reload and process restart

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
- Live PubMed search returned a real result set for `tumor board biomarkers`; the first rendered identifier in this pass was `PubMed · pmid:38181798`, so the current-host experience is no longer tied to the deterministic fallback titles used in tests.
- The top-level **Projects** page now loads real server-visible projects and links into canonical `/projects/:projectId` routes.
- Reopened Writer routes now stay on canonical `/projects/:projectId/writing/:docId` paths for the main workbench flow, while legacy `/spaces/...` routes remain compatibility-only deep links.
- Persistence itself worked cleanly after restart: the imported paper, private note, project comment, governed insight, and reopened Writer draft were all still present after the app process restarted.
