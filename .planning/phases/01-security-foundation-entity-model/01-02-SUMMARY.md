---
type: summary
phase: 01-security-foundation-entity-model
plan: 02
subsystem: security
tags: [rls, audit, soft-delete, user-admin, multi-tenant]

dependency_graph:
  requires: ["01-01"]
  provides: ["RLS policies", "audit infrastructure", "soft delete", "user admin helper"]
  affects: ["02-plaid-integration", "03-bank-account-sync"]

tech_stack:
  added: []
  patterns: ["RLS with helper functions", "append-only audit", "soft delete via voided columns", "JWT app_metadata claims"]

key_files:
  created:
    - supabase/migrations/004_create_auth_helpers.sql
    - supabase/migrations/005_apply_rls_policies.sql
    - supabase/migrations/006_create_audit_schema.sql
    - supabase/migrations/007_soft_delete_transactions.sql
    - src/lib/supabase/user-admin.ts
  modified: []

decisions:
  - id: SEC-RLS-01
    choice: "Helper function pattern for RLS"
    reason: "Centralizes access logic, super-admin check in one place"
  - id: SEC-AUDIT-01
    choice: "FORCE ROW LEVEL SECURITY on audit table"
    reason: "Ensures even postgres user follows append-only policies"
  - id: SEC-DELETE-01
    choice: "USING(false) for DELETE denial"
    reason: "Simpler than trigger, RLS-enforced at database level"

metrics:
  duration: "3 min"
  completed: "2026-01-28"
---

# Phase 01 Plan 02: RLS Policies, Audit Logging, Soft Delete Summary

**One-liner:** Database-enforced multi-tenant isolation with JWT claims, append-only audit trail, and soft delete pattern for IRS compliance.

## What Was Built

### 1. Auth Helper Function (004_create_auth_helpers.sql)

`auth.has_entity_access(entity_id uuid)` - Central access control function used by all RLS policies:

- Super admin bypass: Returns TRUE if `app_metadata.is_super_admin = true`
- Entity check: Returns TRUE if entity_id is in `app_metadata.entity_ids` array
- SECURITY DEFINER with locked search_path for security

### 2. RLS Policies (005_apply_rls_policies.sql)

**entities table:**
- SELECT: Uses `auth.has_entity_access(id)` - users see assigned entities, super admins see all
- ALL (INSERT/UPDATE/DELETE): Restricted to super admins only

**bank_connections table:**
- SELECT only: Users see bank connection metadata for their entities
- No write policies = authenticated users cannot INSERT/UPDATE/DELETE
- Service role (via admin client) manages all writes

### 3. Audit Infrastructure (006_create_audit_schema.sql)

**audit.bank_data_changes table:**
- Captures table_name, record_id, operation, old_data, new_data, changed_by, changed_at
- FORCE ROW LEVEL SECURITY ensures immutability
- INSERT-only policy (append-only)
- SELECT restricted to super admins
- NO UPDATE/DELETE policies = truly immutable

**Triggers:**
- `audit_bank_connections` - logs all changes to bank_connections
- `audit_transactions` - logs all changes to transactions

### 4. Soft Delete Pattern (007_soft_delete_transactions.sql)

**New columns on transactions:**
- `is_voided` (boolean, default false) - soft delete flag
- `voided_at` (timestamptz) - when voided
- `voided_by` (uuid FK to auth.users) - who voided
- `void_reason` (text) - required explanation

**RLS policies:**
- SELECT, INSERT, UPDATE allowed for authenticated users
- DELETE denied via `USING(false)` - enforces soft delete

### 5. User Admin Helper (src/lib/supabase/user-admin.ts)

TypeScript functions for managing user access via service role:

```typescript
setSuperAdmin(userId, isSuperAdmin) // Grant/revoke super admin (ENT-04)
assignUserToEntity(userId, entityIds) // Assign entities to user
getUserMetadata(userId) // Get current access settings
updateUserAccess(userId, options) // Atomic update of both
```

## Commits

| Hash | Description |
|------|-------------|
| bcc45c0 | feat(01-02): create auth.has_entity_access() RLS helper |
| 52c5373 | feat(01-02): apply RLS policies to entities and bank_connections |
| 4bcadb1 | feat(01-02): create append-only audit logging infrastructure |
| bd70653 | feat(01-02): add soft delete to transactions, prevent DELETE |
| d405512 | feat(01-02): create user admin helper for super-admin assignment (ENT-04) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type mismatch in getUserMetadata**
- **Found during:** Task 5 verification
- **Issue:** Supabase's `UserAppMetadata` type is generic, doesn't match our specific interface
- **Fix:** Added `UserAccessMetadata` interface and explicit type cast
- **Files modified:** src/lib/supabase/user-admin.ts
- **Commit:** d405512

## Security Model Verification

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| SEC-02: Frontend cannot access Vault | bank_connections SELECT-only, no write policies | PASS |
| SEC-03: Tenant isolation | auth.has_entity_access() in all RLS policies | PASS |
| SEC-04: Super admin override | is_super_admin check in helper function | PASS |
| SEC-05: Immutable audit | FORCE RLS + INSERT-only policy on audit table | PASS |
| SEC-06: No transaction deletion | DELETE policy with USING(false) | PASS |
| ENT-04: Super admin assignment | setSuperAdmin() via admin client | PASS |

## Key Patterns Established

1. **JWT app_metadata claims** - Access control stored in user token, set via admin API
2. **Helper function for RLS** - Centralizes access logic, avoids duplication in policies
3. **Append-only audit** - FORCE RLS + INSERT-only = immutable even for table owner
4. **Soft delete via voided columns** - Preserve data + deny DELETE = complete audit trail

## Next Phase Readiness

Phase 1 complete. Security foundation ready for:
- Phase 2: Plaid integration (bank_connections protected by RLS)
- Phase 3: Bank account sync (audit triggers will capture all changes)
- Future: Entity CRUD operations (super admin policies in place)

## Files Created

```
supabase/migrations/
  004_create_auth_helpers.sql      (1.5 KB) - auth.has_entity_access function
  005_apply_rls_policies.sql       (2.4 KB) - RLS for entities and bank_connections
  006_create_audit_schema.sql      (4.6 KB) - Append-only audit infrastructure
  007_soft_delete_transactions.sql (3.2 KB) - Soft delete + DELETE prevention

src/lib/supabase/
  user-admin.ts                    (3.5 KB) - User access management helpers
```
