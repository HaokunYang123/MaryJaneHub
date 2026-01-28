# Technology Stack: Plaid Banking Integration

**Project:** Mary Financial Center — Banking Engine
**Researched:** 2026-01-28
**Overall Confidence:** HIGH

---

## Recommended Stack

### Core Plaid Integration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `plaid` | 41.1.0 | Server-side Plaid API client | Official Node.js SDK, TypeScript-native, monthly updates. Supports API version 2020-09-14 (latest stable). | HIGH |
| `react-plaid-link` | 4.1.1 | Plaid Link frontend component | Official React SDK with `usePlaidLink` hook. TypeScript built-in, supports React 16.8-19.x (compatible with Next.js 16). | HIGH |

**Source:** [npm registry](https://www.npmjs.com/package/plaid), [Plaid API Libraries docs](https://plaid.com/docs/api/libraries/)

### Security Layer

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Supabase Vault | Built-in | Encrypted secret storage | Stores Plaid access_tokens with AES-256 encryption. Keys never stored alongside data. Decryption via `vault.decrypted_secrets` view. | HIGH |
| `jose` | 6.1.3 | JWT verification for webhooks | Zero-dependency ES256 JWT handling. Required for Plaid webhook signature verification. Works in Edge Runtime. | HIGH |
| RLS Policies | PostgreSQL native | Multi-tenant data isolation | Database-enforced security. Frontend cannot bypass. Standard for Supabase multi-tenant apps. | HIGH |

**Source:** [Supabase Vault docs](https://supabase.com/docs/guides/database/vault), [jose GitHub](https://github.com/panva/jose)

### Webhook Handling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `jose` | 6.1.3 | JWT decode/verify | Plaid signs webhooks with ES256 JWTs. jose handles JWK fetching and signature verification. | HIGH |
| `js-sha256` | 0.11.0 | Body hash verification | Plaid requires SHA-256 hash of raw body for webhook integrity check. | MEDIUM |
| `secure-compare` | 3.0.1 | Timing-safe comparison | Prevents timing attacks when comparing hashes. Plaid explicitly recommends constant-time comparison. | MEDIUM |

**Alternative:** The Plaid documentation sample uses `jwt-decode` + `jose` + `js-sha256` + `secure-compare`. This is the canonical pattern.

**Source:** [Plaid Webhook Verification docs](https://plaid.com/docs/api/webhooks/webhook-verification/)

### Database Schema

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Supabase PostgreSQL | 15+ | Primary data store | Already in use. Supports RLS, Vault, triggers. No additional DB needed. | HIGH |
| `pgsodium` | Pending deprecation | Transparent Column Encryption | **DO NOT USE** — Supabase has announced deprecation. Use Vault instead. | HIGH |

**Critical Note:** pgsodium is explicitly marked "pending deprecation" by Supabase. Vault v0.3.1 (Jan 2025) removed pgsodium dependency. The project constraint mentions pgsodium but the correct choice is Supabase Vault, which provides the same functionality without deprecation risk.

**Source:** [pgsodium deprecation notice](https://supabase.com/docs/guides/database/extensions/pgsodium)

---

## What NOT to Use (and Why)

| Do Not Use | Why | Use Instead |
|------------|-----|-------------|
| `pgsodium` directly | Pending deprecation by Supabase. Migration burden coming. | Supabase Vault |
| `micro` for body parsing | Only needed for Pages Router. App Router has native `request.text()`. | Native `request.text()` |
| `jsonwebtoken` | Older, larger bundle, no Edge Runtime support. | `jose` (zero-dep, Edge-compatible) |
| `svix` | General webhook platform. Plaid has its own verification scheme. | Plaid's JWT verification pattern |
| `@types/react-plaid-link` | Stub package. Types are built into `react-plaid-link`. | Nothing (types included) |
| Direct bank APIs | One-off integrations per bank. Maintenance nightmare. | Plaid aggregator |
| Plain text token storage | Security violation. Leaks expose all connected accounts. | Vault encryption |
| Application-layer tenant filtering | Code bugs can expose cross-tenant data. | RLS policies (database-enforced) |

---

## Installation

```bash
# Core Plaid integration
npm install plaid@^41.1.0 react-plaid-link@^4.1.1

# Webhook verification
npm install jose@^6.1.3 js-sha256@^0.11.0 secure-compare@^3.0.1
```

No additional Supabase packages needed — `@supabase/supabase-js` and `@supabase/ssr` already in project.

---

## Architecture Integration

### Existing Stack (from package.json)

| Package | Version | Notes |
|---------|---------|-------|
| `next` | 16.1.2 | App Router compatible |
| `@supabase/supabase-js` | ^2.90.1 | Client SDK |
| `@supabase/ssr` | ^0.8.0 | SSR client factory |
| `react` | 19.2.3 | Compatible with react-plaid-link |

### New Components

```
src/
  app/
    api/
      plaid/
        link-token/route.ts    # POST: Create link_token
        exchange/route.ts       # POST: Exchange public_token
        webhook/route.ts        # POST: Receive Plaid webhooks
  lib/
    plaid/
      client.ts                 # Plaid API client singleton
      webhooks.ts               # Webhook verification logic
      scopes.ts                 # Scope constants (READ_ONLY)
  components/
    banking/
      PlaidLinkButton.tsx       # usePlaidLink wrapper
```

---

## Security Implementation

### Token Storage (Supabase Vault)

```sql
-- Store encrypted access token
SELECT vault.create_secret(
  'access-prod-abc123...',           -- Plaid access_token
  'plaid_token_' || item_id,          -- Unique name
  'Plaid access token for ' || institution_name
);

-- Retrieve for server-side use only
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE name = 'plaid_token_' || $1;
```

**Critical:** Never expose `vault.decrypted_secrets` to frontend roles. RLS policy:

```sql
-- Deny all frontend access to vault
CREATE POLICY "Vault is server-only" ON vault.secrets
FOR ALL USING (false);
```

### RLS for Bank Connections

```sql
-- Bank connections table
CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  business_id UUID REFERENCES businesses(id),
  item_id TEXT NOT NULL,
  institution_name TEXT,
  -- access_token stored in Vault, NOT here
  vault_secret_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Users see only their connections
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own connections" ON bank_connections
FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM user_business_access
    WHERE user_id = auth.uid() AND business_id = bank_connections.business_id
  )
);
```

### Webhook Verification

```typescript
// src/app/api/plaid/webhook/route.ts
import { NextRequest } from 'next/server';
import * as jose from 'jose';
import sha256 from 'js-sha256';
import secureCompare from 'secure-compare';

export async function POST(request: NextRequest) {
  // Get raw body (App Router native, no config needed)
  const rawBody = await request.text();

  // Extract JWT from header
  const plaidVerification = request.headers.get('Plaid-Verification');
  if (!plaidVerification) {
    return new Response('Missing verification header', { status: 401 });
  }

  // Verify webhook signature
  const isValid = await verifyPlaidWebhook(rawBody, plaidVerification);
  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  // Process webhook
  const payload = JSON.parse(rawBody);
  // ... handle different webhook types

  return new Response('OK', { status: 200 });
}

async function verifyPlaidWebhook(
  rawBody: string,
  verificationHeader: string
): Promise<boolean> {
  try {
    // Decode JWT header without verification to get kid
    const { kid, alg } = jose.decodeProtectedHeader(verificationHeader);

    if (alg !== 'ES256') return false;

    // Fetch public key from Plaid
    const jwk = await fetchPlaidPublicKey(kid);
    const publicKey = await jose.importJWK(jwk, 'ES256');

    // Verify JWT signature
    const { payload } = await jose.jwtVerify(verificationHeader, publicKey);

    // Check timestamp (within 5 minutes)
    const iat = payload.iat as number;
    const now = Math.floor(Date.now() / 1000);
    if (now - iat > 300) return false;

    // Verify body hash
    const expectedHash = payload.request_body_sha256 as string;
    const actualHash = sha256(rawBody);

    return secureCompare(expectedHash, actualHash);
  } catch {
    return false;
  }
}
```

---

## Plaid Scopes (Read-Only)

```typescript
// src/lib/plaid/scopes.ts
export const PLAID_PRODUCTS = ['transactions'] as const;

// Explicitly NO:
// - 'transfer' (money movement)
// - 'payment_initiation' (money movement)
// - 'signal' (payment scoring)

export const PLAID_COUNTRY_CODES = ['US'] as const;
```

This enforces the project constraint: "Read-only scopes mean even a full breach can't move money."

---

## Environment Variables

```env
# Plaid credentials (server-only)
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox  # sandbox | development | production

# Webhook receiver (public URL for Plaid to call)
PLAID_WEBHOOK_URL=https://yourdomain.com/api/plaid/webhook

# Existing Supabase (already in project)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  # For Vault access
```

**Never expose `PLAID_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` to the client.**

---

## Version Compatibility Matrix

| Component | Minimum | Recommended | Maximum | Notes |
|-----------|---------|-------------|---------|-------|
| Next.js | 14.0 | 16.x | latest | App Router required for `request.text()` |
| React | 16.8 | 19.x | 19.x | react-plaid-link hooks require 16.8+ |
| Node.js | 18.x | 20.x LTS | 22.x | jose 6.x CJS requires Node 20.19+ |
| plaid | 40.x | 41.x | latest | Monthly releases, stay current |
| react-plaid-link | 3.x | 4.x | latest | TypeScript built-in |

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|------------|-----------|
| Plaid SDK versions | HIGH | Verified via `npm view` on 2026-01-28 |
| Supabase Vault | HIGH | Official docs confirm as pgsodium replacement |
| Webhook verification | HIGH | Pattern from official Plaid docs + reference implementation |
| jose library | HIGH | Verified version, recommended by Plaid docs |
| RLS patterns | HIGH | Standard Supabase multi-tenant pattern |
| pgsodium deprecation | HIGH | Explicit deprecation notice in Supabase docs |

---

## Sources

### Official Documentation
- [Plaid API Libraries](https://plaid.com/docs/api/libraries/) - SDK references
- [Plaid Webhook Verification](https://plaid.com/docs/api/webhooks/webhook-verification/) - Signature verification
- [Supabase Vault](https://supabase.com/docs/guides/database/vault) - Encrypted secret storage
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) - Row Level Security
- [pgsodium Deprecation](https://supabase.com/docs/guides/database/extensions/pgsodium) - Do not use

### Package Registries
- [plaid on npm](https://www.npmjs.com/package/plaid) - v41.1.0
- [react-plaid-link on npm](https://www.npmjs.com/package/react-plaid-link) - v4.1.1
- [jose on npm](https://www.npmjs.com/package/jose) - v6.1.3

### GitHub
- [plaid-node](https://github.com/plaid/plaid-node) - TypeScript SDK
- [react-plaid-link](https://github.com/plaid/react-plaid-link) - React bindings
- [panva/jose](https://github.com/panva/jose) - JWT library

---

## Roadmap Implications

1. **Phase 1: Foundation** — Set up Plaid client, Vault tables, RLS policies. No frontend yet.
2. **Phase 2: Link Integration** — PlaidLinkButton component, token exchange flow.
3. **Phase 3: Webhooks** — Webhook receiver with signature verification. Test with ngrok in dev.
4. **Phase 4: Transaction Sync** — Pull transactions, store in DB, trigger 280E classification.

**Research flag:** Webhook testing requires public URL. Use ngrok or Vercel preview deployments for development.
