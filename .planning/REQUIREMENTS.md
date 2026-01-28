# Requirements: Mary Financial Center Banking Engine

**Defined:** 2026-01-28
**Core Value:** Real-time cash position across all businesses with tax-compliant expense classification

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Security Foundation

- [ ] **SEC-01**: Plaid access tokens encrypted at rest using Supabase Vault
- [ ] **SEC-02**: RLS policy denies frontend (anon/authenticated) access to bank_connections tokens
- [ ] **SEC-03**: Only service_role can decrypt tokens for Plaid API calls
- [ ] **SEC-04**: Plaid scopes limited to transactions + balance only (no transfer capability)
- [ ] **SEC-05**: All classification changes logged to immutable audit_logs table
- [ ] **SEC-06**: Soft deletes only — no transaction deletion, only void flag

### Entity Model

- [ ] **ENT-01**: Business entity table with name, cannabis flag, and metadata
- [ ] **ENT-02**: Cannabis flag determines 280E treatment applicability per entity
- [ ] **ENT-03**: Bank accounts manually assigned to business entities after connection
- [ ] **ENT-04**: Super-admin role (Mary + accountant) sees all entities via RLS
- [ ] **ENT-05**: Entity-level filtering across all views

### Bank Connection

- [ ] **BANK-01**: Plaid Link integration for plug-and-play bank connection
- [ ] **BANK-02**: Token exchange and encrypted storage after Link success
- [ ] **BANK-03**: Bank account entity model (account_id, name, type, mask, balance)
- [ ] **BANK-04**: Connection status tracking (healthy, error, requires_login)
- [ ] **BANK-05**: "Fix Connection" warning UI when status is ITEM_LOGIN_REQUIRED
- [ ] **BANK-06**: Plaid Link Update Mode for re-authentication flow

### Transaction Sync

- [ ] **SYNC-01**: Initial transaction pull after bank connection
- [ ] **SYNC-02**: Webhook receiver for SYNC_UPDATES_AVAILABLE events
- [ ] **SYNC-03**: Webhook JWT verification (6-step Plaid verification)
- [ ] **SYNC-04**: Transaction normalization (sign flipping for proper accounting)
- [ ] **SYNC-05**: Manual "Refresh Banks" button triggers sync on demand
- [ ] **SYNC-06**: Sync status indicator shows last sync time

### Manual Entry

- [ ] **MANUAL-01**: "Add Transaction" modal for manual entry
- [ ] **MANUAL-02**: Fields: Date, Amount, Vendor, Category, Is COGS checkbox
- [ ] **MANUAL-03**: Inserts to transactions table with source='manual'
- [ ] **MANUAL-04**: Manual transactions editable (Plaid transactions read-only)

### Cash Position Dashboard

- [ ] **CASH-01**: Real-time cash balance per account
- [ ] **CASH-02**: Consolidated total cash position across all accounts
- [ ] **CASH-03**: Account filtering by entity
- [ ] **CASH-04**: Account type display (checking, savings, etc.)
- [ ] **CASH-05**: Transaction list with search and date filtering
- [ ] **CASH-06**: Low balance alert when account drops below threshold

### 280E Classification

- [ ] **280E-01**: COGS vs Operating Expense classification per transaction
- [ ] **280E-02**: Classification rules based on vendor name patterns
- [ ] **280E-03**: Classification rules based on category patterns
- [ ] **280E-04**: Manual classification override with justification field
- [ ] **280E-05**: Classification only applies to cannabis-flagged entities
- [ ] **280E-06**: Visual distinction in P&L (deductible vs non-deductible)

### P&L Views

- [ ] **PNL-01**: Individual P&L per entity using real bank + QB data
- [ ] **PNL-02**: Consolidated P&L across all entities
- [ ] **PNL-03**: Date range selection for P&L views
- [ ] **PNL-04**: Expense categorization using QuickBooks COA as source
- [ ] **PNL-05**: COGS vs Operating Expense breakdown for cannabis entities
- [ ] **PNL-06**: Revenue by entity breakdown in consolidated view
- [ ] **PNL-07**: Inter-company transfer toggle — UI to mark transactions as transfers between entities
- [ ] **PNL-08**: Inter-company transfers excluded from P&L calculations (not income/expense)

### Testing (Kill Zones)

- [ ] **TEST-01**: Vitest setup with TypeScript/Next.js configuration
- [ ] **TEST-02**: 280E logic tests — COGS keywords detected correctly
- [ ] **TEST-03**: Bank normalization tests — sign flipping works correctly
- [ ] **TEST-04**: RLS security tests — cross-tenant isolation enforced

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Voice Integration

- **VOICE-01**: "How much cash do I have?" query via existing voice mode
- **VOICE-02**: "Show me [Entity] P&L" natural language entity selection
- **VOICE-03**: "What's my COGS this month?" 280E-aware voice queries

### AI Classification

- **AI-01**: Gemini-suggested 280E classification
- **AI-02**: Confidence scoring for classification suggestions
- **AI-03**: Bulk classification for multiple transactions
- **AI-04**: Learn from correction feedback loop

### Advanced Alerts

- **ALERT-01**: Large transaction alerts
- **ALERT-02**: Entity cash disparity alerts (one rich, one poor)
- **ALERT-03**: Unusual transaction pattern detection

### QuickBooks Enhancement

- **QB-01**: Bank vs QB discrepancy detection
- **QB-02**: Unreconciled transaction highlighting
- **QB-03**: Multi-QB-company connection handling

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Money movement (ACH, transfers) | Catastrophic risk if compromised; read-only by design |
| Duplicate Chart of Accounts | QuickBooks is COA source of truth; no reconciliation nightmares |
| Auto-categorization without review | 280E misclassification has real tax consequences |
| Per-department cost centers | Businesses are the cost centers, not internal departments |
| Mobile app | Web-first, mobile later |
| OAuth login (Google, GitHub) | Supabase email auth is sufficient |
| Multi-currency support | Not needed for Arizona focus |
| Complex GAAP eliminations | Simple entity views, no consolidated statements |
| Cron-based background sync | Too hard to debug; manual Refresh button instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 1 | Pending |
| SEC-04 | Phase 2 | Pending |
| SEC-05 | Phase 1 | Pending |
| SEC-06 | Phase 1 | Pending |
| ENT-01 | Phase 1 | Pending |
| ENT-02 | Phase 1 | Pending |
| ENT-03 | Phase 3 | Pending |
| ENT-04 | Phase 1 | Pending |
| ENT-05 | Phase 5 | Pending |
| BANK-01 | Phase 2 | Pending |
| BANK-02 | Phase 2 | Pending |
| BANK-03 | Phase 2 | Pending |
| BANK-04 | Phase 2 | Pending |
| BANK-05 | Phase 3 | Pending |
| BANK-06 | Phase 3 | Pending |
| SYNC-01 | Phase 3 | Pending |
| SYNC-02 | Phase 3 | Pending |
| SYNC-03 | Phase 3 | Pending |
| SYNC-04 | Phase 3 | Pending |
| SYNC-05 | Phase 3 | Pending |
| SYNC-06 | Phase 3 | Pending |
| MANUAL-01 | Phase 4 | Pending |
| MANUAL-02 | Phase 4 | Pending |
| MANUAL-03 | Phase 4 | Pending |
| MANUAL-04 | Phase 4 | Pending |
| CASH-01 | Phase 5 | Pending |
| CASH-02 | Phase 5 | Pending |
| CASH-03 | Phase 5 | Pending |
| CASH-04 | Phase 5 | Pending |
| CASH-05 | Phase 5 | Pending |
| CASH-06 | Phase 5 | Pending |
| 280E-01 | Phase 6 | Pending |
| 280E-02 | Phase 6 | Pending |
| 280E-03 | Phase 6 | Pending |
| 280E-04 | Phase 6 | Pending |
| 280E-05 | Phase 6 | Pending |
| 280E-06 | Phase 7 | Pending |
| PNL-01 | Phase 7 | Pending |
| PNL-02 | Phase 7 | Pending |
| PNL-03 | Phase 7 | Pending |
| PNL-04 | Phase 7 | Pending |
| PNL-05 | Phase 7 | Pending |
| PNL-06 | Phase 7 | Pending |
| PNL-07 | Phase 7 | Pending |
| PNL-08 | Phase 7 | Pending |
| TEST-01 | Phase 8 | Pending |
| TEST-02 | Phase 8 | Pending |
| TEST-03 | Phase 8 | Pending |
| TEST-04 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 51 total
- Mapped to phases: 51
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-28*
*Last updated: 2026-01-28 after roadmap creation*
