# Roadmap: Mary Financial Center Banking Engine

## Overview

This roadmap transforms Mary Financial Center from a QuickBooks-linked document system into a real-time banking hub with 280E tax compliance. The journey starts with security foundation (encrypted tokens, RLS, audit logging), then adds Plaid bank connections, transaction sync with webhooks, manual cash entry, a cash position dashboard, 280E classification engine, enhanced P&L views, and finally targeted testing for the kill zones. Each phase delivers something verifiable before building the next layer.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, ...): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Security Foundation & Entity Model** - RLS, Vault encryption, audit infrastructure, business entities
- [ ] **Phase 2: Plaid Link & Token Exchange** - Bank connection with encrypted storage
- [ ] **Phase 3: Transaction Sync & Webhooks** - Data ingestion, fix connection UI, manual refresh
- [ ] **Phase 4: Manual Entry** - Cash transaction support for non-bank transactions
- [ ] **Phase 5: Cash Position Dashboard** - Real-time balances, filtering, alerts
- [ ] **Phase 6: 280E Classification Engine** - COGS vs Operating with rules engine
- [ ] **Phase 7: P&L Enhancement** - Wire to real entity data with 280E breakdown
- [ ] **Phase 8: Testing** - Kill zone tests for 280E logic, normalization, RLS

## Phase Details

### Phase 1: Security Foundation & Entity Model
**Goal**: Establish secure multi-tenant infrastructure before any banking data enters the system
**Depends on**: Nothing (first phase)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-05, SEC-06, ENT-01, ENT-02, ENT-04
**Success Criteria** (what must be TRUE):
  1. Business entities exist in database with cannabis flag distinguishing 280E-applicable businesses
  2. Supabase Vault encrypts secrets and service role can decrypt them
  3. RLS policies deny frontend (anon/authenticated) access to sensitive tables
  4. Super-admin users (Mary + accountant) can see all entities through RLS
  5. Audit log captures INSERT/UPDATE/DELETE on sensitive tables with who/when/what
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Entity model, Vault extension, bank_connections table, admin client
- [ ] 01-02-PLAN.md — RLS policies, auth helper functions, audit logging, soft deletes

### Phase 2: Plaid Link & Token Exchange
**Goal**: Users can connect bank accounts with plug-and-play UI and tokens are never exposed
**Depends on**: Phase 1
**Requirements**: SEC-04, BANK-01, BANK-02, BANK-03, BANK-04
**Success Criteria** (what must be TRUE):
  1. User clicks "Connect Bank" and Plaid Link UI opens with transactions+balance scopes only
  2. After successful link, access token is stored encrypted in Vault (never plain text)
  3. Bank account appears in UI with name, type (checking/savings), and masked account number
  4. Connection status shows healthy/error/requires_login state
**Plans**: TBD

Plans:
- [ ] 02-01: Plaid client and Link token flow
- [ ] 02-02: Token exchange and bank accounts table

### Phase 3: Transaction Sync & Webhooks
**Goal**: Transactions flow automatically from Plaid with manual refresh fallback
**Depends on**: Phase 2
**Requirements**: ENT-03, BANK-05, BANK-06, SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, SYNC-06
**Success Criteria** (what must be TRUE):
  1. After bank connection, initial transaction pull populates transactions table
  2. Plaid webhooks trigger automatic sync (verified with 6-step JWT verification)
  3. Transaction amounts have correct signs (deposits positive, withdrawals negative)
  4. User can click "Refresh Banks" button to force sync on demand
  5. "Last synced: X minutes ago" indicator shows sync recency
  6. When connection requires re-auth, "Fix Connection" warning appears with update flow
  7. Bank accounts can be assigned to business entities
**Plans**: TBD

Plans:
- [ ] 03-01: Webhook endpoint with JWT verification
- [ ] 03-02: Transaction sync and normalization
- [ ] 03-03: Connection status UI and entity assignment

### Phase 4: Manual Entry
**Goal**: Users can record cash and non-bank transactions
**Depends on**: Phase 3
**Requirements**: MANUAL-01, MANUAL-02, MANUAL-03, MANUAL-04
**Success Criteria** (what must be TRUE):
  1. "Add Transaction" button opens modal with Date, Amount, Vendor, Category, Is COGS fields
  2. Manual transactions save to transactions table with source='manual'
  3. Manual transactions appear in transaction list alongside Plaid transactions
  4. User can edit manual transactions but cannot edit Plaid transactions
**Plans**: TBD

Plans:
- [ ] 04-01: Manual transaction modal and CRUD

### Phase 5: Cash Position Dashboard
**Goal**: Mary can answer "how much money do I have" with current data
**Depends on**: Phase 4
**Requirements**: ENT-05, CASH-01, CASH-02, CASH-03, CASH-04, CASH-05, CASH-06
**Success Criteria** (what must be TRUE):
  1. Dashboard shows real-time balance for each connected account
  2. Consolidated total cash position displays sum across all accounts
  3. User can filter accounts by business entity
  4. Account type (checking, savings, etc.) displays with each account
  5. Transaction list supports search by vendor/memo and date range filtering
  6. Low balance alert appears when account drops below configured threshold
**Plans**: TBD

Plans:
- [ ] 05-01: Cash balance display and filtering
- [ ] 05-02: Transaction list with search
- [ ] 05-03: Low balance alerts

### Phase 6: 280E Classification Engine
**Goal**: Transactions classified as COGS vs Operating Expense for cannabis entities
**Depends on**: Phase 5
**Requirements**: 280E-01, 280E-02, 280E-03, 280E-04, 280E-05
**Success Criteria** (what must be TRUE):
  1. Each transaction has COGS/Operating classification field
  2. Classification rules auto-categorize based on vendor name patterns
  3. Classification rules auto-categorize based on expense category patterns
  4. User can manually override classification with required justification text
  5. Classification only applies to transactions in cannabis-flagged entities
**Plans**: TBD

Plans:
- [ ] 06-01: Classification schema and rules engine
- [ ] 06-02: Classification UI with override

### Phase 7: P&L Enhancement
**Goal**: P&L views show real entity data with 280E deductible/non-deductible breakdown
**Depends on**: Phase 6
**Requirements**: 280E-06, PNL-01, PNL-02, PNL-03, PNL-04, PNL-05, PNL-06, PNL-07, PNL-08
**Success Criteria** (what must be TRUE):
  1. Individual entity P&L shows real bank transactions + QB data
  2. Consolidated P&L aggregates all entities with revenue breakdown by entity
  3. Date range picker filters P&L to selected period
  4. Expense categories use QuickBooks Chart of Accounts
  5. Cannabis entity P&L shows COGS vs Operating Expense breakdown with visual distinction
  6. Deductible expenses (COGS) visually distinguished from non-deductible (Operating)
  7. User can toggle "Inter-company Transfer" flag on any transaction
  8. Transactions flagged as inter-company transfers are excluded from P&L calculations
**Plans**: TBD

Plans:
- [ ] 07-01: Individual entity P&L view
- [ ] 07-02: Consolidated P&L view
- [ ] 07-03: 280E breakdown integration
- [ ] 07-04: Inter-company transfer exclusion

### Phase 8: Testing
**Goal**: Kill zone coverage ensures critical paths are protected
**Depends on**: Phase 7
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. Vitest runs with TypeScript/Next.js configuration
  2. 280E classification tests verify COGS keywords detected correctly
  3. Transaction normalization tests verify sign flipping works correctly
  4. RLS security tests verify cross-tenant isolation (tenant A cannot see tenant B data)
**Plans**: TBD

Plans:
- [ ] 08-01: Vitest setup
- [ ] 08-02: Kill zone test suites

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Foundation & Entity Model | 0/2 | Planned | - |
| 2. Plaid Link & Token Exchange | 0/2 | Not started | - |
| 3. Transaction Sync & Webhooks | 0/3 | Not started | - |
| 4. Manual Entry | 0/1 | Not started | - |
| 5. Cash Position Dashboard | 0/3 | Not started | - |
| 6. 280E Classification Engine | 0/2 | Not started | - |
| 7. P&L Enhancement | 0/4 | Not started | - |
| 8. Testing | 0/2 | Not started | - |

---
*Created: 2026-01-28*
*Total phases: 8 | Total plans: 19 (estimated)*
