# Task 21c Manual Review Checklist

## Environment

- Web origin: http://127.0.0.1:56174/
- API origin: Playwright route mocks for representative AI/document responses
- Browser/device: Playwright Chromium, 1366x900 viewport
- Provider config used: mocked safe `AIProviderConfigView` with `hasKey: true`; no raw provider key material in browser
- Reviewed at: 2026-06-22T15:31:00+00:00
- Result: passed with representative mocked stream conversations

## Standalone AI Workspace

- [x] First impression reads as a mature chat workspace, not a settings/control panel.
- [x] Sidebar/history is restrained and product-like.
- [x] Transcript is centered/readable and does not sprawl full width.
- [x] Normal answer, long answer, code/table, source, and streaming-to-final states are visually coherent; cancelled, copied, retry, error, and missing-provider states remain covered by focused component tests and code review.
- [x] Composer is one rounded control surface with send/stop, keyboard submit, disabled reasons, provider/model visibility, and autosizing behavior.
- Notes/evidence:
  - Browser review loaded `/ai`, sent a representative prompt, and received a mocked stream containing a user bubble, assistant markdown prose, table, code block, source chip, and run-step chip.
  - Screenshot evidence: `/tmp/opencode/task21c-standalone-ai.png`.
  - Layout measurements recorded a restrained three-zone workspace: history/sidebar `292px`, centered transcript column `582px`, compact right-aligned user bubble width `430.7px`, assistant prose width `582px`, and rounded composer radius `24px`.
  - Source and run details stayed subordinate as quiet chips/cards (`1 source`, `1,248 tokens used`) instead of dominating the answer.

## Document Copilot Side Panel

- [x] First impression reads as a compact chat panel, not a metadata grid.
- [x] Context/provider/document/safety metadata is accessible but visually subordinate.
- [x] User bubble and assistant prose match standalone visual grammar.
- [x] Composer remains usable at inspector width.
- [x] AI output remains advisory/copyable and does not mutate the document automatically.
- Notes/evidence:
  - Browser review loaded `/projects/project-visual/documents/doc-visual`, showed the real document editor plus inspector copilot, and sent a representative document-scoped prompt with mocked bounded current-document context.
  - Screenshot evidence: `/tmp/opencode/task21c-document-copilot.png`.
  - Context rendered as a compact disclosure card showing `Current document snapshot`, `project`, `4 / 4`, and `3 blocks`; it did not become the dominant visual grid.
  - User bubble width was `425.7px`; assistant prose width was `495px`, matching the compact side-panel chat grammar.
  - Playwright found `0` apply/insert/rewrite/automerge buttons, confirming no visible document mutation affordances.

## Source / Context / Safety Disclosure

- [x] Source/context/tool details are discoverable through quiet chips/details/drawers/subrows.
- [x] Provider key material, signed URLs, object storage keys, buckets, and secrets are not exposed in the browser UI or storage.
- [x] Error and disabled states are understandable without dominating successful conversation UI.
- Notes/evidence:
  - Browser review observed source details as a quiet `1 source` disclosure in both standalone and document copilot surfaces.
  - Security review passed with no provider-key exposure, direct provider calls, dangerous HTML sinks, or storage persistence in the reviewed chat/copilot paths.
  - Focused tests continue to cover missing-provider, cancel, retry/copy, failed stream, and no-writeback states.

## Pass / Fail

- Result: passed
- Reviewer: GPT-5.5 finish pass with Playwright Chromium visual review
- Reviewed at: 2026-06-22T15:31:00+00:00
- Required follow-up: Human product review may still tune taste, but Task21c acceptance now has browser-observed representative conversations for both surfaces.

Prepared at: 2026-06-22T05:45:55+00:00
Updated at: 2026-06-22T15:31:00+00:00
