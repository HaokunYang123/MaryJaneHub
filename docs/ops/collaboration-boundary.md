# Collaboration Boundary (Temporary)

## Purpose
Protect the current file-system frontend/backend development flow while a second developer builds banking features in parallel.

## Status
- Active now.
- Temporary rule.
- Remove this boundary after both tracks are joined and validated together.

## Owners
- Owner track (Simon): file-system frontend/backend, documents pipeline, AI rail, review/preview UX.
- Banking track (Coworker): banking system implementation and banking-specific APIs/services.

## Scope Rules
- Banking track may change only banking-scoped code and its direct tests/docs.
- Banking track must not modify file-system UI/UX flows, document pipeline logic, or current owner-track APIs without explicit approval.

## Protected Areas (Do Not Change in Banking Track)
- `/app/documents/**`
- `/components/documents/**`
- `/components/layout/**`
- `/app/dashboard/**`
- `/lib/workflow/**`
- `/lib/search/**`
- `/app/api/documents/**`
- `/app/api/assistant/**`
- `/docs/phase-current.md` (except agreed integration notes)

## Allowed Areas (Banking Track)
- `/app/api/banking/**`
- `/lib/banking/**`
- `/components/banking/**`
- `/app/banking/**`
- Banking-only docs under `/docs/ops/**` or dedicated banking docs

## Git Workflow Guard
- Banking work must be done on a separate branch.
- Do not commit banking work into owner active branch.
- No force-push or history rewrite on owner branch.
- Integration is via reviewed PR/cherry-pick after owner approval.

## Shared Contract Changes
- If banking work needs shared types/config/env changes, open a small compatibility PR with:
  - exact change list
  - impact summary
  - rollback note
- Merge shared changes only after owner confirms.

## AI Agent Instruction
- Any AI agent (Codex/Claude) operating for banking track must read this file first and obey scope boundaries.
- If a requested task crosses protected areas, stop and ask for explicit owner confirmation before editing.

## Removal Condition
- Remove this file and related temporary AGENTS rule when:
  - banking + file-system tracks are joined,
  - integration validation is complete,
  - both developers agree to reopen full-repo edits.
