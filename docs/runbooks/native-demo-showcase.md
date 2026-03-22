# Native Demo Showcase Runbook

This runbook resets the branch to a deterministic server-backed demo and walks a reviewer through the exact browser story in under ten minutes. The branch runs natively on Node, uses user-owned storage, and avoids Docker or sudo for the showcase path.

## Runtime contract

Use user-owned runtime paths so the demo can be reproduced on the current host:

- `JIXIA_STORAGE_ROOT=/home/zhurui/.local/share/jixia-demo/storage`
- `JIXIA_DATABASE_URL=file:/home/zhurui/.local/share/jixia-demo/data/jixia-demo.db`

The deterministic walkthrough assumes these fixed demo anchors:

- shared space: `shared-space`
- project route: `tumor-board`
- reproducible import anchor: `pmid:123456`
- deterministic writing document: `doc-1`

## Reset and startup

```bash
cp .env.example .env
npm install
npm run build
npm run demo:reset
npm run start:server
```

After startup, open the local server in the browser and begin at `/spaces`.

## Showcase flow

Shared Space -> Import Paper -> Reader -> Writing

1. Open **Spaces** and confirm the seeded shared card shows `shared-space`, `tumor-board`, and `pmid:123456`.
2. Click **Enter shared space**.
3. In **Library**, confirm the seeded entry `Imported PMID paper 123456` is already present.
4. Leave **Source type** on `pmid`, replace **Import locator** with `654321`, then click **Import paper**.
5. Confirm the new entry `Imported PMID paper 654321` appears without leaving the page. The import remains deterministic because the server uses seeded connectors rather than live external API calls.
6. Click **Open reader** on either imported entry.
7. In **Reader**, type a short note into **Note body**, click **Save note**, type a short governed summary into **Insight summary**, then click **Save insight**.
8. Click **Refresh reader** and confirm the saved note and insight remain visible after the fresh fetch.
9. Click **Open writing**.
10. In **Writing**, edit **Draft content**, click **Save draft**, then click **Reload draft** and confirm the saved content persists after the reload.
11. Click **Publish** and confirm the publish state changes to `published`.
12. Optionally click **Run governed summary** to show the governed job finale with queued/running/succeeded events and audit records.

## What this demo proves

- the native reset path restores a known server-owned state
- browser pages are reading and mutating truthful server data rather than placeholders
- reading and writing mutations remain visible after refresh or reload
- the governed job finale leaves audit-visible artifacts without exposing raw secrets in the browser payload

## Why operator support is next

This branch is intentionally a native single-host showcase, not the final operator story. It proves that Jixia can run truthfully on a lab server with user-owned paths, but a production handoff still needs controlled operator support around service supervision, persistent directories, secret provisioning, backups, and optionally Docker or other managed runtime packaging. The next operational step is to turn this working demo path into a repeatable operator-owned deployment contract rather than asking reviewers to run the app manually.
