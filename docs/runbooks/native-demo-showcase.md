# Native Demo Showcase Runbook

This runbook resets the branch to a deterministic server-backed demo and walks a reviewer through the strongest truthful browser story now available on `demo-native-showcase`: create a new space, import into it, read inside it, write inside it, restart the app, and reopen the same work. The branch runs natively on Node, uses user-owned storage, and avoids Docker or sudo for the showcase path.

## Runtime contract

Use user-owned runtime paths so the demo can be reproduced on the current host:

- `JIXIA_STORAGE_ROOT=/home/zhurui/.local/share/jixia-demo/storage`
- `JIXIA_DATABASE_URL=file:/home/zhurui/.local/share/jixia-demo/data/jixia-demo.db`

The deterministic walkthrough keeps these reproducible anchors:

- project route: `tumor-board`
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

After startup, open the local server in the browser and begin at `/spaces`.

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

Create Space -> Library -> Reader -> Writing

1. Open **Spaces** and confirm the page loads from `/spaces`.
2. In the create form, enter **Space name** = `Genomics Sandbox`, keep **Space kind** = `personal`, then click **Create space**.
3. Confirm the new space card appears and click **Open library**.
4. In **Library**, leave **Source type** on `pmid`, replace **Import locator** with `654321`, then click **Import paper**.
5. Repeat with **Import locator** = `789012` and confirm both imported entries appear in the created space without leaving the page.
6. Click **Open reader** on `Imported PMID paper 789012`.
7. In **Reader**, type a short note into **Note body**, click **Save note**, type a short governed summary into **Insight summary**, then click **Save insight**.
8. Click **Refresh reader** and confirm the saved note and insight remain visible after the fresh fetch.
9. Click **Open writing**.
10. In **Writing**, edit **Draft content**, click **Save draft**, then click **Reload draft** and confirm the saved content persists after the reload.
11. Click **Publish** and confirm the publish state changes to `published` inside the created space.
12. Restart the app process, reopen `/spaces`, navigate back into `Genomics Sandbox`, and verify the imported papers plus the published writing state still exist after restart.
13. Optionally click **Run governed summary** to show the governed job finale with queued/running/succeeded events and audit records.

## What this demo proves

- the native reset path restores a known server-owned state
- a reviewer can create a real space instead of being forced through one seeded shared-space corridor
- imported library entries accumulate inside the created space and can be reopened later
- reading and writing mutations remain visible after refresh, reload, and process restart
- the governed job finale leaves audit-visible artifacts without exposing raw secrets in the browser payload

## Why operator support is next

This branch is intentionally a native single-host showcase, not the final operator story. It now proves the core usable-demo loop across spaces, library, reader, and writing with user-owned paths, but a production handoff still needs controlled operator support around service supervision, persistent directories, secret provisioning, backups, and optionally Docker or other managed runtime packaging. The next operational step is to turn this working created-space demo path into a repeatable operator-owned deployment contract rather than asking reviewers to run the app manually.
