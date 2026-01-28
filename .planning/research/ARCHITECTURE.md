# Architecture Patterns: Secure Multi-Tenant Banking Integration

**Domain:** Multi-tenant banking data layer with Plaid integration
**Researched:** 2026-01-28
**Overall Confidence:** HIGH (official docs verified)

## Executive Summary

This architecture document defines how to securely integrate Plaid banking data into Mary Financial Center's existing Next.js + Supabase stack. The design prioritizes defense-in-depth: encryption at rest, RLS-enforced isolation, read-only scopes, and immutable audit logging.

**Key architectural decisions:**
- Supabase Vault for token encryption (not raw pgsodium)
- JWT app_metadata for tenant context (not subqueries)
- Service role for token operations, anon role for data queries
- Webhook-driven sync with `/transactions/sync` pattern
- Trigger-based immutable audit log

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MARY FINANCIAL CENTER                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   Frontend   │────▶│  Next.js API │────▶│   Supabase   │                │
│  │  (Browser)   │     │   Routes     │     │   (Postgres) │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│         │                    │                    │                         │
│         │                    │                    │                         │
│         ▼                    ▼                    ▼                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │  Plaid Link  │     │  Plaid API   │     │    Vault     │                │
│  │  (Browser)   │     │  (Server)    │     │  (Encrypted) │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│         │                    ▲                    │                         │
│         │                    │                    │                         │
│         └────────────────────┴────────────────────┘                         │
│                              │                                              │
│                              ▼                                              │
│                     ┌──────────────┐                                        │
│                     │   Webhooks   │                                        │
│                     │  (Realtime)  │                                        │
│                     └──────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With | Key |
|-----------|---------------|-------------------|-----|
| **Frontend** | Display data, initiate Plaid Link | Next.js API (anon key) | `sb_publishable_*` |
| **Next.js API Routes** | Business logic, Plaid API calls | Supabase, Plaid | `sb_secret_*` (service role) |
| **Supabase Postgres** | Data storage, RLS enforcement | API Routes only | Internal |
| **Vault Schema** | Encrypted token storage | Service role only | Internal (managed keys) |
| **Plaid Link** | User bank auth UI | Plaid servers | Client-side only |
| **Plaid API** | Bank data retrieval | Next.js API | Server-side only |
| **Webhook Endpoint** | Receive Plaid push updates | Plaid servers (inbound) | JWT verification |

### Data Flow: Bank Connection

```
1. User clicks "Connect Bank"
   │
   ▼
2. Frontend calls POST /api/plaid/link-token
   │  (authenticated, anon key)
   ▼
3. API Route creates link_token via Plaid API
   │  (server-side, Plaid secret)
   ▼
4. Frontend receives link_token, opens Plaid Link
   │
   ▼
5. User authenticates with bank in Plaid UI
   │
   ▼
6. Plaid returns public_token to frontend
   │
   ▼
7. Frontend calls POST /api/plaid/exchange-token
   │  (authenticated, anon key, sends public_token)
   ▼
8. API Route exchanges public_token for access_token
   │  (server-side, Plaid secret)
   ▼
9. API Route stores access_token in Vault
   │  (service role, vault.create_secret())
   ▼
10. API Route creates bank_connections row
    │  (service role, references vault secret_id)
    ▼
11. Success returned to frontend
```

### Data Flow: Transaction Sync

```
1. Plaid detects new transactions
   │
   ▼
2. Webhook fires to POST /api/webhooks/plaid
   │  (SYNC_UPDATES_AVAILABLE)
   ▼
3. API Route verifies JWT signature
   │  (Plaid-Verification header)
   ▼
4. API Route retrieves access_token from Vault
   │  (service role, vault.decrypted_secrets)
   ▼
5. API Route calls /transactions/sync
   │  (Plaid API, access_token)
   ▼
6. API Route applies transaction patches
   │  (INSERT added, UPDATE modified, DELETE removed)
   │  (service role, bypasses RLS)
   ▼
7. Triggers fire for audit log
   │  (automatic, immutable)
   ▼
8. Frontend polls or receives update notification
```

---

## Security Boundaries

### Token Encryption Pattern (Supabase Vault)

**Confidence:** HIGH (official Supabase docs)

Use Supabase Vault, not raw pgsodium. Vault provides:
- Authenticated Encryption (AEAD) - decryption fails if tampered
- Managed key rotation - Supabase handles key lifecycle
- Decryption via view - `vault.decrypted_secrets` (never stored decrypted)

```sql
-- Store Plaid access_token encrypted
SELECT vault.create_secret(
  'access-sandbox-xxxxx',           -- The token (encrypted at rest)
  'plaid_token_item_xxx',           -- Unique name for lookup
  'Plaid access token for Bank XYZ' -- Description
) AS secret_id;

-- Retrieve when needed (service role only)
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE name = 'plaid_token_item_xxx';
```

**Critical:** Disable statement logging for Vault operations to prevent tokens appearing in logs.

```sql
-- In migration or admin console
ALTER DATABASE postgres SET log_statement = 'none';
-- Or per-session before Vault operations
SET log_statement = 'none';
```

**Bank Connections Table:**

```sql
CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES business_entities(id),
  plaid_item_id TEXT NOT NULL UNIQUE,
  vault_secret_id UUID NOT NULL,  -- References vault.secrets.id
  institution_name TEXT,
  institution_id TEXT,
  cursor TEXT,  -- For /transactions/sync pagination
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'error', 'disconnected')),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- CRITICAL: Enable RLS
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
```

### RLS Policy Patterns

**Confidence:** HIGH (official Supabase docs)

#### Pattern 1: Tenant Isolation via JWT app_metadata

Store `entity_ids` (array of accessible business entities) in JWT app_metadata for performance. This avoids subqueries on every RLS check.

```sql
-- Set user's accessible entities during authentication
-- (Done via Supabase Auth hooks or admin API)
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data ||
  '{"entity_ids": ["uuid-1", "uuid-2"], "is_super_admin": false}'::jsonb
WHERE id = 'user-uuid';
```

**Standard User Policy (sees only assigned entities):**

```sql
CREATE POLICY "Users see own entity bank accounts"
ON bank_accounts FOR SELECT
TO authenticated
USING (
  entity_id = ANY(
    (SELECT COALESCE(
      (auth.jwt() -> 'app_metadata' -> 'entity_ids')::text[],
      '{}'::text[]
    ))::uuid[]
  )
);
```

#### Pattern 2: Super Admin Override

Mary and her accountant need to see ALL entities. Store `is_super_admin: true` in app_metadata.

```sql
CREATE POLICY "Super admin sees all bank accounts"
ON bank_accounts FOR SELECT
TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean = true
);

-- Combined policy (either super admin OR owns entity)
CREATE POLICY "Users see authorized bank accounts"
ON bank_accounts FOR SELECT
TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean = true
  OR
  entity_id = ANY(
    (SELECT COALESCE(
      (auth.jwt() -> 'app_metadata' -> 'entity_ids')::text[],
      '{}'::text[]
    ))::uuid[]
  )
);
```

#### Pattern 3: Token Table Isolation (Service Role Only)

The `bank_connections` table stores vault references. **No frontend access to this table.**

```sql
-- NO policies for anon/authenticated roles
-- Only service role can access (bypasses RLS)
CREATE POLICY "No direct access to bank connections"
ON bank_connections FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
```

Frontend queries `bank_accounts` (derived data), never `bank_connections` (sensitive).

### Service Role vs Anon Role Access Matrix

**Confidence:** HIGH (official Supabase docs)

| Operation | Role | Rationale |
|-----------|------|-----------|
| Query transactions | `authenticated` (anon key) | RLS filters by entity |
| Query bank balances | `authenticated` (anon key) | RLS filters by entity |
| Store access_token | `service_role` (secret key) | Bypasses RLS for Vault |
| Retrieve access_token | `service_role` (secret key) | Bypasses RLS for Vault |
| Sync transactions | `service_role` (secret key) | Writes from webhook |
| Create bank_connection | `service_role` (secret key) | After Plaid exchange |
| Audit log writes | `service_role` (trigger) | Automatic, trusted |

**Implementation in Next.js:**

```typescript
// src/lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js';

// Service role client - NEVER expose to frontend
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Secret, server-only
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
```

```typescript
// API Route using service role for Vault
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function storeAccessToken(
  plaidItemId: string,
  accessToken: string
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('vault_create_secret', {
    secret: accessToken,
    name: `plaid_token_${plaidItemId}`,
    description: `Plaid access token for item ${plaidItemId}`
  });

  if (error) throw error;
  return data; // Returns secret_id UUID
}
```

---

## Webhook Architecture

**Confidence:** HIGH (Plaid official docs)

### Webhook Verification

Plaid uses JWT-based verification (not HMAC). Every webhook includes a `Plaid-Verification` header containing a signed JWT.

```typescript
// src/app/api/webhooks/plaid/route.ts
import { jwtDecode } from 'jwt-decode';
import * as jose from 'jose';
import { createHash } from 'crypto';

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('Plaid-Verification');

  if (!signature) {
    return Response.json({ error: 'Missing signature' }, { status: 401 });
  }

  // 1. Decode JWT header (without verification) to get key ID
  const header = jwtDecode(signature, { header: true });
  if (header.alg !== 'ES256') {
    return Response.json({ error: 'Invalid algorithm' }, { status: 401 });
  }

  // 2. Fetch public key from Plaid
  const keyResponse = await plaidClient.webhookVerificationKeyGet({
    key_id: header.kid,
  });
  const publicKey = await jose.importJWK(keyResponse.data.key);

  // 3. Verify JWT signature and age (max 5 minutes)
  try {
    const { payload } = await jose.jwtVerify(signature, publicKey, {
      maxTokenAge: '5 min',
    });

    // 4. Verify body integrity (SHA-256)
    const bodyHash = createHash('sha256').update(body).digest('hex');
    if (bodyHash !== payload.request_body_sha256) {
      return Response.json({ error: 'Body tampered' }, { status: 401 });
    }
  } catch (err) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 5. Process the verified webhook
  const webhook = JSON.parse(body);
  await handleWebhook(webhook);

  return Response.json({ received: true });
}
```

### Webhook Types to Handle

| Webhook Type | Action |
|--------------|--------|
| `SYNC_UPDATES_AVAILABLE` | Call `/transactions/sync`, apply patches |
| `ITEM_ERROR` | Mark bank_connection status = 'error' |
| `PENDING_EXPIRATION` | Notify user to re-auth |
| `ITEM_LOGIN_REQUIRED` | Initiate update mode Link |

### Retry Behavior

Plaid retries failed webhooks (non-200 or no response within 10 seconds):
- Initial delay: 30 seconds
- Subsequent delays: 4x previous delay
- Max retry window: 24 hours

**Implication:** Webhook handler must be idempotent. Use `plaid_item_id` + `webhook_code` + timestamp to deduplicate.

---

## Audit Logging for Compliance

**Confidence:** MEDIUM (PostgreSQL patterns, not Supabase-specific)

### Immutable Audit Log Schema

```sql
-- Separate schema for isolation
CREATE SCHEMA IF NOT EXISTS audit;

-- Audit log table (INSERT-only, no UPDATE/DELETE)
CREATE TABLE audit.bank_data_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],  -- For updates, list of changed columns
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT now(),
  ip_address INET,
  user_agent TEXT,

  -- Immutability enforcement
  CONSTRAINT no_future_timestamps CHECK (changed_at <= now())
);

-- No UPDATE or DELETE policies - log is immutable
ALTER TABLE audit.bank_data_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audit log is append-only"
ON audit.bank_data_changes FOR INSERT
TO service_role
USING (true);

-- Explicit denial of modifications
CREATE POLICY "No updates to audit log"
ON audit.bank_data_changes FOR UPDATE
USING (false);

CREATE POLICY "No deletes from audit log"
ON audit.bank_data_changes FOR DELETE
USING (false);

-- Index for compliance queries
CREATE INDEX idx_audit_table_record ON audit.bank_data_changes(table_name, record_id);
CREATE INDEX idx_audit_changed_at ON audit.bank_data_changes(changed_at);
CREATE INDEX idx_audit_changed_by ON audit.bank_data_changes(changed_by);
```

### Trigger Function

```sql
CREATE OR REPLACE FUNCTION audit.log_bank_data_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit.bank_data_changes (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    changed_fields,
    changed_by,
    changed_at
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    CASE WHEN TG_OP = 'UPDATE' THEN
      ARRAY(SELECT key FROM jsonb_each(to_jsonb(NEW))
            WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key)
    END,
    auth.uid(),
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Apply Triggers to Sensitive Tables

```sql
-- Bank accounts
CREATE TRIGGER audit_bank_accounts
AFTER INSERT OR UPDATE OR DELETE ON bank_accounts
FOR EACH ROW EXECUTE FUNCTION audit.log_bank_data_change();

-- Transactions
CREATE TRIGGER audit_transactions
AFTER INSERT OR UPDATE OR DELETE ON bank_transactions
FOR EACH ROW EXECUTE FUNCTION audit.log_bank_data_change();

-- Category assignments (critical for 280E compliance)
CREATE TRIGGER audit_transaction_categories
AFTER INSERT OR UPDATE OR DELETE ON transaction_categories
FOR EACH ROW EXECUTE FUNCTION audit.log_bank_data_change();
```

### Soft Deletes Pattern

Never hard-delete financial data. Use soft deletes with audit trail.

```sql
ALTER TABLE bank_transactions ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE bank_transactions ADD COLUMN deleted_by UUID REFERENCES auth.users(id);

-- RLS policy excludes soft-deleted records
CREATE POLICY "Hide deleted transactions"
ON bank_transactions FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean = true
    OR entity_id = ANY(...)
  )
);
```

---

## Database Schema Overview

```sql
-- Business entities (cannabis vs non-cannabis for 280E)
CREATE TABLE business_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_cannabis BOOLEAN DEFAULT false,  -- 280E treatment flag
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bank connections (sensitive - service role only)
CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES business_entities(id),
  plaid_item_id TEXT UNIQUE NOT NULL,
  vault_secret_id UUID NOT NULL,  -- Reference to vault.secrets
  institution_name TEXT,
  status TEXT DEFAULT 'active',
  cursor TEXT,  -- For sync pagination
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bank accounts (derived from Plaid, RLS-protected)
CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES business_entities(id),
  connection_id UUID REFERENCES bank_connections(id),
  plaid_account_id TEXT UNIQUE NOT NULL,
  name TEXT,
  official_name TEXT,
  type TEXT,  -- checking, savings, credit, etc.
  subtype TEXT,
  mask TEXT,  -- Last 4 digits
  current_balance NUMERIC,
  available_balance NUMERIC,
  balance_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bank transactions (RLS-protected)
CREATE TABLE bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES business_entities(id),
  account_id UUID REFERENCES bank_accounts(id),
  plaid_transaction_id TEXT UNIQUE NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL,
  name TEXT,
  merchant_name TEXT,
  category TEXT[],  -- Plaid categories
  pending BOOLEAN DEFAULT false,

  -- 280E classification
  expense_type TEXT CHECK (expense_type IN ('cogs', 'operating', 'unclassified')),
  classification_source TEXT CHECK (classification_source IN ('auto', 'manual')),
  classified_by UUID REFERENCES auth.users(id),
  classified_at TIMESTAMPTZ,

  -- Soft delete
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_transactions_entity ON bank_transactions(entity_id);
CREATE INDEX idx_transactions_date ON bank_transactions(date);
CREATE INDEX idx_transactions_account ON bank_transactions(account_id);
CREATE INDEX idx_accounts_entity ON bank_accounts(entity_id);
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Application-Level Filtering Only

**What:** Relying on `WHERE entity_id = ?` in application code instead of RLS
**Why bad:** Single bug exposes all tenant data. No defense in depth.
**Instead:** Enable RLS, use app_metadata in JWT, application filters are redundant safety.

### Anti-Pattern 2: Storing Tokens in Regular Tables

**What:** `INSERT INTO bank_connections (access_token) VALUES ('access-xxx')`
**Why bad:** Tokens visible in backups, logs, replication streams.
**Instead:** Use Vault: `vault.create_secret()`, store only `vault_secret_id` reference.

### Anti-Pattern 3: Using anon Key for Webhook Handlers

**What:** Webhook API route using anon key for database writes
**Why bad:** RLS may block webhook writes; no user context available.
**Instead:** Use service role for webhooks; service role bypasses RLS.

### Anti-Pattern 4: Mutable Audit Logs

**What:** `UPDATE audit_log SET ...` or `DELETE FROM audit_log`
**Why bad:** Defeats purpose of audit trail; IRS requires immutability.
**Instead:** INSERT-only policies, separate schema with restricted roles.

### Anti-Pattern 5: Polling for Transaction Updates

**What:** Cron job calling `/transactions/get` every hour
**Why bad:** Wastes API calls, not real-time, may miss updates.
**Instead:** Use webhooks (`SYNC_UPDATES_AVAILABLE`), call `/transactions/sync` when notified.

---

## Suggested Build Order

Based on component dependencies:

### Phase 1: Foundation (Week 1)
1. **Business entities table** - No dependencies
2. **Vault extension enable** - Check if already enabled in Supabase project
3. **Admin Supabase client** - Service role setup in Next.js

### Phase 2: Plaid Integration (Week 2)
4. **Plaid SDK setup** - Environment variables, client initialization
5. **Link token endpoint** - `/api/plaid/link-token`
6. **Token exchange endpoint** - `/api/plaid/exchange-token` + Vault storage
7. **Bank connections table** - After Vault is working

### Phase 3: Data Layer (Week 3)
8. **Bank accounts table** - After bank_connections
9. **Bank transactions table** - After bank_accounts
10. **RLS policies** - After all tables exist
11. **Initial sync logic** - Pull historical transactions

### Phase 4: Real-time (Week 4)
12. **Webhook endpoint** - `/api/webhooks/plaid` with JWT verification
13. **Webhook handlers** - SYNC_UPDATES_AVAILABLE processing
14. **Sync worker** - Apply transaction patches

### Phase 5: Compliance (Week 5)
15. **Audit schema** - Separate schema, log table
16. **Audit triggers** - On all sensitive tables
17. **Soft delete implementation** - No hard deletes

### Phase 6: UI Integration (Week 6)
18. **Bank connection UI** - Plaid Link component
19. **Account dashboard** - Balance display
20. **Transaction views** - With 280E classification

---

## Sources

### HIGH Confidence (Official Documentation)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault) - Token encryption patterns
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) - RLS policy patterns
- [Supabase API Keys](https://supabase.com/docs/guides/api/api-keys) - Service role vs anon key
- [Plaid Webhook Verification](https://plaid.com/docs/api/webhooks/webhook-verification/) - JWT signature verification
- [Plaid Transactions Webhooks](https://plaid.com/docs/transactions/webhooks/) - Webhook types and handling

### MEDIUM Confidence (Multiple Sources Agree)
- [PostgreSQL Audit Trigger Wiki](https://wiki.postgresql.org/wiki/Audit_trigger) - Audit log patterns
- [Multi-Tenant RLS Patterns (AntStack)](https://www.antstack.com/blog/multi-tenant-applications-with-rls-on-supabase-postgress/) - app_metadata patterns
- [pgsodium Deprecation Notice](https://supabase.com/docs/guides/database/extensions/pgsodium) - Use Vault, not raw pgsodium

### LOW Confidence (Needs Validation)
- Exact pgAudit configuration for Supabase (may require support ticket)
- Statement logging configuration on managed Supabase (may have restrictions)
