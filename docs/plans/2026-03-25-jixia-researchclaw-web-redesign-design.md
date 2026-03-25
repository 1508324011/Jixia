# Jixia ResearchClaw-Style Web Redesign Design

**Goal:** Redesign the Jixia web workbench so it feels closer to ResearchClaw in shell density, reading continuity, and workbench composition while keeping Jixia's server-first ownership model and replacing the current question-driven notebook with a private Notion-like cloud document.

## Why this redesign exists

The current `demo-native-showcase` branch has already proven important foundational work:

- canonical `/home`, `/projects`, `/search`, `/library`, `/notebooks`, and `/projects/:projectId/...` routes
- clear browser-side boundaries between private notebook content and project-owned docs
- notebook-to-project projection into shared project references
- stable server-backed demo flows and green test/typecheck/build verification

That foundation is real, but the current web experience still does not match the intended workbench feeling.

Fresh live evidence on `http://127.0.0.1:3002` shows that:

- `Home`, `Search`, `Library`, `Reader`, and `Notes` still operate inside a visually narrow main surface around `754px` wide at a `1440px` viewport
- the UI still reads as stacked bordered panels instead of one continuous research workspace
- `Search` is source-grouped and page-aware, but still visually card-stacked rather than a dense triage surface
- `Library` is still closer to a narrow evidence desk than a serious inventory workbench
- `Reader` is still a metadata-first companion rather than a true reading surface
- `Notes` is still explicitly implemented as `Private notebook · question-driven synthesis`

Fresh source evidence confirms the structural causes:

- `src/web/styles/app.css` still defines `.page-shell { max-width: 1120px; }`
- `src/shared/contracts/reading.ts` still exports `defaultNotebookQuestionPrompts`
- `src/web/pages/notes-page.tsx` still builds the Notes surface around `NotebookQuestionList`, `activeQuestion`, and a plain `<textarea>`
- `src/web/pages/writing-page.tsx` also still uses a plain `<textarea>` for project docs

ResearchClaw is therefore useful here as a **shell and interaction reference**, not as the product ceiling:

- it uses a denser and wider workbench feel
- it keeps navigation compact and tool-like
- it treats paper reading as a serious working surface rather than a metadata card
- it presents notes more like a document/form surface than a prompt workflow

However, Jixia must not blindly copy ResearchClaw's local-first, paper-first, or desktop-only assumptions.

## Frozen design conclusions

### 1. ResearchClaw is a shell reference, not the product center

Jixia should borrow:

- wider and calmer workbench composition
- compact navigation and stronger workspace continuity
- a reader that behaves like an actual reading surface
- a less boxed, less panel-stacked visual rhythm

Jixia should reject:

- local-first personal research OS assumptions
- paper-bound notes as the main product center
- desktop-native chrome as the main web answer
- form-like question workflows as the notebook model

### 2. Notebook is fully private and document-first

Notebook is **not** project-owned.

Notebook is:

- fully private
- Notion-like in feeling
- summonable from the navigation, the reader, and any other relevant surface
- capable of collecting thinking across multiple papers and multiple AI discussions

Notebook is **not**:

- a question list
- a paper-bound child page
- a project-owned shared writing surface

The current `defaultNotebookQuestionPrompts` model is superseded by this decision.

### 3. Project Docs remains a separate project-owned cloud document

Project Docs remains:

- project-owned
- shared
- formal
- separate from the private notebook

The notebook can still project or rewrite material into project docs, but the two surfaces must remain semantically and ownership-wise distinct.

### 4. AI Workspace is global and independent

AI is not paper-owned and not notebook-owned.

The product should introduce a **global AI workspace**:

- a user can maintain one or more independent conversations
- a conversation can attach multiple papers as context
- a conversation can reference notebook content
- entering Reader should dock the current AI workspace on the right by default, but the AI workspace remains logically independent

This is different from a paper-scoped chat sidecar. The reader may show the AI session, but it does not own it.

### 5. Reader is a real reading page, not a metadata companion card

Reader should be redefined as:

- a real PDF/HTML reading surface
- editable in the sense that the reading page supports interaction while reading
- visually split between the reading pane and the docked AI workspace by default

Reader should **not** become responsible for extra workflow buttons such as mandatory push-to-notebook or push-to-AI actions. The user explicitly rejected expanding Reader into a workflow control console.

Reader is therefore a serious reading environment, while Notebook and AI remain separate first-class surfaces.

### 6. Search and Library are feeder surfaces, not the workbench center

`Search` and `Library` should be redesigned to feed papers into the working loop, not to become the final destination.

Their job is to:

- help the user find and reopen papers quickly
- make triage and curation dense and fast
- launch reading, notebook thinking, and project work naturally

They should stop feeling like static block pages.

## Interaction model after redesign

The redesigned workflow becomes:

1. discover or reopen a paper from `Search` or `Library`
2. open that paper in `Reader`
3. read the paper in a real PDF/HTML reading surface
4. continue discussing in the docked AI workspace on the right
5. open or summon the fully private notebook document when the user needs to synthesize across multiple papers
6. promote selected private material into `Project Docs` only when formal shared writing is intended

This means the system is organized around the following independent but linked surfaces:

- `Reader`
- `AI Workspace`
- `Notebook`
- `Project Docs`

They are strongly linked, but none of the first three is a child page of another.

## Surface-by-surface redesign intent

### Shell

- move away from "three loud columns and stacked bordered cards"
- make one dominant main canvas with denser navigation
- keep the right rail quieter and collapsible
- use lighter separators and less container-wall styling

### Search

- keep truthful source grouping where useful
- switch visual presentation toward denser rows or strips rather than stacked cards
- emphasize rapid scan, filters, and quick open/reopen actions

### Library

- become a broad corpus inventory surface
- make personal vs project context legible through context and actions, not ornamental modules
- optimize for opening Reader, Notebook, and Project Docs quickly

### Reader

- left: reading surface
- right: docked AI workspace by default
- fewer explanatory blocks and less metadata framing
- stronger "I am reading a paper" feeling

### Notebook

- replace prompt scaffolding with a continuous private document canvas
- allow optional inserted structures or templates, but do not make templates the page architecture
- ensure the notebook is reachable globally and summonable contextually

### Project Docs

- remain the project-owned formal writing surface
- eventually share a document foundation with the notebook while keeping ownership and visibility distinct

## Design guardrails

1. Do not copy ResearchClaw's product center.
2. Do not keep Jixia's question-driven notebook model.
3. Do not make Reader the owner of AI or Notebook state.
4. Do not collapse Notebook and Project Docs into one surface.
5. Do not solve this redesign with CSS polish alone.

## What the first wave must prove

The first redesign wave is successful when a user can truthfully experience the following:

- a denser, wider ResearchClaw-like workbench shell
- a globally reachable private notebook document
- a global AI workspace that can appear docked in reader mode
- a real reading page with the paper on one side and AI on the other
- a clear separation between private notebook work and project-owned docs

## Immediate consequence for planning

The old assumption of "Notebook questions as synthesis scaffold" is no longer valid.

The next implementation plan must therefore pivot from:

- project-centered notebook question flow

to:

- independent `Reader`
- independent global `AI Workspace`
- independent private `Notebook`
- separate shared `Project Docs`
- denser `Search` and `Library` as feeder surfaces
