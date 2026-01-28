# Mary Financial Center: Banking Engine

## What This Is

A real-time banking layer for Mary Financial Center that provides live cash visibility across all of Mary's businesses. Built on top of the existing QuickBooks + Document + Voice system, this adds Plaid-powered bank account integration with 280E-aware expense classification for cannabis operations. Mary and her accountant can see individual P&L for each business and a consolidated view across all entities.

## Core Value

**Real-time cash position across all businesses with tax-compliant expense classification.**

If everything else fails, Mary must be able to see "how much money do I have" with data that's current, not days old from QuickBooks. The 280E COGS vs operating expense distinction must be correct — misclassification costs real money at tax time.

## Requirements

### Validated

Existing capabilities from current codebase:

- ✓ AI Orchestrator with function calling (Gemini 2.5 Flash) — existing
- ✓ Voice Mode (ElevenLabs TTS + STT) — existing
- ✓ QuickBooks integration (vendors, bills, P&L reports) — existing
- ✓ Document engine (Google Drive → AI extraction → matching) — existing
- ✓ Authentication via Supabase + email whitelist — existing
- ✓ Document review queue with status workflow — existing

### Active

Banking Engine (v1):

- [ ] Plaid Link integration for plug-and-play bank account connection
- [ ] Encrypted token storage (pgsodium/Supabase Vault)
- [ ] Read-only Plaid scopes (transactions + balance only, no transfers)
- [ ] Webhook receiver for real-time transaction updates
- [ ] Background sync worker for initial data pull
- [ ] Bank account entity model (distinct from flat transactions)
- [ ] Row Level Security on bank_connections table

Multi-Entity Structure:

- [ ] Business entity model with cannabis flag for 280E treatment
- [ ] Manual assignment of bank accounts to businesses
- [ ] Individual P&L view per business
- [ ] Consolidated P&L view across all businesses
- [ ] Super-admin access for Mary + accountant (see all entities)

280E Cannabis Logic:

- [ ] COGS vs Operating Expense classification
- [ ] Per-entity tax treatment flag (cannabis vs non-cannabis)
- [ ] Classification rules engine for transaction categorization

Security (Fort Knox):

- [ ] Encrypted tokens at rest (never plain text)
- [ ] RLS policies denying frontend access to tokens
- [ ] Immutable audit log for all categorization changes
- [ ] Soft deletes only (no transaction deletion)

Integration:

- [ ] Voice interface gains "live cash" query capability
- [ ] QuickBooks remains COA source of truth
- [ ] Bank transactions linkable to document matching

### Out of Scope

- Mobile app — web-first, mobile later
- Money movement (transfers, payments) — read-only by design, reduces catastrophic risk
- Real-time chat/messaging — not a communication tool
- Per-department cost centers — businesses are the cost centers, not internal departments
- Building parallel COA — QuickBooks is source of truth, no reconciliation nightmares
- OAuth login (Google, GitHub) — Supabase email auth is sufficient

## Context

**Brownfield project:** This extends an existing Next.js 16 application with Supabase, Gemini AI, QuickBooks integration, and voice mode. The codebase is well-structured with clear separation between UI, API, AI orchestration, and business logic layers.

**Current gap:** The existing `transactions` table is a generic bucket with no concept of bank accounts, no live cash feed, and no 280E awareness. Plaid infrastructure (tokens, webhooks, security) does not exist.

**User base:** Mary (business owner) and her accountant. Both are super-admins who see all entities. Three external accounting firms manage QuickBooks for different businesses — we read from QB, we don't write categorization back.

**Data flow:** Plaid → raw transactions → our DB → 280E classification → P&L views. QuickBooks provides the chart of accounts for proper categorization.

**Security posture:** Treat bank credentials as toxic waste. Assume code is buggy and keys might leak. Database enforces isolation, not application code. Read-only scopes mean even a full breach can't move money.

## Constraints

- **Tech stack:** Next.js 16, Supabase (PostgreSQL), TypeScript — must integrate with existing architecture
- **Token security:** Plaid access tokens encrypted at rest using pgsodium, never accessible to frontend
- **Plaid scopes:** transactions + balance ONLY — explicitly reject transfer/payment scopes
- **Database isolation:** RLS enforced at PostgreSQL level, not application WHERE clauses
- **Audit requirements:** All categorization changes logged with who/when/what for IRS compliance
- **QuickBooks integration:** COA comes from QB, we don't duplicate or diverge

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Plaid over direct bank APIs | Aggregator handles bank-specific complexity, one integration for all banks | — Pending |
| Encrypted tokens in Supabase Vault | Industry standard for credential isolation, no plain text storage | — Pending |
| RLS for tenant isolation | Database enforces security, protects against code bugs | — Pending |
| Read-only scopes | Eliminates money movement risk even in full compromise | — Pending |
| Real-time via webhooks | Best UX, Plaid pushes updates instead of polling | — Pending |
| QuickBooks as COA source | Avoids reconciliation nightmare with 3 accounting firms | — Pending |
| Manual bank-to-business assignment | Simple and explicit, no magic matching that could go wrong | — Pending |

---
*Last updated: 2026-01-28 after initialization*
