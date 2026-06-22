# Task 21b AI Chat Visual Refactor

## Goal

Make Jixia AI feel like a mature chat product instead of an operations console. The document copilot side panel and the standalone/full AI chat surface should share one conversation-first visual language: calm surfaces, readable transcript, rounded user bubbles, assistant prose, low-noise context metadata, and a polished composer.

## Background

Task21a delivered a functional document-scoped copilot with explicit context, server-owned provider keys, streaming, and no document writeback. Manual review confirmed provider configuration and successful AI conversation, but exposed the next real problem: the UI is ugly. It looks like a control panel because metadata, provider state, status pills, context cards, borders, and model bars dominate the interface.

ResearchClaw provides a useful local reference: a Notion-like palette, motion drawer, rounded chat bubbles, compact sidebar, and bottom floating composer. Mature open-source chat products point in the same direction: LobeChat for floating/side-panel chat, Open WebUI/Dify/AnythingLLM for full-height workspace chat, and LibreChat/Chatbot UI for composer layout.

## Requirements

- Refactor the document copilot inspector into a chat-first side panel.
- Refactor the standalone/full AI chat into a mature workspace chat surface.
- Introduce shared chat visual primitives or shared CSS conventions so both surfaces stop diverging.
- Keep provider/model/context/safety metadata visible but subordinate: chips, compact bars, collapsible drawers, or right/context rails are acceptable; dominant meta grids are not.
- Preserve existing AI runtime behavior: provider config loading, conversation creation, stream consumption, cancellation, copy/retry, source visibility, and error states.
- Preserve Task21a safety: no provider key exposure, no signed/object storage secret exposure, no AI writeback or auto-apply to documents.
- Avoid dependency churn. Do not add Tailwind, Framer Motion, or icon libraries unless the implementation proves they are necessary and worth the cost.

## Acceptance Criteria

- [ ] Document copilot first screen is conversation-first: title/header, compact context indicator, transcript, and bottom composer are visually dominant in that order.
- [ ] Full AI chat has a clear three-zone shape: conversation/history navigation, transcript, bottom composer; optional context/source details do not crowd messages.
- [ ] User messages render as right-aligned rounded bubbles; assistant messages render as readable prose with markdown/code/source support.
- [ ] Composer is visually modern: autosizing textarea, compact provider/model affordance, send/stop action, disabled reason, and keyboard submit.
- [ ] Safety/context state remains accessible and understandable without making the UI look like an admin console.
- [ ] Streaming, failed, cancelled, copied, retry, missing-provider, and empty-state visuals are polished and understandable.
- [ ] Existing focused tests for AI chat, document copilot, document editor, and app routing pass or are updated only for intentional visual/semantic changes.
- [ ] Manual review compares side-panel and full-page AI chat against the previous control-panel feel and records the result.

## Non-Goals

- No backend AI API changes.
- No provider-key storage/encryption changes.
- No document AI auto-apply, rewrite, insert, or mutation behavior.
- No broad app-wide redesign outside the AI chat/copilot surfaces unless necessary for shared tokens.
- No wholesale copying of ResearchClaw or third-party project code.

## Technical Notes

See `info.md` for implementation guidance and design references.
