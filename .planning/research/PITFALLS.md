# Domain Pitfalls: Plaid Integration + 280E Cannabis Compliance

**Domain:** Cannabis fintech banking dashboard with Plaid and 280E compliance
**Researched:** 2026-01-28
**Overall confidence:** HIGH (verified with official Plaid docs and IRS/tax guidance)

---

## Critical Pitfalls

Mistakes that cause security breaches, audit failures, or costly rewrites.

---

### Pitfall 1: Access Token Exposure to Frontend

**What goes wrong:** Plaid access tokens get exposed in client-side code, logs, or API responses visible to the browser. Tokens are long-lived and grant full read access to a user's bank accounts.

**Why it happens:**
- Developers treat access tokens like session tokens
- Debug logging includes full API responses
- API routes return raw Plaid responses without filtering
- Frontend state management stores tokens for "convenience"

**Consequences:**
- Complete compromise of all linked bank accounts
- Attackers can read transaction history indefinitely
- No automatic expiration — tokens remain valid until explicitly rotated
- Potential liability for any resulting fraud

**Prevention:**
1. Store access tokens ONLY in server-side encrypted storage (Supabase Vault with pgsodium)
2. Create RLS policies that explicitly DENY all frontend/anon access to token columns
3. Never return access tokens in any API response — only return `item_id` or internal identifiers
4. Audit all logging to ensure tokens aren't captured in error messages or request dumps
5. Use GitGuardian or similar to scan for token leakage in commits

**Detection:**
- Grep codebase for `access_token` in frontend directories
- Check API route responses for token fields
- Monitor Plaid dashboard for unusual access patterns
- Review server logs for token values in stack traces

**Phase:** Foundation phase — token storage architecture must be correct from day one

**Severity:** CATASTROPHIC — full financial data exposure

**Sources:**
- [Plaid API Overview - Token Security](https://plaid.com/docs/api/)
- [GitGuardian Plaid Token Remediation](https://www.gitguardian.com/remediation/plaid-access-token)
- [Plaid Launch Checklist](https://plaid.com/docs/launch-checklist/)

---

### Pitfall 2: Cross-Tenant Data Leakage via Missing RLS

**What goes wrong:** Business A's transactions or bank connections are visible to Business B due to missing or misconfigured Row Level Security policies.

**Why it happens:**
- RLS not enabled on new tables (must explicitly call `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- Application connects as table owner, which bypasses RLS by default
- Views bypass RLS when owned by privileged roles
- Multiple RLS policies combine with OR (permissive), not AND
- Missing tenant_id column on tables that need isolation
- JOIN queries that cross tenant boundaries

**Consequences:**
- Competitor sees another business's cash flow
- Regulatory violations (financial data privacy)
- Complete loss of customer trust
- Potential legal liability

**Prevention:**
1. Every table with tenant data MUST have `tenant_id` column and RLS enabled
2. Application database user MUST NOT be the table owner
3. Force RLS on table owners: `ALTER TABLE ... FORCE ROW LEVEL SECURITY`
4. Use `SET app.current_tenant` session variable, not per-user database roles
5. Integration tests that assert cross-tenant queries return zero rows
6. Views must use `SECURITY INVOKER` not `SECURITY DEFINER`
7. When using multiple policies, explicitly use `AS RESTRICTIVE` for AND behavior

**Detection:**
- Query `pg_policies` to verify all tenant tables have policies
- Test: connect as app user, set tenant A, query for tenant B data
- Automated test suite that validates isolation on every table

**Phase:** Database schema phase — RLS architecture defined before first migration

**Severity:** CATASTROPHIC — regulatory and trust violation

**Sources:**
- [AWS RLS for Multi-Tenant](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Crunchy Data RLS Pitfalls](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres)
- [Permit.io RLS Best Practices](https://www.permit.io/blog/postgres-rls-implementation-guide)

---

### Pitfall 3: Webhook Spoofing (Fake Plaid Webhooks)

**What goes wrong:** Attacker sends fake webhooks that appear to come from Plaid, injecting malicious transaction data or triggering unauthorized actions.

**Why it happens:**
- Webhook endpoint accepts any POST without verification
- JWT signature verification skipped or incorrectly implemented
- Webhook key caching not implemented, leading to skipped checks
- Replay attacks accepted (no timestamp validation)
- Hash comparison vulnerable to timing attacks

**Consequences:**
- Fake transactions inserted into database
- Incorrect financial reporting
- Potential for sophisticated fraud

**Prevention:**
1. Extract `Plaid-Verification` header and decode JWT
2. Validate `alg` is exactly `"ES256"` — reject all others
3. Call `/webhook_verification_key/get` to retrieve public key by `kid`
4. Verify JWT signature using the JWK
5. Check `iat` timestamp — reject webhooks older than 5 minutes
6. Compute SHA-256 of request body, compare to `request_body_sha256` in JWT
7. Use constant-time comparison for hash verification (prevents timing attacks)
8. Note: Plaid uses tab-spacing of 2 in webhook body — whitespace matters for hash

**Detection:**
- Monitor for verification failures in webhook logs
- Alert on high volume of rejected webhooks (potential attack)
- Track time between webhook receipt and `iat` timestamp

**Phase:** Webhook infrastructure phase — verification required before processing any webhooks

**Severity:** HIGH — data integrity and fraud risk

**Sources:**
- [Plaid Webhook Verification Docs](https://plaid.com/docs/api/webhooks/webhook-verification/)
- [Plaid Webhooks Overview](https://plaid.com/docs/api/webhooks/)

---

### Pitfall 4: 280E COGS vs Operating Expense Misclassification

**What goes wrong:** Expenses that should be non-deductible operating costs (rent, marketing, admin salaries) get classified as COGS, or vice versa. IRS audit triggers and back taxes result.

**Why it happens:**
- Generic accounting software lacks cannabis-specific chart of accounts
- Mixed-use employees (budtender who also packages) tracked as single category
- Shared facilities (retail + cultivation) allocated incorrectly
- Trying to "stretch" COGS definitions to reduce tax burden
- No time tracking for employees performing multiple roles
- Confusing state-level 280E decoupling with federal requirements

**Consequences:**
- IRS audit with penalties and interest
- Effective tax rates can exceed 70% when COGS underreported
- Harborside-style court case resulting in massive back taxes
- Classification changes after filing require amended returns

**Prevention:**
1. Maintain separate chart of accounts for 280E-eligible vs non-eligible costs
2. Implement per-activity time tracking for employees in mixed roles
3. Document facility square footage allocation with floor plans
4. Only include direct production costs in COGS: materials, direct labor, direct overhead
5. Never include: marketing, sales salaries, general admin, non-production utilities
6. Maintain detailed work papers showing cost allocation methodology
7. Use Section 471-11 compliant inventory accounting
8. Keep federal and state books separate where states decouple from 280E

**Detection:**
- Flag transactions categorized as COGS that contain keywords: "marketing", "advertising", "consulting", "legal", "office supplies"
- Monitor COGS-to-revenue ratio — unusually high ratios attract IRS attention
- Regular CPA review of categorization rules

**Phase:** Classification rules engine phase — 280E logic built before first transaction categorization

**Severity:** CATASTROPHIC — audit results in 6-figure tax liability adjustments

**Sources:**
- [TheCannaCPAs 280E Breakdown](https://thecannacpas.com/deductible-vs-non-deductible-expenses-under-280e-a-practical-breakdown/)
- [Bennett Thrasher 280E Compliance](https://www.btcpa.net/questions/how-cannabis-businesses-can-ensure-280e-tax-compliance)
- [Sussman CPA 280E Dos and Don'ts](https://sussman.cpa/blog/the-dos-and-donts-of-cannabis-280e-tax-avoidance-how-not-to-trip-landmines)

---

### Pitfall 5: Audit Trail Gaps

**What goes wrong:** Classification changes happen without logging who changed what, when. IRS audit cannot be satisfied because there's no paper trail.

**Why it happens:**
- Standard UPDATE statements overwrite history
- Soft deletes implemented inconsistently
- User identity not captured in change records
- Timestamps use application time instead of database server time
- Log table not append-only (can be modified)

**Consequences:**
- IRS disallows deductions due to lack of documentation
- Cannot prove categorization methodology was consistent
- Accountant cannot reconstruct year-end positions
- Fraudulent changes cannot be detected or attributed

**Prevention:**
1. Create append-only audit log table with immutable structure
2. Use PostgreSQL triggers to capture every INSERT/UPDATE/DELETE
3. Record: `user_id`, `action`, `old_values`, `new_values`, `changed_at` (server time)
4. RLS policy: users can INSERT into audit log, never UPDATE or DELETE
5. Database-level constraint preventing audit log modification
6. Retain audit logs for 10 years minimum (IRS extended statute of limitations)
7. Include request_id/session_id for tracing back to user action

**Detection:**
- Query audit log for transactions with no change history
- Alert on gaps in audit log sequence numbers
- Periodic reconciliation: transaction count vs audit entries

**Phase:** Database schema phase — audit infrastructure required before any categorization features

**Severity:** HIGH — audit failure, potential fraud liability

**Sources:**
- [Sam Brotman Cannabis Tax Audit Guide](https://sambrotman.com/the-ultimate-guide-to-taxation-pitfalls-of-the-cannabis-industry/what-the-irs-is-looking-for-in-a-cannabis-tax-audit/)
- [MGO Cannabis Audit Preparation](https://www.mgocpa.com/perspective/how-to-prepare-your-cannabis-business-for-a-tax-audit/)
- [IRS Topic 305 Recordkeeping](https://www.irs.gov/taxtopics/tc305)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or user experience issues.

---

### Pitfall 6: ITEM_LOGIN_REQUIRED Not Handled

**What goes wrong:** User's bank login expires or MFA changes, Plaid connection breaks, but app doesn't surface this to user or provide re-authentication flow.

**Why it happens:**
- Webhook listener missing for `ITEM_LOGIN_REQUIRED`
- No UI for Plaid Link update mode
- Error swallowed silently during sync attempts
- User sees stale data without realizing connection is broken

**Consequences:**
- Days or weeks of missing transactions
- User believes cash position is current when it's stale
- Sync failures accumulate without visibility

**Prevention:**
1. Subscribe to `ITEM_LOGIN_REQUIRED` webhook
2. Track `item_status` on bank_connections table
3. Surface connection health in UI with clear "reconnect" action
4. Implement Plaid Link update mode (different token parameters)
5. Remember: access token doesn't change after re-auth — same token works again
6. Handle OAuth-specific errors: `OAUTH_CONSENT_EXPIRED`, `OAUTH_USER_REVOKED`

**Detection:**
- Monitor `item_status` for items stuck in error state
- Alert if item hasn't synced successfully in 48 hours
- Track `LOGIN_REPAIRED` webhooks to dismiss stale warnings

**Phase:** Sync infrastructure phase — error handling built alongside happy path

**Severity:** MODERATE — data staleness, user frustration

**Sources:**
- [Plaid Item Errors](https://plaid.com/docs/errors/item/)
- [Plaid Update Mode](https://plaid.com/docs/link/update-mode/)

---

### Pitfall 7: Rate Limit Exceeded Without Backoff

**What goes wrong:** Application hits Plaid rate limits, retries immediately, gets blocked harder. Initial data sync for account with years of history fails repeatedly.

**Why it happens:**
- No exponential backoff in retry logic
- Parallel requests for multiple accounts without throttling
- Historical transaction fetch doesn't paginate properly
- Sandbox testing doesn't reveal production rate limits

**Consequences:**
- Failed syncs, missing data
- Plaid account flagged for abuse
- Poor user experience during onboarding

**Prevention:**
1. Implement exponential backoff: 1s, 2s, 4s, 8s, max 60s
2. Respect `Retry-After` header when present
3. Queue sync jobs and process serially per user
4. Use pagination for `/transactions/sync` — don't fetch all at once
5. Implement circuit breaker: stop retrying after N failures, alert ops
6. Use idempotency keys for transfer operations (if ever added)

**Detection:**
- Log all `RATE_LIMIT_EXCEEDED` errors with endpoint and context
- Monitor retry counts — high retries indicate systematic issue
- Track time-to-complete for initial syncs

**Phase:** Sync infrastructure phase — retry logic designed before production load

**Severity:** MODERATE — operational issues, data gaps

**Sources:**
- [Plaid Rate Limit Errors](https://plaid.com/docs/errors/rate-limit-exceeded/)
- [Plaid Errors Overview](https://plaid.com/docs/errors/)

---

### Pitfall 8: Mixed Employee Time Not Tracked

**What goes wrong:** Cannabis business has employees who split time between production (COGS-eligible) and sales (non-deductible). Without tracking, either under-deducting COGS (paying more tax) or over-deducting (audit risk).

**Why it happens:**
- Time tracking seems like overhead
- Employees resist tracking tasks
- System doesn't support per-activity time allocation
- Year-end estimates used instead of actual tracking

**Consequences:**
- COGS calculations either too high (audit) or too low (overpaying tax)
- IRS specifically scrutinizes labor allocation in cannabis audits
- Cannot defend categorization methodology

**Prevention:**
1. Implement time tracking with activity codes (production, packaging, sales, admin)
2. Define clear rules: which tasks qualify for COGS labor
3. Generate reports showing labor hours by category for each employee
4. Allow transaction-level labor allocation adjustment
5. Store allocation methodology documentation in system

**Detection:**
- Flag employees with 100% single-category allocation — probably wrong
- Compare labor COGS percentage to industry benchmarks
- Monthly review of time tracking completeness

**Phase:** 280E rules engine phase — time tracking integration or manual adjustment capability

**Severity:** MODERATE — tax optimization and audit defense

**Sources:**
- [Green Growth CPAs Cannabis COGS](https://greengrowthcpas.com/cannabis-cogs-cost-tracking-and-allocation-for-cannabis-businesses/)
- [Wurk 280E Labor Tracking](https://info.enjoywurk.com/cannabis-resource-center/280e-tax-deductions-compliance-strategy-explained)

---

### Pitfall 9: Duplicate Item Creation

**What goes wrong:** User connects same bank account multiple times, creating duplicate Items in Plaid. Each Item is billed, transactions are duplicated, reconciliation becomes impossible.

**Why it happens:**
- Link flow doesn't check for existing Items
- User abandons flow and restarts
- Account number matching fails due to format differences
- Test Items left in production database

**Consequences:**
- Double billing from Plaid
- Duplicate transactions pollute data
- Cash position appears doubled
- Complex cleanup required

**Prevention:**
1. Before Link flow, check for existing Items with same institution
2. Use account number fingerprint to detect duplicates (hash of masked number + institution)
3. Implement Item deduplication on webhook receipt
4. Clean up Items via `/item/remove` when user disconnects
5. Prevent multiple simultaneous Link sessions for same user

**Detection:**
- Query for users with multiple Items at same institution
- Alert on sudden balance jumps (might be duplicate)
- Monitor Plaid billing for unexpected Item counts

**Phase:** Link integration phase — duplicate detection before Item storage

**Severity:** MODERATE — billing waste, data quality issues

**Sources:**
- [Plaid Launch Checklist](https://plaid.com/docs/launch-checklist/)

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable without major rework.

---

### Pitfall 10: Webhook IP Allowlist Not Configured

**What goes wrong:** Webhook endpoint accepts requests from any IP, making spoofing easier even with signature verification.

**Prevention:**
1. Obtain Plaid's webhook IP ranges from documentation
2. Configure firewall/WAF to allow only those IPs to webhook endpoint
3. Combine with signature verification for defense in depth

**Phase:** Infrastructure phase

**Severity:** LOW — defense in depth measure

---

### Pitfall 11: Products Array Misconfigured

**What goes wrong:** Link token created with incorrect products array — either missing needed products (can't get balance) or including unnecessary ones (extra billing, institutions filtered out).

**Prevention:**
1. Only request `transactions` and `balance` — explicitly no `auth` or `transfer`
2. Test that desired institutions appear in Link flow
3. Review Plaid billing to ensure only expected products are charged

**Phase:** Link integration phase

**Severity:** LOW — billing or feature issues

---

### Pitfall 12: State vs Federal 280E Confusion

**What goes wrong:** Business deducts expenses at state level that are non-deductible federally, but uses same books for both. Or vice versa — misses state deductions because following federal rules.

**Prevention:**
1. Maintain separate tracking for federal vs state deductibility
2. Document which states have decoupled from 280E
3. Classification rules engine must support dual treatment
4. Generate separate reports for federal and state tax preparation

**Phase:** 280E rules engine phase — dual-book capability

**Severity:** LOW — tax optimization, not compliance failure

**Sources:**
- [NACAT Illinois Cannabis Guide](https://nacatpros.org/midwest/illinois/illinois-cannabis-accounting-280e-2025)

---

### Pitfall 13: Inventory Valuation Method Mismatch

**What goes wrong:** Cannabis business uses different inventory costing methods (FIFO, weighted average, standard cost) inconsistently, leading to COGS calculation errors.

**Prevention:**
1. Choose one method and document it
2. Apply consistently across all inventory transactions
3. Section 471 requires specific methods — verify compliance
4. System should enforce chosen method, not allow ad-hoc calculations

**Phase:** Classification rules engine phase

**Severity:** LOW — tax calculation accuracy

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|----------------|------------|
| Database Schema | RLS not enabled on all tables | Test suite that queries pg_policies, fails if tenant table lacks policy |
| Database Schema | Audit log modifiable | Use PostgreSQL triggers, constraint preventing UPDATE/DELETE |
| Plaid Link Integration | Token exposed in API response | Code review checklist, never return access_token field |
| Plaid Link Integration | Duplicate Items created | Pre-Link check for existing Items at same institution |
| Webhook Infrastructure | Signature verification skipped | Unit test that rejects modified payloads |
| Webhook Infrastructure | Replay attacks accepted | Test with iat > 5 minutes ago |
| Sync Infrastructure | Rate limits cause cascading failure | Circuit breaker pattern, exponential backoff |
| Sync Infrastructure | ITEM_LOGIN_REQUIRED silently ignored | Webhook handler updates item status, UI surfaces reconnect flow |
| 280E Rules Engine | COGS overstated | Classification rules reviewed by CPA before deployment |
| 280E Rules Engine | Labor allocation missing | Require time tracking integration or manual percentage entry |
| Multi-Entity Views | Cross-tenant query returns data | Integration test asserting zero rows for wrong tenant |
| P&L Reporting | Audit trail gaps | Trigger-based audit logging, append-only enforcement |

---

## Security-Specific Checklist

Given the "Fort Knox" security posture from PROJECT.md, these items require explicit verification:

- [ ] Access tokens encrypted at rest using pgsodium/Supabase Vault
- [ ] RLS policies DENY all anon/frontend access to token columns
- [ ] RLS enabled and forced on ALL tables with tenant_id
- [ ] Webhook signature verification includes all 6 steps (JWT decode, alg check, key fetch, signature verify, timestamp check, body hash compare)
- [ ] Hash comparison uses constant-time algorithm
- [ ] API routes never return access_token in response body
- [ ] Audit log is append-only with database-level enforcement
- [ ] Item removal flow includes `/item/remove` API call to Plaid
- [ ] Read-only scopes verified: only `transactions` and `balance` requested

---

## Sources Summary

**Plaid Official (HIGH confidence):**
- [Plaid Webhook Verification](https://plaid.com/docs/api/webhooks/webhook-verification/)
- [Plaid Launch Checklist](https://plaid.com/docs/launch-checklist/)
- [Plaid Item Errors](https://plaid.com/docs/errors/item/)
- [Plaid Rate Limit Errors](https://plaid.com/docs/errors/rate-limit-exceeded/)
- [Plaid Update Mode](https://plaid.com/docs/link/update-mode/)

**280E/Tax Official (HIGH confidence):**
- [IRS Topic 305 Recordkeeping](https://www.irs.gov/taxtopics/tc305)
- [IRS Recordkeeping Requirements](https://www.irs.gov/businesses/small-businesses-self-employed/recordkeeping)

**Multi-Tenant Security (MEDIUM confidence - AWS/Postgres):**
- [AWS RLS for Multi-Tenant](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Crunchy Data RLS Pitfalls](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres)

**Cannabis Accounting (MEDIUM confidence - industry practitioners):**
- [TheCannaCPAs 280E Breakdown](https://thecannacpas.com/deductible-vs-non-deductible-expenses-under-280e-a-practical-breakdown/)
- [Bennett Thrasher 280E Compliance](https://www.btcpa.net/questions/how-cannabis-businesses-can-ensure-280e-tax-compliance)
- [Green Growth CPAs COGS Guide](https://greengrowthcpas.com/cannabis-cogs-cost-tracking-and-allocation-for-cannabis-businesses/)
- [Sam Brotman IRS Audit Guide](https://sambrotman.com/the-ultimate-guide-to-taxation-pitfalls-of-the-cannabis-industry/what-the-irs-is-looking-for-in-a-cannabis-tax-audit/)
