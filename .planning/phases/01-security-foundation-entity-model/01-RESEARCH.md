# Phase 1: Security Foundation & Entity Model - Research

**Researched:** 2026-01-28
**Domain:** Supabase Security (Vault, RLS, Audit Logging), PostgreSQL Multi-Tenant Patterns
**Confidence:** HIGH

## Summary

This phase establishes secure multi-tenant infrastructure for handling sensitive banking data (Plaid tokens, transaction classifications). The research confirms three core technologies:

1. **Supabase Vault** for AES-256 encryption of Plaid access tokens at rest, with decryption only via the `vault.decrypted_secrets` view restricted to service role
2. **Row Level Security (RLS)** for tenant isolation using JWT `app_metadata.entity_ids` claims, with super-admin override via `is_super_admin` flag
3. **PostgreSQL Audit Triggers** for immutable logging using the supa_audit pattern or custom append-only tables

The existing codebase already has Supabase Auth with email whitelist middleware, `@supabase/ssr` v0.8.0, and `@supabase/supabase-js` v2.90.1. The current schema lacks entity/tenant tables and has overly permissive RLS policies (e.g., `USING (true)` on user_profiles).

**Primary recommendation:** Implement Vault for token storage, add entity model with RLS tenant isolation, and create append-only audit tables before any banking integrations.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase Vault | Built-in | Encrypted secret storage | Native Supabase, AES-256-GCM, key isolation |
| PostgreSQL RLS | Native | Row-level access control | Database-enforced security, defense-in-depth |
| Custom Claims | supabase-community | JWT claim management | Community standard for RBAC in Supabase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @supabase/supabase-js | 2.90.1 (existing) | Client SDK | All database operations |
| @supabase/ssr | 0.8.0 (existing) | Server-side auth | Middleware, route handlers |
| supa_audit | Extension (archived) | Table auditing | Alternative to custom audit triggers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase Vault | pgsodium directly | Vault is higher-level API, manages keys automatically |
| Custom audit triggers | supa_audit extension | Custom gives more control over schema, supa_audit is archived |
| JWT app_metadata | Separate profiles table | app_metadata avoids extra query per request |

**Installation:**
Already installed. Enable Vault extension in Supabase dashboard if not active:
```sql
-- Vault is pre-installed on Supabase, just needs enabling
CREATE EXTENSION IF NOT EXISTS supabase_vault;
```

## Architecture Patterns

### Recommended Project Structure
```
supabase/
├── migrations/
│   ├── 001_enable_vault.sql           # Vault extension
│   ├── 002_create_entities.sql        # Business entity table
│   ├── 003_create_bank_connections.sql # Token storage with Vault
│   ├── 004_create_audit_schema.sql    # Audit infrastructure
│   └── 005_apply_rls_policies.sql     # All RLS in one place
src/
├── lib/
│   ├── supabase/
│   │   ├── client.ts     # Browser client (existing)
│   │   ├── server.ts     # Server client (existing)
│   │   └── admin.ts      # NEW: Service role client
│   └── auth/
│       └── claims.ts     # NEW: Helper for JWT claims
```

### Pattern 1: Vault Secret Storage
**What:** Store Plaid tokens encrypted, retrieve only via service role
**When to use:** Any sensitive credential that needs database storage
**Example:**
```sql
-- Source: https://supabase.com/docs/guides/database/vault

-- Store a Plaid access token
SELECT vault.create_secret(
  'access-sandbox-abc123...',           -- The secret value
  'plaid_token_entity_uuid_here',       -- Unique name (entity_id)
  'Plaid access token for Green Leaf'   -- Description
);

-- Retrieve (ONLY from service role context)
SELECT id, name, decrypted_secret
FROM vault.decrypted_secrets
WHERE name = 'plaid_token_entity_uuid_here';
```

### Pattern 2: Multi-Tenant RLS with Super Admin Override
**What:** Tenant isolation via JWT claims with admin bypass
**When to use:** All tables containing entity-specific data
**Example:**
```sql
-- Source: https://supabase.com/docs/guides/database/postgres/row-level-security

-- Helper function to check entity access
CREATE OR REPLACE FUNCTION auth.has_entity_access(check_entity_id uuid)
RETURNS boolean AS $$
BEGIN
  -- Super admin sees everything
  IF coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean,
    false
  ) THEN
    RETURN true;
  END IF;

  -- Regular user checks entity_ids array
  RETURN check_entity_id = ANY(
    ARRAY(
      SELECT jsonb_array_elements_text(
        auth.jwt() -> 'app_metadata' -> 'entity_ids'
      )::uuid
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Apply to table
CREATE POLICY "Users access own entities" ON transactions
  FOR ALL
  TO authenticated
  USING (auth.has_entity_access(entity_id))
  WITH CHECK (auth.has_entity_access(entity_id));
```

### Pattern 3: Append-Only Audit Log
**What:** Immutable audit trail using RLS to prevent UPDATE/DELETE
**When to use:** Tracking changes to sensitive data (classifications, voids)
**Example:**
```sql
-- Source: https://supabase.com/blog/postgres-audit

-- Create audit schema
CREATE SCHEMA IF NOT EXISTS audit;

-- Audit table
CREATE TABLE audit.bank_data_changes (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS and FORCE it (applies to table owner too)
ALTER TABLE audit.bank_data_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.bank_data_changes FORCE ROW LEVEL SECURITY;

-- Only allow INSERT (append-only)
CREATE POLICY "Audit is append-only" ON audit.bank_data_changes
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (true);

-- Allow read for auditors
CREATE POLICY "Admins can read audit" ON audit.bank_data_changes
  FOR SELECT
  TO authenticated
  USING (
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean,
      false
    )
  );
```

### Anti-Patterns to Avoid
- **Storing tokens in plain columns:** Never store Plaid tokens outside Vault
- **RLS with `USING (true)`:** Current user_profiles policy is insecure; always scope to user/entity
- **Hardcoding service_role key in client:** Never expose service role to browser
- **Trusting user_metadata for authorization:** Use `app_metadata` only (user cannot modify)
- **DELETE operations on audit logs:** RLS must prevent all DELETE/UPDATE

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret encryption | Custom AES wrapper | Supabase Vault | Key management is complex, Vault handles it |
| JWT claim extraction | Manual parsing | `auth.jwt()` function | Built-in, handles edge cases |
| User claim setting | Direct SQL UPDATE | `auth.admin.updateUserById` | Proper API, handles token refresh |
| Audit logging | Manual INSERT in app | PostgreSQL triggers | Guaranteed capture, no app bypass |
| UUID generation | Manual in app code | `gen_random_uuid()` | Database ensures uniqueness |

**Key insight:** Security infrastructure has subtle edge cases. Supabase's built-in Vault, RLS functions, and admin API handle scenarios you'll miss if building custom.

## Common Pitfalls

### Pitfall 1: JWT Claims Not Immediately Available
**What goes wrong:** User signs up, you set `app_metadata`, but JWT doesn't have the claim
**Why it happens:** JWT is issued at login; metadata changes require token refresh
**How to avoid:** After updating `app_metadata`, force token refresh or inform user to re-login
**Warning signs:** "Permission denied" errors immediately after adding user to entity

```typescript
// After updating app_metadata, refresh the session
await supabase.auth.refreshSession();
```

### Pitfall 2: Vault Access from Wrong Context
**What goes wrong:** `vault.decrypted_secrets` returns no rows
**Why it happens:** Vault view only accessible to privileged roles, not anon/authenticated
**How to avoid:** Always access Vault from service role client in API routes
**Warning signs:** Empty results when you know secrets exist

```typescript
// WRONG - authenticated user can't decrypt
const { data } = await supabase.from('vault.decrypted_secrets').select('*');

// RIGHT - use service role client
import { createClient } from '@supabase/supabase-js';
const supabaseAdmin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await supabaseAdmin.from('vault.decrypted_secrets').select('*');
```

### Pitfall 3: RLS Bypass with Table Owner
**What goes wrong:** Table owner can still UPDATE/DELETE audit logs
**Why it happens:** RLS doesn't apply to table owner by default
**How to avoid:** Use `ALTER TABLE ... FORCE ROW LEVEL SECURITY`
**Warning signs:** Audit entries can be modified when testing as postgres user

### Pitfall 4: String Values in JSONB Claims
**What goes wrong:** `set_claim` fails with "invalid input syntax for type json"
**Why it happens:** String values need double quotes inside the JSONB parameter
**How to avoid:** Always wrap strings: `'"value"'` not `'value'`
**Warning signs:** Syntax errors when setting text-type custom claims

```sql
-- WRONG
SELECT set_claim(user_id, 'role', 'admin');

-- RIGHT
SELECT set_claim(user_id, 'role', '"admin"');
```

### Pitfall 5: SECURITY DEFINER Grants Too Much
**What goes wrong:** Helper function gives access to data user shouldn't see
**Why it happens:** `SECURITY DEFINER` runs as function owner (postgres)
**How to avoid:** Use `SECURITY INVOKER` or carefully scope DEFINER functions
**Warning signs:** Users accessing data outside their entity_ids

## Code Examples

Verified patterns from official sources:

### Creating Admin Supabase Client (Server-Side Only)
```typescript
// Source: https://supabase.com/docs/guides/database/secure-data
// src/lib/supabase/admin.ts

import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin operations');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
```

### Setting User Entity IDs via Admin API
```typescript
// Source: https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
// Server-side only (API route or server action)

import { createAdminClient } from '@/lib/supabase/admin';

export async function assignUserToEntities(
  userId: string,
  entityIds: string[],
  isSuperAdmin: boolean = false
) {
  const supabaseAdmin = createAdminClient();

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
    userId,
    {
      app_metadata: {
        entity_ids: entityIds,
        is_super_admin: isSuperAdmin
      }
    }
  );

  if (error) throw error;
  return data;
}
```

### Entity Table with Cannabis Flag
```sql
-- Source: Phase requirements ENT-01, ENT-02

CREATE TABLE public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_cannabis boolean NOT NULL DEFAULT false,  -- 280E treatment flag
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for entity access
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their entities" ON public.entities
  FOR SELECT
  TO authenticated
  USING (auth.has_entity_access(id));

-- Only super admin can create/modify entities
CREATE POLICY "Super admin manages entities" ON public.entities
  FOR ALL
  TO authenticated
  USING (
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean,
      false
    )
  )
  WITH CHECK (
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean,
      false
    )
  );
```

### Bank Connection Table with Vault Reference
```sql
-- Source: SEC-01, SEC-02, SEC-03 requirements

CREATE TABLE public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  institution_name text NOT NULL,
  vault_secret_id uuid NOT NULL,  -- References vault.secrets.id
  last_sync_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disconnected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Strict RLS - authenticated users cannot see tokens
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;

-- Frontend can see connection metadata (not tokens)
CREATE POLICY "Users see own bank connections" ON public.bank_connections
  FOR SELECT
  TO authenticated
  USING (auth.has_entity_access(entity_id));

-- Only service role can INSERT/UPDATE (with vault_secret_id)
-- No policy for INSERT/UPDATE/DELETE means denied for authenticated role
```

### Audit Trigger Function
```sql
-- Source: https://supabase.com/blog/postgres-audit

CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, public
AS $$
BEGIN
  INSERT INTO audit.bank_data_changes (
    table_name,
    record_id,
    operation,
    old_data,
    new_data,
    changed_by,
    changed_at
  )
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    auth.uid(),
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply to sensitive tables
CREATE TRIGGER audit_transactions
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();
```

### Soft Delete Pattern
```sql
-- Source: SEC-06 requirement

-- Add void columns to transactions
ALTER TABLE public.transactions
  ADD COLUMN is_voided boolean NOT NULL DEFAULT false,
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_by uuid REFERENCES auth.users(id),
  ADD COLUMN void_reason text;

-- Prevent actual DELETE
CREATE POLICY "No deletes on transactions" ON public.transactions
  FOR DELETE
  TO authenticated
  USING (false);  -- Always denies DELETE

-- Service role can also be blocked with FORCE RLS if needed
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pgsodium direct | Supabase Vault | 2023 | Higher-level API, automatic key management |
| user_metadata for roles | app_metadata claims | Always | user_metadata is user-modifiable, insecure |
| Application-level audit | Database triggers | N/A | Triggers catch all changes, even direct SQL |
| Manual RLS per table | Helper functions | N/A | DRY, easier maintenance |

**Deprecated/outdated:**
- **pgsodium direct usage**: Use Vault wrapper instead
- **supa_audit extension**: Repository archived Feb 2025, use custom triggers
- **GoTrue custom claims `provider`/`providers`**: Reserved, don't use as custom claim names

## Open Questions

Things that couldn't be fully resolved:

1. **Vault Performance at Scale**
   - What we know: Vault decryption happens at query time
   - What's unclear: Performance impact with many concurrent Plaid API calls
   - Recommendation: Batch token retrieval, implement caching in API routes

2. **Token Refresh After app_metadata Update**
   - What we know: JWT changes require refresh
   - What's unclear: Best UX for forcing refresh without logout
   - Recommendation: Use `supabase.auth.refreshSession()` but test edge cases

3. **Audit Log Retention**
   - What we know: Table grows indefinitely
   - What's unclear: Partitioning strategy for large datasets
   - Recommendation: Monitor size, implement time-based partitioning if >10M rows

## Sources

### Primary (HIGH confidence)
- [Supabase Vault Documentation](https://supabase.com/docs/guides/database/vault) - Secret storage and encryption
- [Supabase RLS Documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) - Policy syntax and patterns
- [Supabase Custom Claims RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) - JWT claim management
- [Supabase Admin API updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid) - Setting app_metadata
- [Supabase Postgres Audit Blog](https://supabase.com/blog/postgres-audit) - Trigger-based auditing

### Secondary (MEDIUM confidence)
- [supabase-community/supabase-custom-claims](https://github.com/supabase-community/supabase-custom-claims) - set_claim/get_claim functions
- [supabase/supa_audit](https://github.com/supabase/supa_audit) - Audit extension (archived, patterns still valid)
- [Multi-tenant RLS discussions](https://github.com/orgs/community/discussions/149922) - Community patterns

### Tertiary (LOW confidence)
- Web search results on PostgreSQL append-only audit patterns - general guidance, verify with testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Supabase documentation verified
- Architecture: HIGH - Patterns from official docs and community standards
- Pitfalls: HIGH - Documented in official troubleshooting guides
- Code examples: HIGH - Adapted from official documentation

**Research date:** 2026-01-28
**Valid until:** 60 days (Supabase APIs stable, Vault GA)
