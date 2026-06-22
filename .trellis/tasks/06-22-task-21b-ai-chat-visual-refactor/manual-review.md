# Task 21b Manual Review Checklist

## Environment

- Web origin: `http://127.0.0.1:46184`
- API origin: `http://127.0.0.1:46185`
- Browser/device: Playwright Chromium, 1366x900 viewport
- Provider config used: mocked safe `AIProviderConfigView` with `hasKey: true`; no raw provider key material in browser
- Reviewed at: 2026-06-22
- Result: passed-with-follow-up

## Human Follow-up Review

- Reviewed at: 2026-06-22T05:45:55+00:00
- Result: passed-with-follow-up
- Provider configuration and local conversation succeeded in the LAN fixture environment.
- Human visual review still judged the AI chat surfaces too ugly/immature versus ResearchClaw and mature OSS chat products.
- Required follow-up: `.trellis/tasks/06-22-task-21c-ai-chat-visual-maturity-pass`.

## Document Copilot Side Panel

- [x] The first impression is chat-first, not control-panel-first.
- [x] Context is visible but compact or collapsible.
- [x] User message appears as a readable right-aligned bubble.
- [x] Assistant response appears as readable prose with markdown/code support.
- [x] Composer is visually polished and usable in the inspector width.
- [x] Provider/model and disabled states are understandable without dominating the UI.
- [x] Send/stream/stop/error/copy/retry states remain usable.
- [x] AI response does not mutate the document body automatically.
- Notes/evidence:
  - Browser review used real E2E document creation/navigation with only `/api/ai/**` mocked to return safe provider metadata and document-scoped conversation messages.
  - The side panel rendered header, compact bounded context, transcript, and bottom composer in that order; metadata stayed in pills/details rather than a dominant grid.
  - Screenshot evidence: `/tmp/opencode/task21b-document-copilot.png`.

## Full / Standalone AI Workspace

- [x] Chat history/sidebar looks like a product sidebar, not a table/list admin panel.
- [x] Transcript has mature spacing, readable max-width, and clear user/assistant hierarchy.
- [x] Composer is fixed/anchored appropriately and feels like a chat input.
- [x] Empty state invites conversation instead of reading like a system status page.
- [x] Missing provider, failed stream, cancelled run, and copied states remain visible.
- Notes/evidence:
  - Browser review verified the three-zone workspace: conversation history/sidebar, readable transcript, and bottom composer.
  - Focused Vitest coverage verifies missing-provider, stream, cancel, copied, retry, markdown/code/table, and no-document-context states.
  - Screenshot evidence: `/tmp/opencode/task21b-standalone-ai.png`.

## Safety and Regression Spot Check

- [x] Browser still never exposes provider API key material.
- [x] Context display still avoids signed URLs, object keys, buckets, and storage secrets.
- [x] Existing document save/refresh/reopen flows still work.
- [x] Standalone AI chat remains usable.
- [x] Notebook and Project document copilot parity is retained.
- Notes/evidence:
  - Browser review checked visible body text and browser storage for provider/storage secret-like strings; none were present.
  - Focused Playwright guard `apps/web/e2e/document-save.spec.ts` passed on alternate ports and confirmed no AI writeback beyond allowed copilot bootstrap requests.
  - `DocumentEditorPage` now mounts the same `DocumentCopilotPanel` for Project and Notebook document routes.

## Pass / Fail

- Result: passed-with-follow-up
- Reviewer: Finish Agent + human visual follow-up
- Reviewed at: 2026-06-22
- Required follow-up: Task21c must perform a stricter visual maturity pass. Task21b remains functionally accepted, but its UI is not yet good enough for product-quality chat.
