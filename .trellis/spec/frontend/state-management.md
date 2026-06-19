# State Management Guidelines

Initial MVP constraints:

- Autosave updates drafts only.
- Manual save creates revisions only through the API.
- Conflict resolution is explicit and manual.

## Document Editor Runtime Boundary

- Document pages own server lifecycle state: load, title, base revision, dirty state, draft autosave, formal revision save, conflict display, route context, and archived/read-only mode.
- Editor runtimes own DOM editing state: selection, cursor movement, keyboard behavior, undo/redo, paste/drop normalization, block commands, runtime history, and import/export between runtime documents and Jixia snapshots.
- Do not model long-form document editing as a fully controlled React textarea/block stack for production editor work. The page may receive exported snapshots for autosave, but the runtime must remain authoritative for editing behavior.
- Keep Notebook and Project document editing behind one shared editor boundary. Do not fork editor state machines by route unless a future PRD explicitly approves it.
- Before formal revision save, export the latest snapshot from the runtime/adapter handle rather than trusting that React state is already synchronized with the most recent editor transaction.
- Read-only mode must be passed into the runtime and must disable document and attachment mutations while preserving selection, copy, and safe attachment-open behavior.
- AI panes may receive explicit read-only context snapshots, text, or selected block identifiers, but must not receive editor mutation handles or write document content without a future server-authorized writeback contract.
