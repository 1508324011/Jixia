# Task 18.2 Mature UI Research Supplement

## Research Conclusion

Mature workbench products converge on the same interaction structure: stable named regions, compact navigation, artifact-first center surfaces, contextual right-side conversation or inspector panes, and thin status/governance feedback. They do not make every route, object, toolbar, and message look like equal bordered action cards.

For Jixia, this confirms that Task 18.2 must correct composition and interaction hierarchy before adding Notebook, Search, or Library.

## Product Pattern Evidence

- VS Code-style workbenches use Activity Bar / Side Bar / Editor / Panel / Status Bar as stable containers. Sidebars are fast-switching/navigation surfaces, not explanatory card stacks.
- Zotero-style research tools organize work as collection tree / item list / metadata or note pane. Research objects need dense object browsers and detail panes.
- Notion-style document tools make the editor canvas visually dominant; block controls, comments, and AI affordances are contextual or hover/inline, not permanent card chrome around every block.
- Cursor/Copilot/ChatGPT/Claude-style AI surfaces center on a bottom composer, context attachments/chips, message history, streaming/stop/retry/error states, and provider/model metadata as secondary context.
- Slack/GitHub/Linear-style collaboration surfaces keep comments, threads, checks, status, properties, and ownership attached to artifacts without turning the artifact into a dashboard of cards.

## Task 18.2 Implications

- Sidebar: compact labels/icons/active indicator, no always-visible route descriptions; `Setting` stays bottom-pinned.
- Main surfaces: rows, explorers, metadata strips, and pane boundaries should replace boxed list/card rhythms.
- Document editor: writing canvas must dominate; block insertion and block controls should become lightweight/contextual where practical.
- AI copilot: the right pane must become conversation-first: current thread, bottom composer, context chips, session/history affordance, send/loading/stop/error/retry states.
- Governance: server-owned truths such as draft state, archived/read-only, conflicts, provider availability, explicit context, and no-writeback should appear as short status cues, not large policy cards.

## Non-Goals Confirmed

- Do not build a full design system, command palette, dock manager, tab framework, Notebook, Search, or Library in this task.
- Do not add AI writeback, generated document persistence, hidden context expansion, or new backend contracts.
- Do not weaken server-first authorization, AI key secrecy, attachment signed URL safety, draft/revision separation, or human-only conflict handling.

## Verification Focus

Task 18.2 should still verify through focused web tests and build:

- `pnpm --filter @jixia/web test`
- `pnpm --filter @jixia/web build`

If labels or UI structure change, update tests to match intentional interaction changes only. Do not remove behavior checks around auth/session, draft autosave, formal revision save, conflict handling, archived read-only state, AI no-writeback, provider key secrecy, or attachment upload/download safety.
