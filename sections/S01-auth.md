# S01 — Auth & Security

## Status: Done

## Intent

Protect all API endpoints with authentication and role-based authorization. Enforce email whitelist for access control. Provide three auth tiers: session-based (OAuth), role-gated, and secret-based (admin/cron).

**Success criteria:** No endpoint is accessible without authentication. Role hierarchy is enforced consistently. Admin secret mode has no OAuth fallback.

**Non-goals:** User registration flow. Password-based auth. Per-document access control (all authed users see all documents).

## Contract

**ContractVersion: v1**

### verifyAuth(request) → AuthResult

Returns authenticated user or 401.

```typescript
// Success
{ authenticated: true, userId: string, email: string, role: "admin" | "user" | "viewer" | null }

// Failure → 401 JSON
{ error: "Unauthorized", details?: string }
```

### requireRole(role) → middleware

Wraps verifyAuth. Returns 403 if user role is below required level.

```
Hierarchy: admin > user > viewer
requireRole("user") → allows admin and user, blocks viewer and null
```

### requireAdmin() → middleware

- If `ADMIN_SECRET` env is set: requires `x-admin-secret` header match. No OAuth fallback.
- If `ADMIN_SECRET` not set: requires OAuth role = "admin".

### Cron auth

Bearer token via `Authorization: Bearer <CRON_SECRET>`. No session fallback. Fail-closed.

### Error format

All auth errors return:
```json
{ "error": "Unauthorized" | "Forbidden", "details": "..." }
```

## Proof

1. Any request without valid session or token receives 401.
2. `requireRole("viewer")` blocks role=null; `requireRole("user")` blocks viewer and null.
3. When `ADMIN_SECRET` is set, `requireAdmin()` rejects valid OAuth admin sessions that lack the secret header.
4. Cron endpoint with missing or wrong `CRON_SECRET` returns 401, never falls back to session.
5. Non-whitelisted email with valid OAuth session receives 401.

## Depends On

- ADR-002 (role hierarchy definition)

## Files

- `lib/auth/api-middleware.ts` — verifyAuth, requireRole, requireAdmin
- `lib/auth/session.ts` — session management
- `lib/auth/whitelist.ts` — email whitelist check
- `lib/auth/admin-access.ts` — admin secret validation
- `lib/auth/config.ts` — auth configuration
- `app/api/auth/callback/route.ts` — OAuth callback
- `app/api/auth/signout/route.ts` — sign out
