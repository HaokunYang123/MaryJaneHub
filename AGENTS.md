# Agent Working Conventions

> This file contains operational instructions for AI agents. Project facts live in `PROJECT.md`, `sections/`, and `decisions/` — those are the authoritative sources.

## Workflow

This project uses a structured PLAN → BUILD → REVIEW workflow:

- **PROJECT.md** is the source of truth for goal, tech stack, sections table, and constraints
- **sections/*.md** define each work unit: Intent, Contract, Proof, Depends on
- **decisions/ADR-*.md** record cross-section architectural decisions
- **CLAUDE.md** contains only operational instructions (commands, conventions)

When building or reviewing, always read the relevant section and its dependencies first.

## Model Delegation

- **Opus** — planning, architecture, section design, complex decisions, review
- **Sonnet** — implementation (BUILD phase), routine code changes
- **Haiku** — exploration, file search, quick lookups

## Rules

- When blocked: stop, explain the problem, wait for confirmation. Do not switch approach autonomously.
- Update section status and PROJECT.md after completing work.
- Don't echo file contents unless asked.
- Keep entries concise.
- Record operational insights in this file; record project facts in sections or ADRs.
