# Task 21d Manual Review Checklist

## Environment

- Web origin: http://127.0.0.1:41747
- API origin: http://127.0.0.1:41037
- Browser/device: Playwright Chromium, 1366x900 viewport
- Provider config used: Task21d Fixture Provider (`openai`, `task21d-review-model`, `hasKey: true`; raw key not captured in evidence)
- Reviewed at: 2026-06-22T15:06:07.636Z
- Result: passed

## Context Control

- [x] Document copilot shows an explicit `Include current document` control.
- [x] User can turn document context off before sending.
- [x] UI makes clear that context is attached per message when enabled.
- [x] Context-on network request includes non-empty current-document snapshot items.
- [x] Context-off network request sends empty context (`items: []`) or equivalent explicit empty snapshot.
- [x] First conversation creation respects the same on/off state.
- Notes/evidence:
  - Browser review used the local E2E API fixture plus Vite on free ports and saved sanitized evidence to `/tmp/opencode/task21d-review-evidence.json`.
  - Context-on document copilot create request: `selectedContextSnapshot.currentDocumentId = "document-2"`, `items.length = 1`, `sourceTypes = ["current_document"]`, content length `364`, bounded document text present, no forbidden secret text.
  - Context-on document copilot stream request: `selectedContextSnapshot.currentDocumentId = "document-2"`, `items.length = 1`, `sourceTypes = ["current_document"]`, content length `364`, bounded document text present, no forbidden secret text.
  - Context-off document copilot create request: `selectedContextSnapshot.currentDocumentId = "document-3"`, `items.length = 0`, source list empty, disabled document text absent.
  - Context-off document copilot stream request: `selectedContextSnapshot.currentDocumentId = "document-3"`, `items.length = 0`, source list empty, disabled document text absent.
  - Standalone AI create and stream requests used `currentDocumentId: null` with `items.length = 0`.

## Document Copilot Visual Dechrome

- [x] First impression reads as compact chat panel, not a metadata grid.
- [x] Full context preview is hidden behind progressive disclosure by default.
- [x] Context/provider/safety metadata remains discoverable and auditable.
- [x] Composer remains usable at inspector width and feels like one rounded chat control.
- [x] No apply, insert, rewrite, automerge, or document mutation affordance appears.
- Notes/evidence:
  - Screenshot evidence: `/tmp/opencode/task21d-document-context-on.png` and `/tmp/opencode/task21d-document-context-off.png`.
  - The context details disclosure was closed by default (`contextDetailsOpenByDefault: false`) and the visible row showed the context state instead of a dominant mandatory card.
  - The explicit toggle defaulted on and successfully switched off before sending (`contextToggleDefaultChecked: true`, `contextToggleOffWorked: true`).
  - Provider-missing state was browser-observed before fixture provider creation (`providerMissingVisible: true`).
  - Browser review found `0` apply/insert/rewrite/merge/automerge/replace mutation controls.

## Standalone AI Visual Dechrome

- [x] First impression reads as mature chat workspace, not settings/workbench.
- [x] Runtime/provider/refresh/settings controls are compact or hidden behind menu/disclosure.
- [x] Sidebar/history is restrained and not policy-heavy.
- [x] Transcript remains centered/readable and composer remains sticky.
- [x] Standalone AI still starts without current-document context.
- Notes/evidence:
  - Screenshot evidence: `/tmp/opencode/task21d-standalone-ai.png`.
  - The standalone controls disclosure was not open by default (`controlsOpenByDefault: false`).
  - A forced new standalone thread created a conversation with `currentDocumentId: null` and streamed with `selectedContextSnapshot.items = []`.
  - The representative standalone response rendered markdown prose, a table, and a code block inside the centered transcript/composer layout.

## Sources / Errors / Streaming

- [x] Source details are shown as quiet chips/disclosures, not dominant cards.
- [x] Long answer, markdown, code, table, and source states remain readable.
- [x] Missing-provider/error states are understandable without dominating normal chat.
- [x] Streaming/cancelled/copied/retry states remain visible and consistent.
- [x] Provider keys, signed URLs, object keys, buckets, cookies, and secrets are not exposed.
- Notes/evidence:
  - Context-on document answer exposed source detail as a quiet `1 source` disclosure.
  - Browser review exercised streaming-to-final fixture responses; focused tests cover cancelled, copied, retry, CRLF stream parsing, failed stream, and no-writeback states.
  - The safety scan recorded no browser `Authorization` headers on API requests, empty `localStorage`, empty `sessionStorage`, hidden HttpOnly session cookie, no forbidden mutation controls, no forbidden visible secret text, and no browser console errors.
  - Evidence summary: `/tmp/opencode/task21d-review-evidence.json`; screenshots: `/tmp/opencode/task21d-document-context-on.png`, `/tmp/opencode/task21d-document-context-off.png`, `/tmp/opencode/task21d-standalone-ai.png`.

## Pass / Fail

- Result: passed
- Reviewer: GPT-5.5 Debug Agent with Playwright Chromium browser/network review
- Reviewed at: 2026-06-22T15:06:07.636Z
- Required follow-up: None for Task21d acceptance. The E2E fixture currently returns document conversations from unfiltered `/api/ai/conversations`, so the browser review explicitly used `New chat` before the standalone send; the real API service path remains covered by focused tests for standalone context-free conversations.

Prepared at: 2026-06-22T13:51:30+00:00
