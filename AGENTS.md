# Project Management Protocol

## Working Conventions

- **Language**: Conversation in English, all code/comments/logs in English only
- **No Chinese in code**: Scripts, comments, console output, documentation files must be English

## Purpose

These docs are the project's persistent memory. They ensure continuity across sessions—any context worth preserving goes here, not just in conversation. When we return, we pick up exactly where we left off.

**All docs are living documents.** When we discuss and agree on changes—whether to workflow, plans, or technical approach—update the relevant file immediately.

## Files

- `AGENTS.md` (root) — Working conventions, preferences, project-specific rules. Update when new agreements are made.
- `/docs/overview.md` — Scope, stack, architecture, phase list. Update rarely. <800 words.
- `/docs/phase-current.md` — Active tasks with acceptance criteria. Update after each task.
- `/docs/decisions.md` — Technical decisions and key learnings. Append-only, newest first.

## Formats

### overview.md

```markdown
# [Project Name]
## What
[One paragraph]
## Stack
[List]
## Architecture
[Brief or ASCII]
## Phases
- [ ] Phase 1: ...
```

### phase-current.md

```markdown
# Phase N: [Name]
## Goal
[One sentence]
## Tasks
- [ ] Task — [acceptance criteria]
## Progress
[Task]: Done/Blocked — [one-line note]
## Next
[Entry point for next session]
```

### decisions.md

```markdown
## YYYY-MM-DD: [Title]
Context: ... | Decision: ... | Reason: ...
```

Also log non-obvious learnings (e.g., "X library doesn't support Y") to avoid repeating dead ends.

## Rules

- On "continue"/"resume": read AGENTS.md, overview, and phase-current; report status; then proceed
- Update phase-current after each task, not at session end
- **When blocked: stop, explain the problem and options to user, wait for confirmation. Do not switch approach autonomously.**
- On confirmed pivot: write to decisions.md first, then update phase-current
- **On phase complete: rename phase-current.md to phase-N-done.md, create new phase-current.md, check off completed phase in overview.md**
- User may adjust tasks mid-phase through discussion; update phase-current accordingly
- When discussion establishes new conventions or preferences: update AGENTS.md immediately
- **After corrections or mistakes: update AGENTS.md with the lesson to prevent recurrence**
- When manually resetting `processing_jobs` from `processing` to `pending`, also clear `steps_completed` (and related step state) to avoid "File buffer not available for processing" on retry
- For `@google/genai` structured JSON calls, do not force API version `v1` unless verified; default/beta endpoints are required for `responseMimeType` + `responseSchema` support in this project
- Record any insight or constraint that would be useful in future sessions
- Don't echo file contents unless asked
- Keep entries concise: one line per task, one sentence per decision
