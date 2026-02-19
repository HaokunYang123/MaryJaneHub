# ADR-002 — Role Hierarchy (admin > user > viewer)

## Status: Accepted

## Context

The system needs tiered access: some users should only view, some can take actions (approve/reject/sync), and some need system administration access.

## Decision

Three roles in strict hierarchy: `admin` > `user` > `viewer`.

- `viewer`: read-only access to documents, search, export
- `user`: all viewer permissions + approve, reject, sync, field edit
- `admin`: all user permissions + whitelist management, Drive management, audit export
- `null` (no role assigned): treated as unauthenticated for role-gated endpoints

## Rules

- `requireRole("viewer")` allows viewer, user, admin
- `requireRole("user")` allows user, admin — blocks viewer and null
- `requireAdmin()` allows only admin (or secret-based auth when ADMIN_SECRET is set)
- Role is stored in the email_whitelist table and read at auth time

## Consequences

- No granular permissions (e.g., "can approve but not sync"). If needed later, extend the role model.
- Admin secret mode (ADMIN_SECRET env) overrides OAuth role — when set, admin endpoints require the secret header regardless of user role.

## Affected Sections

S01, S03, S04, S09
