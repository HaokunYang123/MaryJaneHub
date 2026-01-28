# Feature Landscape: Multi-Entity Banking Dashboard with 280E Compliance

**Domain:** Multi-entity financial management for cannabis + non-cannabis business portfolio
**Researched:** 2026-01-28
**Overall Confidence:** MEDIUM (Web research verified across multiple sources; 280E tax treatment HIGH confidence from IRS/CPA sources)

---

## Table Stakes

Features users expect. Missing = product feels incomplete or unprofessional.

### Core Banking Visibility

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Real-time cash balance per account** | Users expect bank balances to be current, not days old | Medium | Plaid webhooks provide near real-time; polling fallback for reliability |
| **Consolidated total cash position** | "How much money do I have?" is the #1 question | Low | Sum of all account balances with proper aggregation |
| **Account filtering by entity** | Multi-entity users must see entity-specific views | Low | Basic filter/grouping logic |
| **Account connection status** | Users need to know if a bank connection is stale/broken | Low | Plaid connection health surfacing |
| **Transaction list with search** | Users expect to find specific transactions | Medium | Pagination, date filters, amount search |
| **Account type classification** | Distinguish checking vs savings vs money market | Low | Plaid provides account types |

**Source:** [Volopay - Consolidated Dashboards](https://www.volopay.com/blog/consolidated-dashboards-for-multi-entity-finances/), [Phoenix Strategy Group - Real-Time Dashboards](https://www.phoenixstrategy.group/blog/real-time-dashboards-multi-entity-reporting) (MEDIUM confidence - multiple sources agree)

### P&L Reporting

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Individual P&L per entity** | Each business needs its own financial view | Medium | Already partially exists in codebase; needs proper entity separation |
| **Consolidated P&L across entities** | Mary needs aggregate view of all businesses | Medium | Already exists in demo form; needs real data integration |
| **Date range selection** | Standard for any financial report | Low | Already implemented |
| **Revenue by entity breakdown** | Visual understanding of which entities contribute what | Low | Already implemented with stacked bar |
| **Expense categorization** | Users expect expenses grouped by category | Medium | QuickBooks COA provides structure |

**Source:** [Fathom HQ - Consolidated Financial Reporting](https://www.fathomhq.com/features/consolidated-financial-reporting), [Sage - Multi-Entity Accounting](https://www.sage.com/en-us/accounting-software/multi-entity/) (MEDIUM confidence)

### Security & Trust

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Encrypted credential storage** | Industry standard; users won't trust plain text | High | Supabase Vault/pgsodium; non-negotiable |
| **Read-only bank access** | Users need assurance no money can move | Low | Plaid scope restriction |
| **Audit trail for changes** | Financial data requires change tracking | Medium | Immutable log table for categorizations |
| **Connection permission transparency** | Users should see exactly what's accessed | Low | Clear display of Plaid permissions |

**Source:** [Plaid - Trust and Safety](https://plaid.com/safety/), IRS audit requirements (HIGH confidence - authoritative source)

---

## 280E Cannabis Compliance Features

**CRITICAL for this project.** 280E treatment is the differentiator and primary compliance requirement.

### 280E Background (HIGH confidence - IRS code + CPA sources)

Section 280E prohibits cannabis businesses from deducting ordinary business expenses. Only Cost of Goods Sold (COGS) is deductible. This results in effective tax rates often exceeding 70% for cannabis businesses.

**Source:** [TheCannaCPAs - 280E Breakdown](https://thecannacpas.com/deductible-vs-non-deductible-expenses-under-280e-a-practical-breakdown/), [Flowhub - 280E Deductions](https://www.flowhub.com/learn/what-dispensaries-can-deduct-280e), [GreenGrowth CPAs](https://greengrowthcpas.com/cannabis-accounting-taxes-2025-2026/)

### Required 280E Features

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| **Entity-level cannabis flag** | Determines 280E treatment applicability | Low | Boolean flag per business_entity |
| **COGS vs Operating Expense classification** | Core 280E requirement - only COGS is deductible | High | Classification engine with rules |
| **Deductible expense tracking** | Must clearly separate what IS deductible | Medium | Visual distinction in P&L views |
| **Non-deductible expense tracking** | Must track what CANNOT be deducted | Medium | Visual distinction + tax implications |
| **Classification audit trail** | IRS audits ~10% of cannabis businesses | Medium | Immutable log with who/when/what |
| **Classification override with justification** | Humans must be able to correct AI classifications | Medium | Override + reason field |

### What IS Deductible (COGS) for Cannabis

Per IRS and CHAMP v. Commissioner ruling:
- Direct cultivation/production labor
- Raw materials (seeds, soil, nutrients)
- Packaging materials for product preparation
- Lab testing costs
- Transportation for acquiring inventory
- Depreciation on production equipment
- Repairs/maintenance on production facilities

### What is NOT Deductible (Operating Expenses)

Per Section 280E:
- Rent for retail/selling spaces
- Marketing and advertising
- Administrative salaries (sales staff, managers)
- Banking fees
- Legal fees (non-production)
- Website/software costs
- Utilities for retail space
- Charitable contributions

### 280E Classification Rules Engine

| Rule Type | Example | Complexity |
|-----------|---------|------------|
| **Vendor-based** | "Apex Seeds LLC" -> always COGS | Low |
| **Category-based** | "Marketing" category -> never deductible for cannabis | Medium |
| **Keyword-based** | "cultivation" in memo -> likely COGS | Medium |
| **Amount threshold** | Large equipment purchases -> review for depreciation | Medium |
| **Entity context** | Same expense deductible for non-cannabis, not for cannabis | High |

**Source:** [Cannabis CPA guidance](https://thecannacpas.com/deductible-vs-non-deductible-expenses-under-280e-a-practical-breakdown/) (HIGH confidence)

---

## Differentiators

Features that set the product apart. Not expected, but valued.

### Voice-Activated Financial Queries

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **"How much cash do I have?"** | Instant answer via existing voice mode | Low | Integration with existing voice system |
| **"Show me Phoenix Retail P&L"** | Natural language entity selection | Medium | Entity name recognition |
| **"What's my COGS this month?"** | 280E-aware voice queries | Medium | Cannabis-specific query understanding |
| **"Any unusual transactions?"** | Anomaly detection via voice | High | ML/rules for anomaly detection |

**Why differentiating:** Existing voice infrastructure makes this low-friction. Competitors don't have voice-first financial dashboards.

### Intelligent 280E Classification

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **AI-suggested classification** | Reduce manual categorization burden | High | Gemini integration for classification |
| **Confidence scoring** | Flag low-confidence classifications for review | Medium | Model confidence passthrough |
| **Learn from corrections** | Classifications improve over time | High | Feedback loop to improve rules |
| **Bulk classification** | Process many transactions at once | Medium | Batch UI + background processing |

**Why differentiating:** Manual 280E classification is tedious and error-prone. AI assistance with human oversight is competitive advantage.

### Real-Time Cash Alerts

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Low balance warnings** | Proactive notification before overdraft | Low | Threshold + webhook trigger |
| **Large transaction alerts** | Awareness of significant money movement | Low | Amount threshold detection |
| **Entity cash disparity** | Flag when one entity is cash-rich and another is cash-poor | Medium | Cross-entity comparison logic |

**Why differentiating:** Most dashboards are passive. Proactive alerts create stickiness.

### QuickBooks Reconciliation View

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Bank vs QB discrepancy detection** | Surface when bank transactions don't match QB | High | Transaction matching algorithm |
| **Unreconciled transaction list** | Show what needs attention | Medium | Status tracking per transaction |
| **One-click QB categorization** | Apply QB category without leaving app | High | QB write API integration (if desired) |

**Why differentiating:** Accountants spend hours reconciling. Automated detection saves time.
**Note:** PROJECT.md explicitly says "read from QB, don't write back" - this may be view-only.

### Multi-Currency Support

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Currency conversion display** | View in preferred currency | Medium | Exchange rate API integration |
| **Currency consolidation** | Aggregate across currencies | High | Proper currency translation rules |

**Why differentiating:** Relevant if Mary has international operations. NOT required for v1 (Arizona focus).

---

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Money movement (ACH, transfers)** | Catastrophic risk if compromised; out of scope per PROJECT.md | Read-only scopes only. Display "Transfer" buttons that link to bank site. |
| **Duplicate Chart of Accounts** | Creates reconciliation nightmare with 3 accounting firms | QuickBooks is COA source of truth. Display QB categories, don't create our own. |
| **Auto-categorization without review** | 280E misclassification has real tax consequences | AI suggests, human approves. Never auto-commit classifications. |
| **Real-time P&L from bank transactions only** | Bank transactions lack proper GL treatment | P&L comes from QuickBooks. Bank view is for cash position, not accounting. |
| **Per-department cost centers** | Over-engineering; businesses are the cost centers | Entity-level only. Departments can come later if needed. |
| **Pie charts for financial data** | Hard to compare, look unprofessional for financial apps | Use bar charts, tables, and stacked bars. Already implemented correctly. |
| **Complex intercompany eliminations** | Not needed for this use case; adds complexity | Simple entity-level views. No consolidated GAAP statements. |
| **Direct database access for integrations** | Security anti-pattern for banking data | API gateway only. RLS enforced at database level. |
| **Auto-retry on bank connection failure** | Can lock accounts with repeated failed attempts | Manual reconnect flow. Clear status display. |
| **Color-only status indicators** | Accessibility failure | Icons + labels + color. Already in design system. |

**Source:** [Dashboard Anti-Patterns](https://startingblockonline.org/dashboard-anti-patterns-12-mistakes-and-the-patterns-that-replace-them/), [Banking Dark Patterns](https://www.theuxda.com/blog/dark-patterns-in-digital-banking-compromise-financial-brands) (MEDIUM confidence)

---

## Feature Dependencies

```
Entity Model (must exist first)
    |
    +---> Bank Account Linking (requires entity to assign to)
    |         |
    |         +---> Transaction Ingestion (requires accounts)
    |                   |
    |                   +---> 280E Classification (requires transactions)
    |                   |
    |                   +---> Cash Position Dashboard (requires transactions + balances)
    |
    +---> Cannabis Flag (per entity)
              |
              +---> 280E Classification Rules (requires cannabis flag context)

QuickBooks Integration (existing)
    |
    +---> COA Source of Truth (categories for classification)
    |
    +---> Individual Entity P&L (QB data per company)
    |
    +---> Consolidated P&L (aggregation of QB entities)

Voice Interface (existing)
    |
    +---> Cash Query Functions (new functions for voice)
    |
    +---> Entity P&L Query Functions (new functions)
```

### Critical Path

1. **Entity Model** - Foundation for multi-entity; must be first
2. **Plaid Integration** - Bank connection infrastructure
3. **Transaction Ingestion** - Data to display
4. **280E Classification Engine** - Core differentiator
5. **Cash Position Dashboard** - Primary user value
6. **Individual P&L Enhancement** - Per-entity views
7. **Consolidated P&L Enhancement** - Aggregate views
8. **Voice Integration** - Leverage existing infrastructure

---

## MVP Recommendation

For MVP, prioritize:

### Must Have (Table Stakes)
1. **Bank account linking via Plaid** - Core capability
2. **Real-time cash position** - The #1 question: "How much money do I have?"
3. **Entity-level account grouping** - Multi-entity is the use case
4. **Transaction list with basic search** - Users need to see what happened
5. **Individual P&L per entity** - Already partially exists; needs real entity separation
6. **Consolidated P&L** - Already exists in demo; needs real data

### Must Have (280E Compliance)
1. **Entity cannabis flag** - Determines treatment
2. **COGS vs Operating classification UI** - Manual at minimum
3. **Classification audit trail** - IRS requirement
4. **Visual distinction in P&L** - Deductible vs non-deductible clear

### Nice to Have (Differentiators - Phase 2)
1. **AI-suggested 280E classification** - High value, high complexity
2. **Voice-activated cash queries** - Low complexity, high delight
3. **Low balance alerts** - Proactive value

### Defer to Post-MVP
- **Currency conversion** - Not needed for Arizona focus
- **QB write-back** - Read-only is safer per PROJECT.md
- **Complex reporting** - QuickBooks handles this
- **Bulk classification** - After AI classification is proven
- **Anomaly detection** - After transaction history builds up

---

## Competitive Landscape

### Cannabis-Specific Accounting Software

| Product | 280E Features | Multi-Entity | Bank Integration | Notes |
|---------|--------------|--------------|------------------|-------|
| **Illumify ERP** | Full COGS/280E | Yes (multi-license) | Unknown | Heavy, full ERP |
| **Distru** | 280E-aware | Yes | Unknown | Seed-to-sale focused |
| **Adilas** | 280E compliant COA | Yes | METRC integrated | Compliance-first |
| **QuickBooks + CPA** | Manual | Separate files | Via Plaid/fintech | Current state for Mary |

**Our positioning:** Dashboard layer over existing QuickBooks with Plaid-powered real-time cash + 280E classification UI. Not replacing accounting software, augmenting it.

### Multi-Entity Consolidation Tools

| Product | P&L Consolidation | Real-Time | QB Integration |
|---------|-------------------|-----------|----------------|
| **Fathom** | Up to 300 entities | Yes | Yes |
| **Joiin** | Multi-currency | Yes | Yes |
| **LiveFlow** | Full consolidation | Yes | Yes |
| **G-Accon** | Google Sheets based | Yes | Yes |

**Why build vs buy:** These tools are generic. None have 280E awareness. We're building a cannabis-specific layer that leverages existing QB integrations but adds the compliance features these tools lack.

---

## Sources

### HIGH Confidence (Authoritative)
- [TheCannaCPAs - 280E Breakdown](https://thecannacpas.com/deductible-vs-non-deductible-expenses-under-280e-a-practical-breakdown/)
- [Flowhub - 280E Deductions](https://www.flowhub.com/learn/what-dispensaries-can-deduct-280e)
- [GreenGrowth CPAs - Cannabis Taxes 2025-2026](https://greengrowthcpas.com/cannabis-accounting-taxes-2025-2026/)
- [Plaid - Trust and Safety](https://plaid.com/safety/)
- [Plaid - Dashboard Overview](https://plaid.com/core-exchange/docs/dashboard-overview/)

### MEDIUM Confidence (Multiple sources agree)
- [Volopay - Consolidated Dashboards](https://www.volopay.com/blog/consolidated-dashboards-for-multi-entity-finances/)
- [Phoenix Strategy Group - Real-Time Dashboards](https://www.phoenixstrategy.group/blog/real-time-dashboards-multi-entity-reporting)
- [Fathom HQ - Consolidated Reporting](https://www.fathomhq.com/features/consolidated-financial-reporting)
- [Sage - Multi-Entity Accounting](https://www.sage.com/en-us/accounting-software/multi-entity/)
- [NetSuite - Multi-Entity Accounting](https://www.netsuite.com/portal/resource/articles/accounting/multi-entity-accounting.shtml)
- [Dashboard Anti-Patterns](https://startingblockonline.org/dashboard-anti-patterns-12-mistakes-and-the-patterns-that-replace-them/)

### LOW Confidence (Single source / Needs validation)
- AI-powered compliance tools (Cannalytics mentioned but not verified)
- 280E rescheduling timeline (speculative for 2026)
- Specific software pricing and capabilities (may change)

---

*Research completed: 2026-01-28*
*Researcher: GSD Project Researcher Agent*
