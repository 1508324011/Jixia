# Jixia Implementation Program

## Purpose

This document records the product and architecture decisions that govern the staged implementation of the target state in `doc/Design.md`. The target is a complete research workbench delivered through independently usable, automated-testable milestones rather than one big-bang release.

## Confirmed Program Decisions

- **Release target:** invited beta for real research teams. Billing, enterprise SSO, formal SLAs, and certification work are not part of the first release program.
- **Deployment model:** one organization or lab per deployment. Spaces and Projects remain authorization and governance scopes inside that deployment; public multi-tenant SaaS isolation is deferred.
- **Data residency:** infrastructure must remain region-configurable. No product contract may hard-code a US, EU, or Mainland China deployment.
- **External egress:** controlled and auditable. Literature and AI calls may leave the deployment only through server-owned adapters, with bounded user-selected context and no whole-library or implicit document export.
- **Literature scope:** broad scholarly discovery first. OpenAlex/Crossref-style metadata, DOI import, lawful open-access locations, and user-owned uploads form the first evidence loop. Biomedical-specific providers remain adapters that can be added without replacing the core model.
- **AI providers:** OpenAI-compatible, OpenRouter, Anthropic, and arbitrary third-party providers must fit one capability-based server registry. Credentials remain server-owned. Provider connection and capability discovery are primary; manual model-profile administration is an advanced fallback only.
- **Localization:** Simplified Chinese and English UI chrome are first-class from the workbench foundation onward. Source titles, abstracts, quotations, and citations remain in their original language unless a later explicit translation action is added.
- **Licensing:** Jixia is a proprietary commercial product. Do not copy non-commercial source code. Track dependency licenses and prefer permissive runtime dependencies.

## Locked Product Boundaries

The following decisions come from `doc/Design.md` and `doc/MVP_rule.md` and are not reopened by individual tasks:

- Jixia is a server-first, browser-based research workbench.
- Home is the daily cockpit; Project is the formal collaboration unit; Project Overview is an entry and overview surface, not a project-management cockpit.
- Search is external discovery; Library is the personal literature warehouse; Reader is the deep-reading and evidence-selection surface.
- Notebook is private thinking and synthesis; Project Docs are durable shared knowledge. They share one editor grammar but retain different ownership and purpose.
- Embedded Copilot is the primary AI surface. AI Workspace is secondary and intended for longer or more complex context.
- AI is advisory and cannot persist document changes without explicit user confirmation. Existing no-writeback guarantees remain mandatory.
- Discussion is attached to objects rather than becoming a standalone team-chat product.
- Space is a governance container, not the foreground work surface.
- New objects are personal by default; sharing is explicit and project-scoped.

## Delivery Sequence

1. Workbench foundation, bilingual chrome, and responsive geometry.
2. Provider connection and capability-discovery UX replacing the rejected Task 21f presentation.
3. Literature, source, annotation, excerpt, evidence, and citation domain contracts.
4. External Search, DOI/import flow, and Library.
5. Reader and the evidence-to-Project-Doc vertical slice.
6. Notebook synthesis integration and source-grounded embedded Copilot.
7. Project Overview, Project Docs collaboration, members, discussions, activity, and audit surfaces.
8. Home, global command search, operational polish, and complete target-state verification.

Each milestone must preserve server authorization, safe storage, explicit permissions, draft/revision separation, and bounded AI context. Every release gate must be executable through automated package tests and Playwright checks.
