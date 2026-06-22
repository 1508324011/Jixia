# Component Guidelines

Jixia frontend components must express an IDE-like research workbench. The closest visual reference is `/home/zhurui/github_project/ResearchClaw`; borrow its light workspace language and interaction density, not its Electron or local filesystem assumptions.

## Product Shape

- Home, Projects, Library, Notebook, AI Workspace, and project views should follow the product semantics in `doc/Design.md`.
- Project Overview is a resource entrance, not the main project driving surface.
- The app must feel like a persistent workbench, not a SaaS marketing site, analytics dashboard, card feed, or standalone chat product.
- Prefer persistent app chrome: left navigation, top work-surface indicator or tab strip, compact toolbar, and stable content panes.
- Reader, Notebook, Project Docs, and AI surfaces should support long-running work through split panes, side panels, resizable areas, or collapsible context panels when useful.
- Standalone AI chat is a first-class AI workspace surface. Its primary model is `Thread + MessageStream + Composer + RuntimeState`, not `Document + Context + Provider + Safety Labels`. It must start without current-document context, keep history/sidebar access subordinate to the conversation, render Markdown/GFM with focused mature dependencies such as `react-markdown` plus `remark-gfm`, and keep source/tool/run details as compact chips or cards.
- Document-grounded AI copilots may live in document inspectors, but they must still behave like chat-native workbench panes rather than static inspector forms. They must use a clear work-surface anatomy: compact header/mode bar, visible bounded context card, durable conversation viewport, source chips/cards, provider/model status, visible server-run state, safe message actions, and stable composer. MVP document copilots are advisory/no-writeback only: no apply, insert, rewrite, auto-merge, hidden mutation, or document-body AI chrome without a server-owned approval/mutation contract.

## Visual System

- Use a clean light workspace: white main canvas, warm off-white sidebar, subtle gray borders, dark neutral primary text, muted secondary text, and restrained cyan/blue accent.
- Keep base text around 14px unless a specific reading surface needs larger prose.
- Use compact controls, small line icons, light border separators, narrow scrollbars, and quiet hover states.
- Cards are allowed only as dense content cells. They must not become the main product metaphor.
- Avoid purple gradients, hero banners, colorful KPI tiles, oversized rounded cards, decorative blobs, and generic admin-dashboard patterns.

## Motion And Interaction

- Use short transitions around 0.15s to 0.3s for hover, panel open/close, tab changes, and subtle surface entry.
- Motion should preserve continuity and orientation. Do not use decorative animation that distracts from reading or writing.
- Active work surfaces should be visually explicit through tab state, pane title, breadcrumb, or equivalent context marker.
- AI panels must not fake streaming, cancellation, or document mutation controls. Only show Stop/cancel/apply/insert/rewrite actions when a real server endpoint and authorization contract back the action.

## ResearchClaw Boundary

- ResearchClaw is a visual and interaction reference only.
- Do not copy Electron shell assumptions, local filesystem workflows, desktop-only affordances, or ResearchClaw-specific product objects into Jixia.
- If a ResearchClaw pattern conflicts with `doc/MVP_rule.md`, the MVP rule wins.
