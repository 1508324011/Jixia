# Task 18.6 Research Notes

## Audit Input

Task 18.5 solved the server-first AI foundation and safe render contracts, but the product audit found the right copilot still feels like a pile of controls. The next task should fix surface anatomy: resizable, thread-first, source-grounded, artifact-aware.

## Jixia Current Facts

- `AIConversationPanel.tsx` is still a large local-state component with header buttons, explicit context surface, overlay history, message cards, and form-like composer.
- `DocumentEditorPage.tsx` mounts it inside `WorkspaceMainSplit` with a fixed `430px` inspector width.
- `workbench.css` defines `.jixia-ai-copilot` as a five-row grid: header, notice, context, body, composer.
- Task 18.5 added useful pieces: launchpad, context chips, source cards, run cards, rich message parts, no fake Stop, no Apply/writeback.
- The gap is not safety. The gap is product anatomy.

## Reference Patterns

- Local screenshot `copilot1.png`: spacious launchpad, greeting, capability cards, command hints, model/context controls, rounded composer.
- Local screenshot `copilot2.png`: source chip row, rich research answer, table/prose structure, compact sticky composer.
- ResearchClaw: wider drawer, session sidebar, reader/chat split mode, autosizing composer, attached source chips, message stream, tool/permission cards, robust Markdown.
- assistant-ui: thread viewport plus sticky composer and resizable assistant sidebar.
- Vercel AI SDK UI: message parts, source/document parts, attachments, streaming/cancel only when runtime supports them.
- CopilotKit: configurable sidebar shell/slots.

## Do Not Copy

- ResearchClaw Electron IPC transport.
- Local CLI/cwd execution assumptions.
- Prompt concatenation of local file/paper text as browser behavior.
- Fake Stop/cancel without server endpoint.
- Apply/insert/rewrite controls without a real server approval and document mutation contract.

## Practical 18.6 Shape

The minimum good solution is not a grand chat framework. It is a clean Jixia-specific surface with these facts encoded once:

1. active document-scoped thread
2. selected source set
3. typed assistant messages/research briefs
4. optional suggestion-only artifact preview
5. safe actions
6. sticky command composer
7. stable history surface
