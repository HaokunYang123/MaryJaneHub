# ADR-003 — Drive Two-Zone Model

## Status: Accepted

## Context

The system interacts with Google Drive for document intake and organization. Some folders should be auto-organized by the system (per-entity structure), while others are user-managed and should not be touched.

## Decision

Two zones with different permissions:

### AI-Managed Roots
- Folder IDs configured via `GOOGLE_DRIVE_AI_MANAGED_ROOT_IDS` env
- System can: create subfolders, move files, rename files, set metadata
- Auto-organize processed documents into entity-specific folders

### User-Managed Areas
- Everything outside AI-managed roots
- System can: read files, set private app metadata (appProperties)
- System cannot: move, rename, delete, or create folders

## Rules

- Drive organize API (S09) enforces that target folder is within a managed root
- Pipeline (S02) can move processed files only into managed roots
- Metadata (appProperties) can be written in both zones — it's private to the app and invisible to users

## Consequences

- Adding a new entity requires adding its root folder ID to the env config
- Files in user-managed areas won't be auto-organized even after processing
- No risk of the system accidentally moving user's personal Drive files

## Affected Sections

S02, S09
