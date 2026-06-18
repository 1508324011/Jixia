# Task 18.6 Technical Preparation

## Core Judgment

Task 18.6 is a surface-model refactor, not visual sugar. The current `AIConversationPanel` already has safer contracts from Task 18.5, but it still renders as stacked controls because the layout data is wrong: inspector width, context block, thread, history overlay, and composer all compete at the same level.

The implementation should first decide the stable UI data structures, then split/render them cleanly.

## Target Data Relationships

- `CopilotSurface`: open/closed or launchpad/thread/history state plus available width/mode.
- `Thread`: active conversation metadata, messages, run status, failure state, and message actions.
- `SourceSet`: current document, selected blocks, manual notes, and per-message/run sources. Sources belong to messages/runs when provenance matters; do not derive old answer sources from mutable current context.
- `ComposerState`: prompt text, selected provider/model, quick command, context count, send disabled reason, keyboard behavior.
- `ArtifactPreview`: optional suggestion-only output shape for drafts/research briefs/proposals. It must not mutate documents.

If these relationships are clean, the UI becomes simpler. If components keep sharing one large pile of local booleans and form fields, the refactor will fail.

## Implementation Direction

1. Split the current monolith by product responsibility only where it reduces state coupling:
   - surface shell/layout
   - launchpad
   - thread viewport
   - message/research brief renderer
   - source set/chips/drawer
   - composer
   - history drawer/list
2. Rework layout before adding new controls. More buttons are not a copilot.
3. Keep governance visible as status chips/copy, not as the product's dominant visual hierarchy.
4. Prefer existing Task 18.5 DTOs. Extend shared/API contracts only if a required UI fact cannot be represented safely.
5. Keep any new DTO field transport-safe and server-projected. Browser code must not infer authorization or construct provider-sensitive state.
6. Treat screenshots and ResearchClaw as UI grammar references. Do not copy Electron IPC, local CLI execution, cwd, or prompt concatenation patterns.

## Key Existing Weak Points

- `apps/web/src/features/documents/DocumentEditorPage.tsx` mounts the copilot in a fixed inspector-width slot.
- `apps/web/src/features/layout/workbench.css` defines the copilot as a five-row grid, reinforcing stacked-block UX.
- `apps/web/src/features/ai/AIConversationPanel.tsx` owns orchestration, context editing, history, message rendering, markdown parsing, and composer state in one file.
- Context is over-exposed above the thread; mature UIs make selected sources visible but quiet.
- Composer is a form. Mature UIs make it a command surface.
- History is an absolute overlay. Mature UIs make it stable memory/navigation.
- Message rendering is generic. Research workflows need answer/source/artifact semantics.

## Safety Rules

- No document mutation controls.
- No fake Stop/cancel.
- No fake streaming.
- No browser provider calls.
- No provider keys, raw provider payloads, signed URLs, stack traces, or server-private runtime state in browser DTOs.
- No localStorage/sessionStorage for prompts, responses, context bodies, or provider data.
- Existing owner-only/private conversation behavior remains intact.

## Suggested Implementation Order

1. Read required Trellis specs and Task 18.5 docs.
2. Map current component state into the target relationships above.
3. Create or split presentational components without changing behavior.
4. Change layout anatomy to thread-first/resizable work surface.
5. Upgrade launchpad/composer/source/history presentation.
6. Add artifact-aware/research-brief rendering only where supported by safe data.
7. Update focused tests after each behavior/layout boundary.
8. Run focused web tests, then broader checks required by touched layers.

## Verification Focus

- Empty launchpad and active thread states are distinct.
- Context/source chips are visible without dominating the surface.
- Composer sends the same server-owned request path as before.
- No forbidden controls appear.
- Old conversations and Task 18.5 message parts still render.
- The UI does not introduce provider/network/storage/security regressions.
