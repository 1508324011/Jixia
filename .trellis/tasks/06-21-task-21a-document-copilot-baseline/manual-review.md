# Task 21a Manual Review Checklist

## Environment

- Web origin: http://10.128.253.195:5173
- API origin: http://10.128.253.195:4174
- Browser/device: remote browser via LAN review stack
- Provider config used: user-configured server-owned provider
- Document type tested: document copilot manual review path
- Reviewed at: 2026-06-22T02:20:36+00:00
- Result: passed-with-follow-up

## Notebook Document

- [x] Copilot panel is visible in the document inspector.
- [x] Placeholder text telling users to open standalone chat is gone.
- [x] Context card shows the current document title/id/revision/status.
- [x] User can send a prompt.
- [x] Assistant response streams/responds in the inspector.
- [x] Document body does not change after AI response. Covered by Task21a automated/finish checks and retained as a manual assertion.
- [x] Draft autosave/formal save still behave normally. Covered by Task21a automated/finish checks.
- Notes/evidence: User confirmed successful provider configuration and AI conversation. Visual quality is not acceptable yet and is split to Task21b.

## Project Document

- [x] Same copilot panel appears. Covered by Task21a implementation and focused tests.
- [x] Same context visibility behavior works. Covered by Task21a implementation and focused tests.
- [x] User can send a prompt and receive a stream. Functional path confirmed manually; project parity covered by automated/finish checks.
- [x] Document body does not change after AI response. Covered by Task21a no-writeback checks.
- [x] Save/refresh/reopen still works. Covered by Task21a focused document-save checks.
- Notes/evidence: Project-specific manual visual pass remains part of Task21b visual review, not Task21a functional baseline.

## Error and Setup States

- [x] Missing provider state is clear and actionable.
- [x] Stream error state is visible and does not corrupt document state.
- [x] Running/cancelled/done states are understandable functionally.
- Notes/evidence: User reached successful provider setup and conversation after local DB/API review-stack repair. Visual presentation of these states needs Task21b.

## Safety Spot Check

- [x] Browser never sees provider API key material.
- [x] Context display does not expose signed attachment URLs, object keys, buckets, or storage secrets.
- [x] Persisted document snapshot does not include AI response unless manually typed/pasted by reviewer.
- Notes/evidence: Covered by Task21a check/finish agents and retained as a required invariant for Task21b.

## Pass / Fail

- Result: passed-with-follow-up
- Reviewer: user manual review
- Reviewed at: 2026-06-22T02:20:36+00:00
- Required follow-up: Task21b AI chat visual refactor. The current AI side panel and full workspace chat feel like control panels, not mature chat surfaces.
