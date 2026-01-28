# Project Research Summary

**Project:** Mary Financial Center - Banking Engine with 280E Compliance
**Domain:** Cannabis fintech - multi-entity financial management with regulatory compliance
**Researched:** 2026-01-28
**Confidence:** HIGH

## Executive Summary

Mary Financial Center is adding a real-time banking layer with Plaid integration to an existing Next.js/Supabase multi-entity financial dashboard. The project sits at the intersection of fintech (banking aggregation) and cannabis compliance (280E tax treatment). The recommended approach is defense-in-depth security: Supabase Vault for token encryption, RLS-enforced multi-tenant isolation, read-only Plaid scopes, and immutable audit logging for IRS compliance.

The core technical challenge is building a secure, multi-tenant banking aggregation layer that sits alongside existing QuickBooks integrations. Research shows the standard pattern is webhook-driven transaction sync with JWT verification, encrypted token storage, and database-enforced tenant isolation. The 280E compliance layer adds significant complexity requiring COGS vs Operating Expense classification with audit trail for every categorization change.

Key risks are access token exposure (catastrophic security breach), cross-tenant data leakage (regulatory violation), and 280E misclassification (IRS audit with 6-figure back taxes). Mitigation requires Vault-based encryption, forced RLS policies on all tables, and CPA-reviewed classification rules engine. The recommended phase structure prioritizes security foundation first, then Plaid integration, followed by 280E classification features.

## Key Findings

### Recommended Stack

The stack builds on existing Next.js 16 + Supabase infrastructure with Plaid-specific additions. Core decision: use **Supabase Vault** (not deprecated pgsodium) for access token encryption, and **jose** library (not jsonwebtoken) for webhook verification to support Edge Runtime.

**Core technologies:**
- **plaid 41.1.0**: Official Node.js SDK with TypeScript support, API version 2020-09-14
- **react-plaid-link 4.1.1**: Official React SDK with usePlaidLink hook, React 16.8-19.x compatible
- **Supabase Vault (built-in)**: AES-256 encrypted secret storage, replaces deprecated pgsodium
- **jose 6.1.3**: Zero-dependency ES256 JWT verification for webhooks, Edge Runtime compatible
- **js-sha256 0.11.0**: SHA-256 body hash verification for webhook integrity
- **secure-compare 3.0.1**: Constant-time comparison to prevent timing attacks

**Critical note:** pgsodium is explicitly deprecated by Supabase. Vault v0.3.1 (Jan 2025) removed pgsodium dependency. Use Vault for all token encryption.

**What NOT to use:**
- pgsodium directly (deprecated, migration burden)
- jsonwebtoken (older, no Edge support)
- Direct bank APIs (maintenance nightmare vs Plaid aggregator)
- Plain text token storage (security violation)

**Architecture integration:** Next.js App Router native `request.text()` for webhook body parsing, `@supabase/ssr` for server-side client, service role client for Vault operations.

### Expected Features

Cannabis multi-entity banking requires balancing table stakes features (real-time cash position, transaction search, entity-level filtering) with 280E-specific compliance features (COGS classification, audit trail, deductible expense tracking).

**Must have (table stakes):**
- Real-time cash balance per account - users expect current data, not days old
- Consolidated total cash position - "How much money do I have?" is the #1 question
- Entity-level account filtering - multi-entity users must see per-business views
- Transaction list with search - pagination, date filters, amount search
- Individual P&L per entity - each business needs its own financial view
- Consolidated P&L across entities - Mary needs aggregate view

**Must have (280E compliance):**
- Entity cannabis flag - determines 280E treatment applicability (boolean per business)
- COGS vs Operating Expense classification - core IRS requirement, only COGS deductible
- Classification audit trail - immutable log with who/when/what for IRS audits
- Visual distinction in P&L - deductible vs non-deductible must be clear
- Classification override with justification - humans must correct AI suggestions

**Should have (competitive differentiators):**
- AI-suggested 280E classification - reduce manual burden, Gemini integration
- Voice-activated cash queries - leverage existing voice infrastructure ("How much cash do I have?")
- Real-time low balance alerts - proactive notifications before overdraft
- QuickBooks reconciliation view - detect bank vs QB discrepancies

**Defer (v2+):**
- Multi-currency support - not needed for Arizona focus
- QB write-back - PROJECT.md specifies read-only
- Bulk classification - after AI classification proven
- Anomaly detection - requires transaction history buildup

**Anti-features (explicitly NOT build):**
- Money movement (ACH/transfers) - catastrophic risk, read-only scopes only
- Duplicate Chart of Accounts - QuickBooks is COA source of truth
- Auto-categorization without review - 280E misclassification has real tax consequences
- Real-time P&L from bank only - bank is for cash position, QB handles accounting

### Architecture Approach

The architecture is defense-in-depth security with three isolation layers: encryption (Vault), database-enforced policies (RLS), and read-only API scopes. Service role handles token operations, authenticated role handles user queries. Webhook-driven sync uses JWT verification with SHA-256 body hash. Audit logging uses PostgreSQL triggers for immutability.

**Major components:**
1. **Supabase Vault + Token Storage** - Encrypted access_token storage with AES-256, decryption via view, never stored decrypted. Service role only. Token reference stored in bank_connections table, never the token itself.
2. **RLS Policy Layer** - JWT app_metadata stores entity_ids array for performance. Tenant isolation via `entity_id = ANY(app_metadata.entity_ids)`. Super admin override with `is_super_admin` flag. No frontend access to bank_connections table.
3. **Plaid Integration Layer** - Link flow: link_token creation, user auth in Plaid UI, public_token exchange, access_token storage in Vault. Transaction sync: webhook triggers `/transactions/sync` call, applies patches (INSERT/UPDATE/DELETE), service role writes bypass RLS.
4. **Webhook Verification** - ES256 JWT signature verification: decode header for kid, fetch public key from Plaid, verify signature with jose, check timestamp <5min, compare SHA-256 body hash with constant-time algorithm.
5. **Audit Log System** - Append-only audit.bank_data_changes table, PostgreSQL triggers on INSERT/UPDATE/DELETE for all sensitive tables, captures old_data/new_data/changed_fields/user/timestamp. RLS policy: INSERT allowed, UPDATE/DELETE denied.

**Data flow pattern:** Frontend calls API routes (anon key) with RLS filtering data. API routes call Plaid (server-side secret), use service role for Vault/webhook writes (bypass RLS). Webhooks push updates, trigger sync, writes go through service role.

**Security boundaries:**
- Frontend (anon key) - never sees access_tokens, RLS-filtered data only
- API Routes (service role) - Plaid calls, Vault operations, webhook writes
- Database (RLS enforced) - tenant isolation at database level, application bugs can't bypass

### Critical Pitfalls

Research identified 5 catastrophic and 4 moderate pitfalls. The catastrophic ones require architecture decisions in foundation phase.

1. **Access Token Exposure** - Tokens exposed to frontend cause complete compromise of all linked bank accounts. Prevention: Vault storage only, RLS DENY all frontend access to token columns, never return access_token in API responses, audit logging for token leakage. Detection: grep for `access_token` in frontend code, check API responses. Severity: CATASTROPHIC.

2. **Cross-Tenant Data Leakage** - Business A sees Business B's transactions due to missing RLS. Prevention: Enable RLS on all tenant tables, use `ALTER TABLE ... FORCE ROW LEVEL SECURITY`, application user NOT table owner, JWT app_metadata for tenant context, integration tests asserting cross-tenant queries return zero rows. Detection: query pg_policies, test with different tenant context. Severity: CATASTROPHIC.

3. **Webhook Spoofing** - Fake Plaid webhooks inject malicious data. Prevention: 6-step verification (decode JWT, validate ES256 alg, fetch public key by kid, verify signature, check timestamp <5min, compare SHA-256 body hash with constant-time). Detection: monitor verification failures, alert on high rejection volume. Severity: HIGH (data integrity and fraud).

4. **280E COGS Misclassification** - Wrong categorization leads to IRS audit with massive back taxes. Prevention: CPA-reviewed classification rules, per-activity time tracking for mixed-role employees, facility square footage allocation documentation, separate federal vs state books. Detection: flag COGS with "marketing"/"advertising" keywords, monitor COGS-to-revenue ratio. Severity: CATASTROPHIC (6-figure tax liability).

5. **Audit Trail Gaps** - Missing change logs mean IRS audit cannot be satisfied. Prevention: append-only audit log with PostgreSQL triggers, capture user_id/action/old/new values, RLS policy denies UPDATE/DELETE on audit log, retain 10 years minimum. Detection: query for transactions with no change history, alert on audit log sequence gaps. Severity: HIGH (audit failure).

**Moderate pitfalls:** ITEM_LOGIN_REQUIRED not handled (stale data), rate limit exceeded without backoff (sync failures), mixed employee time not tracked (tax optimization issues), duplicate Item creation (billing waste).

## Implications for Roadmap

Based on research, the dependency chain requires security foundation first, then Plaid integration, followed by 280E features. The architecture demands that encryption, RLS, and audit logging are correct from day one - retrofitting security is dangerous.

### Phase 1: Security Foundation & Entity Model
**Rationale:** Multi-tenant isolation and audit infrastructure must exist before any banking data enters the system. RLS policies and Vault encryption cannot be added later without complete data migration.

**Delivers:**
- Business entities table with cannabis flag
- Supabase Vault extension enabled
- Service role admin client setup
- RLS policies framework
- Audit log schema with triggers
- Integration tests for tenant isolation

**Addresses:**
- Cross-tenant data leakage pitfall (RLS architecture)
- Audit trail gaps pitfall (immutable logging from start)
- Entity-level account filtering (table stakes)

**Avoids:** Retrofitting security later (PITFALLS.md warns this causes complete rewrites)

### Phase 2: Plaid Link & Token Exchange
**Rationale:** Bank connection infrastructure must be built with Vault encryption from the start. Token storage architecture errors are catastrophic and irreversible.

**Delivers:**
- Plaid SDK client initialization
- Link token creation endpoint
- PlaidLinkButton React component
- Token exchange flow with Vault storage
- Bank connections table
- Connection status tracking

**Uses:**
- plaid 41.1.0, react-plaid-link 4.1.1 (STACK.md)
- Supabase Vault for access_token encryption (STACK.md)
- Service role client for Vault operations (ARCHITECTURE.md)

**Addresses:**
- Bank account linking (table stakes)
- Account connection status (table stakes)
- Read-only bank access (security requirement)

**Avoids:** Access token exposure pitfall (PITFALLS.md #1 - CATASTROPHIC)

### Phase 3: Transaction Sync & Webhooks
**Rationale:** Webhook verification must be implemented correctly before processing any Plaid data. Real-time sync is the foundation for cash position accuracy.

**Delivers:**
- Bank accounts table
- Bank transactions table
- Webhook endpoint with JWT verification
- SYNC_UPDATES_AVAILABLE handler
- `/transactions/sync` integration
- Rate limiting and retry logic
- ITEM_LOGIN_REQUIRED handling

**Uses:**
- jose 6.1.3 for JWT verification (STACK.md)
- js-sha256 + secure-compare for body hash (STACK.md)
- Service role for webhook writes (ARCHITECTURE.md)

**Addresses:**
- Real-time cash balance per account (table stakes)
- Consolidated total cash position (table stakes)
- Transaction list with search (table stakes)

**Avoids:**
- Webhook spoofing pitfall (PITFALLS.md #3 - HIGH severity)
- Rate limit exceeded pitfall (PITFALLS.md #7 - MODERATE)

### Phase 4: 280E Classification Engine
**Rationale:** Classification rules must be CPA-reviewed before processing real transactions. 280E errors have real tax consequences, so build carefully with expert validation.

**Delivers:**
- Transaction classification schema
- COGS vs Operating categorization UI
- Classification rule engine (vendor-based, category-based, keyword-based)
- Manual override with justification field
- Classification audit trail (leverages Phase 1 audit system)
- Visual distinction in transaction views

**Implements:**
- 280E compliance features (FEATURES.md must-have)
- Audit log triggers for categorization changes (ARCHITECTURE.md)

**Addresses:**
- Entity cannabis flag (table stakes 280E)
- COGS vs Operating classification (table stakes 280E)
- Classification audit trail (table stakes 280E)

**Avoids:** 280E misclassification pitfall (PITFALLS.md #4 - CATASTROPHIC)

**Research flag:** Requires CPA review of classification rules before deployment.

### Phase 5: AI-Powered Classification
**Rationale:** AI suggestions come after manual classification is proven. This ensures fallback to manual process if AI fails and allows training data collection.

**Delivers:**
- Gemini integration for classification suggestions
- Confidence scoring display
- Bulk classification UI
- Learning from manual corrections
- Low-confidence transaction queue for review

**Addresses:**
- AI-suggested classification (differentiator)
- Intelligent 280E classification (competitive advantage)

**Avoids:** Auto-categorization without review anti-feature (FEATURES.md)

**Research flag:** Needs prompt engineering research during phase planning for accurate 280E-aware classification.

### Phase 6: Dashboard & Reporting
**Rationale:** UI comes last after data pipeline is proven. Reporting builds on existing P&L infrastructure, adding real banking data.

**Delivers:**
- Cash position dashboard (per-entity and consolidated)
- Enhanced individual entity P&L with bank data integration
- Enhanced consolidated P&L
- Deductible vs non-deductible visual distinction
- Account filtering UI

**Addresses:**
- Consolidated total cash position (table stakes)
- Individual P&L per entity (table stakes)
- Consolidated P&L across entities (table stakes)
- Visual distinction in P&L (280E requirement)

**Integrates:** Existing reporting infrastructure in codebase

### Phase 7: Voice & Alerts (Differentiators)
**Rationale:** Leverage existing voice infrastructure after core features are stable. These are "nice to have" differentiators that create delight but aren't blocking.

**Delivers:**
- Voice-activated cash queries
- Entity P&L voice commands
- 280E-aware voice queries
- Low balance alerts
- Large transaction alerts

**Addresses:**
- Voice-activated queries (differentiator)
- Real-time cash alerts (differentiator)

**Uses:** Existing ElevenLabs TTS and voice mode infrastructure (observed in codebase)

### Phase Ordering Rationale

**Security-first approach:** Phases 1-2 establish security boundaries before any banking data enters. PITFALLS.md research shows retrofitting RLS or Vault encryption causes complete rewrites.

**Dependency-driven ordering:** Entity model → Plaid integration → Transaction sync → Classification → UI. Each phase depends on prior phase stability. Cannot sync transactions without Plaid Link, cannot classify without transactions.

**Risk mitigation sequencing:** Manual 280E classification (Phase 4) before AI classification (Phase 5) ensures fallback to proven process. Dashboard (Phase 6) after data pipeline proven prevents UI churn.

**Deferred complexity:** Voice and alerts (Phase 7) are differentiators but not blocking. Building them first would distract from core banking/compliance features.

**Research-informed structure:** This phase order directly addresses the 5 critical pitfalls identified in research by ensuring security foundation precedes data ingestion.

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 2 (Plaid Link):** Needs `/gsd:research-phase` for Plaid Link update mode flow and error handling patterns (ITEM_LOGIN_REQUIRED scenarios)
- **Phase 3 (Webhooks):** Needs `/gsd:research-phase` for webhook retry patterns and idempotency strategies (Plaid retries failed webhooks up to 24 hours)
- **Phase 4 (280E Rules):** Needs CPA consultation and potentially `/gsd:research-phase` for labor allocation patterns and mixed-use employee time tracking integration
- **Phase 5 (AI Classification):** Needs `/gsd:research-phase` for prompt engineering and Gemini classification accuracy tuning

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** RLS patterns and Vault usage well-documented in Supabase docs
- **Phase 6 (Dashboard):** Existing UI infrastructure in codebase, standard React patterns
- **Phase 7 (Voice/Alerts):** Existing voice infrastructure in codebase, simple integration

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Plaid SDK versions verified via npm (2026-01-28), Supabase Vault confirmed as pgsodium replacement in official docs, jose library recommended by Plaid docs |
| Features | MEDIUM | Cannabis 280E requirements HIGH (IRS + CPA sources), but multi-entity dashboard patterns MEDIUM (multiple vendor sources agree but not authoritative) |
| Architecture | HIGH | Official Plaid webhook verification docs, Supabase RLS patterns from official docs, Vault encryption confirmed, PostgreSQL audit trigger patterns well-established |
| Pitfalls | HIGH | Access token exposure, webhook spoofing, and 280E misclassification risks verified from official Plaid docs and IRS guidance. RLS leakage patterns from AWS/Postgres authoritative sources |

**Overall confidence:** HIGH

Research is authoritative for security (Plaid official), database patterns (Supabase/Postgres official), and 280E compliance (IRS + CPA sources). Medium confidence areas are feature prioritization (vendor sources) and exact time-tracking integrations (implementation-dependent).

### Gaps to Address

**Gap 1: Time tracking integration approach**
- **Issue:** 280E compliance requires per-activity time tracking for mixed-role employees (budtender who also packages). Research shows this is critical for labor COGS allocation, but integration approach depends on whether Mary uses external time tracking system or needs built-in.
- **How to handle:** Clarify during Phase 4 planning - either integrate with existing time tracking system (ADP, Gusto) or build manual percentage allocation UI.

**Gap 2: QuickBooks write-back capabilities**
- **Issue:** PROJECT.md specifies "read from QuickBooks, don't write back," but FEATURES.md mentions "one-click QB categorization." Need to confirm if this means read-only display of QB categories or actual write-back.
- **How to handle:** Confirm with user during Phase 6 planning. Default to read-only view unless write-back explicitly requested.

**Gap 3: Webhook development environment setup**
- **Issue:** Webhooks require public URL for Plaid to call. Development environment needs ngrok or Vercel preview deployments for webhook testing.
- **How to handle:** Document in Phase 3 setup. Test webhook verification with Plaid sandbox, use ngrok for local development.

**Gap 4: Cannabis-specific COA structure**
- **Issue:** QuickBooks Chart of Accounts structure for cannabis businesses varies by CPA. Research shows COGS categories must be clearly separated, but exact account structure depends on Mary's accountants.
- **How to handle:** During Phase 4, review existing QuickBooks account structure with accountants. Build classification rules to map QB accounts to COGS vs Operating.

**Gap 5: State vs Federal 280E treatment**
- **Issue:** Some states have decoupled from 280E (Illinois mentioned in research). If Mary operates in multiple states, may need dual-book capability.
- **How to handle:** Confirm during Phase 4 if Arizona has state-specific 280E treatment. Default to federal-only for MVP, flag for Phase 2 if needed.

## Sources

### Primary (HIGH confidence)
- [Plaid API Libraries](https://plaid.com/docs/api/libraries/) - SDK versions and usage patterns
- [Plaid Webhook Verification](https://plaid.com/docs/api/webhooks/webhook-verification/) - JWT signature verification steps
- [Supabase Vault](https://supabase.com/docs/guides/database/vault) - Encrypted secret storage replacing pgsodium
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) - Multi-tenant isolation patterns
- [pgsodium Deprecation](https://supabase.com/docs/guides/database/extensions/pgsodium) - Official deprecation notice
- [TheCannaCPAs 280E Breakdown](https://thecannacpas.com/deductible-vs-non-deductible-expenses-under-280e-a-practical-breakdown/) - COGS vs Operating classification
- [IRS Topic 305 Recordkeeping](https://www.irs.gov/taxtopics/tc305) - Audit trail requirements

### Secondary (MEDIUM confidence)
- [Volopay - Consolidated Dashboards](https://www.volopay.com/blog/consolidated-dashboards-for-multi-entity-finances/) - Multi-entity feature expectations
- [Phoenix Strategy Group - Real-Time Dashboards](https://www.phoenixstrategy.group/blog/real-time-dashboards-multi-entity-reporting) - Dashboard feature patterns
- [Fathom HQ - Consolidated Reporting](https://www.fathomhq.com/features/consolidated-financial-reporting) - P&L consolidation patterns
- [AWS RLS for Multi-Tenant](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) - RLS policy patterns
- [Crunchy Data RLS Pitfalls](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) - Common RLS mistakes
- [PostgreSQL Audit Trigger Wiki](https://wiki.postgresql.org/wiki/Audit_trigger) - Audit logging patterns
- [Green Growth CPAs Cannabis COGS](https://greengrowthcpas.com/cannabis-cogs-cost-tracking-and-allocation-for-cannabis-businesses/) - Labor allocation guidance

### Tertiary (LOW confidence - needs validation)
- Competitive cannabis accounting software features (Illumify, Distru, Adilas) - vendor marketing materials
- AI-powered 280E classification tools - emerging market, limited references
- Multi-currency consolidation patterns - not applicable to Arizona focus but researched for completeness

---
*Research completed: 2026-01-28*
*Ready for roadmap: YES*
