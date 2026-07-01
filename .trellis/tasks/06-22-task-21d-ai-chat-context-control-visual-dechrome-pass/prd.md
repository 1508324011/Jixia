# Task 21d AI Chat Context Control + Visual Dechrome Pass

## Goal

Give users explicit control over whether document content is sent to AI, and remove the remaining visible control-panel chrome from Jixia's AI chat surfaces.

Task21c made the chat surfaces coherent and browser-reviewed, but human follow-up still found two root problems: the document copilot silently attaches current-document context on every message with no opt-out, and the UI still overexplains itself with headers, status rows, provider/runtime labels, context cards, and composer metadata. Task21d must fix behavior and first impression together.

## Current Behavior to Change

1. Document Copilot sends current document context on every message.
   - `DocumentCopilotPanel.sendMessage` builds a fresh `createDocumentCopilotContext(...)` snapshot for each send.
   - The stream request includes `selectedContextSnapshot` each time.
   - If the conversation is created on first send, the create request also includes a snapshot, but subsequent sends still send a fresh snapshot.

2. The user cannot turn document context off.
   - Default-visible labels say `Current-document context only` / `Current document only`.
   - The context card is mandatory and says `Context attached`.
   - There is no toggle or branch that sends an empty context snapshot.

3. The chat UI still feels visually overexplained.
   - Standalone AI has too many default-visible runtime/settings/refresh/context affordances.
   - The document copilot side panel shows header, provider/runtime, context card, notices, transcript, and composer metadata at once.
   - The composer still feels partly like a provider/config form instead of one calm chat control.

## Requirements

1. Add explicit document-context control.
   - Add an `Include current document` control for document copilot.
   - Default may remain on for usefulness, but the state must be visible and user-controlled.
   - When off, send an explicit empty context snapshot (`items: []`) for create/stream requests instead of the bounded document text.
   - Preserve document scoping and permission semantics; do not invent a backend bypass.
   - Make the current behavior understandable: context is per-message, not one-time.

2. Move document context from mandatory card to progressive disclosure.
   - Default view should show a small chip/control near the composer or header, e.g. `Document context · on · 3 blocks · 4/4`.
   - Full bounded preview belongs in details/drawer/popover, not a permanent panel row.
   - The off state must be visually obvious and must not imply hidden upload.

3. Dechrome standalone AI.
   - Hide or demote `Private runtime`, `No document context`, `Refresh`, `Configure providers`, and similar status copy from the default first impression.
   - Put provider/settings/refresh details behind compact icon/menu/disclosure affordances.
   - Keep history readable but less like a settings sidebar; prefer grouped/collapsible history if feasible.

4. Refactor the shared composer into one clean control surface.
   - Textarea remains the focus.
   - Context/model/provider/scope should be chips or compact menus, not permanent explanatory text.
   - Preserve keyboard submit, IME behavior, disabled reasons, send/stop affordance, and real run/cancel gating.

5. Add or reuse progressive source/context disclosure.
   - Assistant answers should keep compact `N sources` style affordances.
   - Document context details should share the same disclosure language where practical.
   - Avoid dumping source/context metadata into the main conversation body.

6. Preserve AI safety and document-editing contracts.
   - No browser direct calls to provider APIs.
   - No provider key, signed URL, object-storage key, bucket, cookie, authorization header, or raw secret exposure.
   - No AI output auto-apply, insert, rewrite, automerge, or draft/revision mutation behavior.
   - Standalone AI continues to start without document context.

7. Do not add dependency churn for aesthetics.
   - Use existing React, Mantine, CSS, BlockNote, and react-markdown stack.
   - Do not add Tailwind, Framer Motion, Lucide, Dify/Lobe/Open WebUI UI stacks, Ariakit, or Bits UI unless explicitly justified in the task output.

## Acceptance Criteria

- Document copilot has an explicit `Include current document` control.
- Browser/network review proves: context on sends a non-empty current-document snapshot; context off sends an empty snapshot or empty `items` array.
- The UI communicates that context is attached per message when enabled.
- The default document copilot view no longer has a mandatory dominant context card.
- Standalone AI first impression hides most runtime/provider/status chrome and reads as a chat product.
- Composer reads as one rounded chat control with context/model/provider controls demoted to chips/menus.
- Existing focused unit tests pass, and new/updated tests cover context on/off request bodies.
- Browser review covers standalone AI and document copilot with normal, long, markdown/code/table/source, error/missing-provider, streaming, cancelled, copied/retry states where practical.
- No backend/API/provider-key/document writeback contract is changed unless explicitly justified and tested.

## Non-Goals

- Do not replace the entire chat stack.
- Do not implement agentic document editing, auto-apply, or editor mutation.
- Do not make the document context toggle global account settings unless the design explicitly needs it.
- Do not remove safety/provider/context auditability; demote it accessibly.
- Do not create a PR unless a later Trellis action explicitly asks for it.
