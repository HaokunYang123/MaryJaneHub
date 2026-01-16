// Function Executor - Connects AI function calls to real APIs
// For demo purposes, returns realistic mock data where APIs aren't connected

import { supabase } from '@/lib/supabase';
import { checkFileExists } from '@/lib/google-drive';
import * as quickbooks from '@/lib/quickbooks';
import { profileManager } from './profile-manager';

// Helper to build Google Drive link from file ID
function getDriveLink(driveId: string): string {
  return `https://drive.google.com/file/d/${driveId}/view`;
}

interface Property {
  id: string;
  name: string;
  address: string;
  tenant?: string | null;
  monthlyRent?: number;
}

interface BankAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
  bank: string;
  lowThreshold: number;
}

interface Expense {
  id: string;
  date: string;
  amount: number;
  vendor: string;
  category: string;
  property?: string;
}

// Mock data for realistic demo - California properties
const MOCK_PROPERTIES: Property[] = [
  { id: 'prop_riverside', name: 'Riverside Property', address: '1234 University Ave, Riverside, CA', tenant: '8 Units - Various Tenants', monthlyRent: 12000 },
  { id: 'prop_corona', name: 'Corona Property', address: '456 Main St, Corona, CA', tenant: '12 Units - Various Tenants', monthlyRent: 18000 },
  { id: 'prop_anaheim', name: 'Anaheim Property', address: '789 Lincoln Ave, Anaheim, CA', tenant: 'Single Family Rental', monthlyRent: 3200 },
  { id: 'prop_ontario', name: 'Ontario Property', address: '321 Euclid Ave, Ontario, CA', tenant: 'Commercial Retail', monthlyRent: 5500 },
];

const MOCK_ACCOUNTS: BankAccount[] = [
  { id: 'acc_1', name: 'Operating Account - Main', type: 'checking', balance: 847234.56, bank: 'Chase', lowThreshold: 50000 },
  { id: 'acc_2', name: 'Payroll Account', type: 'checking', balance: 156789.00, bank: 'Chase', lowThreshold: 100000 },
  { id: 'acc_3', name: 'Tax Reserve', type: 'savings', balance: 234567.89, bank: 'Wells Fargo', lowThreshold: 100000 },
  { id: 'acc_4', name: 'Phoenix Dispensary', type: 'checking', balance: 89456.23, bank: 'Local Credit Union', lowThreshold: 25000 },
  { id: 'acc_5', name: 'Tempe Dispensary', type: 'checking', balance: 67234.11, bank: 'Local Credit Union', lowThreshold: 25000 },
  { id: 'acc_6', name: 'Mesa Operations', type: 'checking', balance: 45678.90, bank: 'Bank of America', lowThreshold: 20000 },
  { id: 'acc_7', name: 'Property Management', type: 'checking', balance: 123456.78, bank: 'Wells Fargo', lowThreshold: 30000 },
  { id: 'acc_8', name: 'Emergency Reserve', type: 'savings', balance: 500000.00, bank: 'Chase', lowThreshold: 250000 },
];

const MOCK_EXPENSES: Expense[] = [
  { id: 'exp_1', date: '2024-03-01', amount: 400, vendor: 'CoolAir HVAC Services', category: 'Repairs & Maintenance', property: 'Riverside Property' },
  { id: 'exp_2', date: '2024-03-03', amount: 340, vendor: 'Corona Plumbing', category: 'Repairs & Maintenance', property: 'Corona Property' },
  { id: 'exp_3', date: '2024-03-05', amount: 500, vendor: 'SoCal Roofing', category: 'Repairs & Maintenance', property: 'Anaheim Property' },
  { id: 'exp_4', date: '2024-03-07', amount: 2500, vendor: 'Pacific Coast Supply Co', category: 'Inventory/COGS' },
  { id: 'exp_5', date: '2024-03-08', amount: 890, vendor: 'Edison Electric', category: 'Utilities' },
  { id: 'exp_6', date: '2024-03-10', amount: 1200, vendor: 'Security Solutions', category: 'Professional Services' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeFunction(functionName: string, args: Record<string, any>): Promise<any> {
  // Simulate API latency
  await new Promise(resolve => setTimeout(resolve, 300));

  switch (functionName) {
    // ===== EXPENSE RECORDING =====
    case 'record_expense': {
      const expenseDate = args.date || new Date().toISOString().split('T')[0];
      const propertyName = args.property_id ? MOCK_PROPERTIES.find(p => p.id === args.property_id)?.name : undefined;

      // Generate a unique expense ID
      const expenseId = `exp_${Date.now()}`;

      // Try to create in QuickBooks first
      let qbBillId: string | null = null;
      let qbSuccess = false;

      try {
        const isQbAuthenticated = await quickbooks.isAuthenticated();

        if (isQbAuthenticated) {
          // Calculate due date (30 days from now)
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);
          const dueDateStr = dueDate.toISOString().split('T')[0];

          // Create bill in QuickBooks
          const qbBill = await quickbooks.createBill({
            vendorName: args.vendor_or_description,
            dueDate: dueDateStr,
            invoiceNumber: expenseId,
            lineItems: [{
              description: `${args.vendor_or_description}${propertyName ? ` - ${propertyName}` : ''}`,
              amount: args.amount,
              category: args.category_suggestion || 'Miscellaneous'
            }]
          });

          qbBillId = qbBill?.Id || null;
          qbSuccess = true;
          console.log(`✅ [Expense] Created QuickBooks bill: ${qbBillId}`);
        }
      } catch (qbError) {
        console.error('QuickBooks bill creation failed:', qbError);
        // Continue without QB - we'll still store in Supabase
      }

      // Store in Supabase
      let supabaseSuccess = false;
      try {
        const { error: supabaseError } = await supabase
          .from('expenses')
          .insert({
            id: expenseId,
            amount: args.amount,
            vendor_name: args.vendor_or_description,
            category: args.category_suggestion || 'Other',
            property: propertyName || null,
            expense_date: expenseDate,
            payment_method: args.payment_method || 'unknown',
            quickbooks_bill_id: qbBillId,
            created_by: 'ai_assistant',
            notes: `Recorded via AI: "${args.vendor_or_description}"`,
            created_at: new Date().toISOString()
          });

        if (supabaseError) {
          // Table might not exist, try creating a simple record in documents table instead
          console.log('Expenses table not found, storing in documents:', supabaseError.message);

          await supabase
            .from('documents')
            .insert({
              id: expenseId,
              category: args.category_suggestion || 'Other',
              status: 'confirmed',
              metadata: {
                type: 'expense_record',
                data: {
                  vendorName: args.vendor_or_description,
                  amount: args.amount,
                  date: expenseDate,
                  description: args.vendor_or_description,
                  property: propertyName,
                  paymentMethod: args.payment_method,
                  quickbooksBillId: qbBillId
                }
              },
              created_at: new Date().toISOString()
            });
        }
        supabaseSuccess = true;
      } catch (dbError) {
        console.error('Database storage failed:', dbError);
      }

      // Also add to local mock for immediate display
      const newExpense: Expense = {
        id: expenseId,
        date: expenseDate,
        amount: args.amount,
        vendor: args.vendor_or_description,
        category: args.category_suggestion || 'Other',
        property: propertyName
      };
      MOCK_EXPENSES.push(newExpense);

      // Calculate category totals
      const categoryTotal = MOCK_EXPENSES
        .filter(e => e.category === newExpense.category)
        .reduce((sum, e) => sum + e.amount, 0);

      return {
        success: true,
        expense: newExpense,
        categoryTotal,
        quickbooksSync: qbSuccess,
        quickbooksBillId: qbBillId,
        databaseSync: supabaseSuccess,
        message: `Recorded $${args.amount} expense for ${args.vendor_or_description}${qbSuccess ? ' (synced to QuickBooks)' : ''}`
      };
    }

    // ===== BALANCE QUERIES =====
    case 'get_cash_position': {
      let accounts = [...MOCK_ACCOUNTS];
      
      if (args.account_filter) {
        const filter = args.account_filter.toLowerCase();
        accounts = accounts.filter(a => 
          a.name.toLowerCase().includes(filter) || 
          a.type.toLowerCase().includes(filter)
        );
      }

      const total = accounts.reduce((sum, a) => sum + a.balance, 0);

      if (args.group_by === 'account_type') {
        const grouped: Record<string, { total: number; accounts: BankAccount[] }> = {};
        accounts.forEach(a => {
          if (!grouped[a.type]) grouped[a.type] = { total: 0, accounts: [] };
          grouped[a.type].total += a.balance;
          grouped[a.type].accounts.push(a);
        });
        return { total, grouped };
      }

      return { total, accounts };
    }

    case 'get_account_balance': {
      const account = MOCK_ACCOUNTS.find(a => 
        a.name.toLowerCase().includes(args.account_name.toLowerCase())
      );
      if (!account) {
        return { error: 'Account not found', searchTerm: args.account_name };
      }
      return account;
    }

    // ===== REPORTS =====
    case 'generate_pl_summary': {
      // Scale factor based on period
      const periodMultipliers: Record<string, number> = {
        'this_month': 1,
        'last_month': 1,
        'this_quarter': 3,
        'last_quarter': 3,
        'this_year': 12,
        'last_year': 12,
        'ytd': 10, // ~10 months into year
        'all_time': 36, // 3 years of history
        'custom': 1
      };

      const multiplier = periodMultipliers[args.period] || 1;
      const periodLabel = args.period.replace(/_/g, ' ');

      // Base monthly data, scaled by period
      const plData = {
        period: periodLabel,
        revenue: {
          dispensarySales: Math.round(95000 * multiplier),
          rentalIncome: Math.round(32000 * multiplier),
          otherIncome: Math.round(5000 * multiplier),
          total: Math.round(132000 * multiplier)
        },
        expenses: {
          costOfGoodsSold: Math.round(38000 * multiplier),
          payroll: Math.round(28000 * multiplier),
          rent: Math.round(12000 * multiplier),
          utilities: Math.round(4500 * multiplier),
          repairs: Math.round(3200 * multiplier),
          insurance: Math.round(2800 * multiplier),
          marketing: Math.round(1500 * multiplier),
          professional: Math.round(2000 * multiplier),
          other: Math.round(2000 * multiplier),
          total: Math.round(94000 * multiplier)
        },
        netProfit: Math.round(38000 * multiplier),
        profitMargin: 28.8
      };

      if (args.detail_level === 'detailed') {
        return plData;
      }

      return {
        period: periodLabel,
        totalRevenue: plData.revenue.total,
        totalExpenses: plData.expenses.total,
        netProfit: plData.netProfit,
        profitMargin: plData.profitMargin
      };
    }

    case 'get_spending_breakdown': {
      const expenses = MOCK_EXPENSES.filter(e => {
        if (args.category_filter) {
          return e.category.toLowerCase().includes(args.category_filter.toLowerCase());
        }
        return true;
      });

      if (args.group_by === 'category') {
        const grouped: Record<string, { total: number; count: number; expenses: Expense[] }> = {};
        expenses.forEach(e => {
          if (!grouped[e.category]) grouped[e.category] = { total: 0, count: 0, expenses: [] };
          grouped[e.category].total += e.amount;
          grouped[e.category].count++;
          grouped[e.category].expenses.push(e);
        });
        return { period: args.period, breakdown: grouped };
      }

      if (args.group_by === 'vendor') {
        const grouped: Record<string, { total: number; count: number }> = {};
        expenses.forEach(e => {
          if (!grouped[e.vendor]) grouped[e.vendor] = { total: 0, count: 0 };
          grouped[e.vendor].total += e.amount;
          grouped[e.vendor].count++;
        });
        return { period: args.period, breakdown: grouped };
      }

      return { period: args.period, expenses };
    }

    // ===== DOCUMENTS =====
    case 'search_documents': {
      // Improved fuzzy search for documents
      const query = args.query.toLowerCase();

      // Extract search terms (words 2+ chars, excluding common words)
      const stopWords = ['the', 'for', 'and', 'was', 'that', 'with', 'from', 'find', 'looking', 'need', 'want', 'dollar', 'dollars'];
      const searchTerms = query.split(/[\s,]+/)
        .map((w: string) => w.replace(/[^\w]/g, ''))
        .filter((w: string) => w.length >= 2 && !stopWords.includes(w));

      // Extract numeric values (for amount matching)
      const numericValues: number[] = [];
      const numberMatches = query.match(/\$?\d+(?:,\d{3})*(?:\.\d{2})?/g);
      if (numberMatches) {
        numberMatches.forEach((m: string) => {
          const num = parseFloat(m.replace(/[$,]/g, ''));
          if (!isNaN(num)) numericValues.push(num);
        });
      }

      // Also try to extract numbers written as words
      const wordNumbers: Record<string, number> = {
        'hundred': 100, 'thousand': 1000, 'four': 4, 'five': 5, 'three': 3,
        'two': 2, 'one': 1, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
      };
      for (const [word, val] of Object.entries(wordNumbers)) {
        if (query.includes(word)) {
          // Check for patterns like "four hundred"
          if (query.includes(`${word} hundred`)) numericValues.push(val * 100);
        }
      }

      // Build keyword synonyms/expansions for common terms
      const expansions: Record<string, string[]> = {
        'ac': ['hvac', 'air conditioning', 'cooling', 'a/c', 'airconditioning'],
        'hvac': ['ac', 'air conditioning', 'cooling', 'heating'],
        'invoice': ['bill', 'receipt', 'statement', 'inv'],
        'bill': ['invoice', 'statement'],
        'rent': ['lease', 'rental'],
        'electric': ['utility', 'power', 'edison'],
        'water': ['utility'],
        'repair': ['maintenance', 'fix', 'service'],
        'maintenance': ['repair', 'service', 'fix'],
      };

      // Expand search terms with synonyms
      const expandedTerms = new Set<string>(searchTerms);
      searchTerms.forEach((term: string) => {
        if (expansions[term]) {
          expansions[term].forEach(syn => expandedTerms.add(syn));
        }
        // Also add partial matches (e.g., "cool" should match "coolair")
        if (term.length >= 4) expandedTerms.add(term);
      });

      try {
        // Query Supabase for documents
        const { data: documents, error } = await supabase
          .from('documents')
          .select('*')
          .in('status', ['processed', 'confirmed', 'archived', 'needs_review'])
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Supabase search error:', error);
          return { query: args.query, resultCount: 0, results: [], error: error.message };
        }

        // Score and filter documents
        const scoredDocs = (documents || []).map(doc => {
          const metadata = doc.metadata || {};
          const data = metadata.data || metadata;

          // Extract searchable fields
          const vendorName = (data.vendorName || '').toLowerCase();
          const description = (data.description || '').toLowerCase();
          const category = (doc.category || '').toLowerCase();
          const content = (doc.content || '').toLowerCase();
          const invoiceNumber = (data.invoiceNumber || '').toLowerCase();
          const amount = data.amount || data.totalAmount || 0;

          // Combine all text for searching
          const allText = `${vendorName} ${description} ${category} ${content} ${invoiceNumber}`;

          let score = 0;

          // Score based on term matches
          for (const term of expandedTerms) {
            if (vendorName.includes(term)) score += 10; // High priority for vendor name
            if (description.includes(term)) score += 5;
            if (category.includes(term)) score += 3;
            if (content.includes(term)) score += 2;
            // Check if the document contains the term anywhere
            if (allText.includes(term)) score += 1;
          }

          // Score based on amount matching
          if (numericValues.length > 0 && amount > 0) {
            for (const targetAmount of numericValues) {
              // Exact match
              if (Math.abs(amount - targetAmount) < 0.01) {
                score += 15; // High bonus for exact amount match
              }
              // Close match (within 10%)
              else if (Math.abs(amount - targetAmount) / targetAmount < 0.1) {
                score += 8;
              }
              // Same order of magnitude
              else if (Math.floor(Math.log10(amount)) === Math.floor(Math.log10(targetAmount))) {
                score += 2;
              }
            }
          }

          return { doc, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);

        // Verify Drive files exist (not trashed) and filter out orphaned records
        const validDocs = [];
        for (const { doc } of scoredDocs) {
          if (doc.drive_id) {
            const exists = await checkFileExists(doc.drive_id);
            if (!exists) {
              console.log(`🧹 Cleaning orphaned record ${doc.id} from search results`);
              await supabase.from('documents').delete().eq('id', doc.id);
              continue;
            }
          }
          validDocs.push(doc);
          if (validDocs.length >= 10) break;
        }

        const results = validDocs.map(doc => {
          const metadata = doc.metadata || {};
          const data = metadata.data || metadata;
          return {
            id: doc.id,
            name: data.vendorName || 'Unknown Document',
            description: data.description || '',
            amount: data.amount || data.totalAmount || 0,
            date: data.date || data.invoiceDate || doc.created_at,
            category: doc.category,
            status: doc.status,
            driveId: doc.drive_id,
            driveLink: doc.drive_id ? getDriveLink(doc.drive_id) : null,
            createdAt: doc.created_at
          };
        });

        return {
          query: args.query,
          searchTerms: Array.from(expandedTerms),
          numericFilters: numericValues,
          resultCount: results.length,
          results
        };
      } catch (err) {
        console.error('Document search failed:', err);
        return { query: args.query, resultCount: 0, results: [], error: 'Search failed' };
      }
    }

    // ===== BILLS & INVOICES =====
    case 'create_bill': {
      return {
        success: true,
        billId: `bill_${Date.now()}`,
        vendor: args.vendor_name,
        amount: args.amount,
        dueDate: args.due_date || 'Net 30',
        message: `Created bill for $${args.amount} from ${args.vendor_name}`
      };
    }

    case 'create_invoice': {
      return {
        success: true,
        invoiceId: `inv_${Date.now()}`,
        customer: args.customer_name,
        amount: args.amount,
        description: args.description,
        message: `Created invoice for $${args.amount} to ${args.customer_name}`
      };
    }

    // ===== PROFESSIONAL INVOICE GENERATION =====
    case 'generate_professional_invoice': {
      const invoiceDate = new Date();
      const dueDays = args.due_days || 30;
      const dueDate = new Date(invoiceDate.getTime() + dueDays * 24 * 60 * 60 * 1000);

      // Generate invoice number
      const year = invoiceDate.getFullYear().toString().slice(-2);
      const month = (invoiceDate.getMonth() + 1).toString().padStart(2, '0');
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const invoiceNumber = `INV-${year}${month}-${random}`;

      // Prepare invoice data
      const invoiceData = {
        invoiceNumber,
        customerName: args.customer_name,
        customerAddress: args.customer_address || '',
        property: args.property || '',
        description: args.description,
        amount: args.amount,
        date: invoiceDate.toISOString().split('T')[0],
        dueDate: dueDate.toISOString().split('T')[0],
        notes: args.notes || '',
      };

      try {
        // Call the invoice generation API
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/invoice/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invoiceData),
        });

        if (!response.ok) {
          throw new Error('Failed to generate invoice PDF');
        }

        const result = await response.json();

        // Build category for filing
        const category = args.category || 'Properties';
        const categoryLabel = args.property
          ? `${category} - ${args.property}`
          : category;

        // Save to Supabase documents table for document control
        console.log(`📄 Saving invoice ${invoiceNumber} to Supabase...`);
        const { data: savedDoc, error: saveError } = await supabase
          .from('documents')
          .insert({
            drive_id: `generated_${invoiceNumber}`, // Placeholder - will update when saved to Drive
            content: `Invoice for ${args.customer_name}: ${args.description}`,
            category: categoryLabel,
            status: 'needs_review',
            is_duplicate: false,
            metadata: {
              type: 'generated_invoice',
              invoiceNumber,
              data: {
                vendorName: args.customer_name, // For document control display
                amount: args.amount,
                date: invoiceDate.toISOString().split('T')[0],
                description: args.description,
                property: args.property || null,
              },
              category: args.category || 'Properties',
              property: args.property || null,
              expenseType: 'Invoice',
              needsBookkeeping: true,
              pdfDataUrl: result.pdfDataUrl,
              pdfBuffer: result.pdfBuffer, // Required for PDF preview
            },
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (saveError) {
          console.error('❌ Failed to save invoice to documents:', saveError);
          console.error('Save error details:', JSON.stringify(saveError, null, 2));
        } else {
          console.log(`✅ Invoice saved to documents with ID: ${savedDoc?.id}`);
        }

        return {
          success: true,
          invoiceNumber,
          documentId: savedDoc?.id || null,
          customerName: args.customer_name,
          amount: args.amount,
          description: args.description,
          property: args.property || null,
          category: categoryLabel,
          date: invoiceDate.toISOString().split('T')[0],
          dueDate: dueDate.toISOString().split('T')[0],
          pdfDataUrl: result.pdfDataUrl,
          message: `Invoice ${invoiceNumber} generated for ${args.customer_name}`,
          // Flags for the orchestrator to handle multi-step flow
          awaitingReview: true,
          canSaveToDrive: true,
          canSendToQuickBooks: true,
        };
      } catch (error) {
        console.error('Invoice generation error:', error);
        return {
          success: false,
          error: String(error),
          message: 'Failed to generate invoice',
        };
      }
    }

    case 'get_outstanding_invoices': {
      const invoices = [
        { id: 'inv_001', customer: 'Desert Sun Wellness', amount: 5000, dueDate: '2024-03-15', daysOverdue: 0 },
        { id: 'inv_002', customer: 'Phoenix Medical', amount: 3200, dueDate: '2024-03-01', daysOverdue: 14 },
        { id: 'inv_003', customer: 'Tempe Therapeutics', amount: 2800, dueDate: '2024-03-20', daysOverdue: -5 },
      ];

      let filtered = invoices;
      if (args.customer_filter) {
        filtered = filtered.filter(i => i.customer.toLowerCase().includes(args.customer_filter.toLowerCase()));
      }
      if (args.days_overdue) {
        filtered = filtered.filter(i => i.daysOverdue >= args.days_overdue);
      }

      return {
        totalOutstanding: filtered.reduce((sum, i) => sum + i.amount, 0),
        count: filtered.length,
        invoices: filtered
      };
    }

    case 'get_outstanding_bills': {
      // Get REAL bills from QuickBooks
      try {
        const isQbAuth = await quickbooks.isAuthenticated();
        if (!isQbAuth) {
          return {
            error: 'QuickBooks not connected',
            totalOwed: 0,
            count: 0,
            bills: [],
            message: 'QuickBooks is not connected. Please connect QuickBooks in Settings to see your bills.'
          };
        }

        const qbBills = await quickbooks.getBills();
        const today = new Date();

        // Transform and filter bills with outstanding balance
        let bills = qbBills
          .filter((b: { Balance?: number }) => b.Balance && b.Balance > 0)
          .map((b: { Id: string; VendorRef?: { name: string }; Balance?: number; TotalAmt?: number; DueDate?: string }) => {
            const dueDate = b.DueDate ? new Date(b.DueDate) : null;
            const daysTilDue = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

            return {
              id: b.Id,
              vendor: b.VendorRef?.name || 'Unknown Vendor',
              amount: b.Balance || b.TotalAmt || 0,
              dueDate: b.DueDate || 'No due date',
              daysTilDue,
              isOverdue: daysTilDue !== null && daysTilDue < 0
            };
          });

        // Apply filters
        if (args.vendor_filter) {
          bills = bills.filter((b: { vendor: string }) => b.vendor.toLowerCase().includes(args.vendor_filter.toLowerCase()));
        }
        if (args.due_within_days !== undefined) {
          bills = bills.filter((b: { daysTilDue: number | null }) => b.daysTilDue !== null && b.daysTilDue <= args.due_within_days);
        }

        // Sort by due date (overdue first, then soonest)
        bills.sort((a: { daysTilDue: number | null }, b: { daysTilDue: number | null }) => {
          if (a.daysTilDue === null) return 1;
          if (b.daysTilDue === null) return -1;
          return a.daysTilDue - b.daysTilDue;
        });

        const totalOwed = bills.reduce((sum: number, b: { amount: number }) => sum + b.amount, 0);
        const overdueCount = bills.filter((b: { isOverdue: boolean }) => b.isOverdue).length;

        return {
          totalOwed,
          count: bills.length,
          overdueCount,
          bills,
          message: bills.length === 0
            ? 'No outstanding bills - you\'re all caught up!'
            : `You have ${bills.length} outstanding bill${bills.length > 1 ? 's' : ''} totaling $${totalOwed.toLocaleString()}${overdueCount > 0 ? ` (${overdueCount} overdue)` : ''}.`
        };
      } catch (error) {
        console.error('Error fetching bills:', error);
        return {
          error: 'Failed to fetch bills from QuickBooks',
          totalOwed: 0,
          count: 0,
          bills: [],
          message: 'I couldn\'t retrieve your bills right now. Please try again.'
        };
      }
    }

    // ===== PROPERTIES =====
    case 'get_properties': {
      const properties = MOCK_PROPERTIES.map(p => ({
        ...p,
        tenant: args.include_tenants ? p.tenant : undefined
      }));
      return { count: properties.length, properties };
    }

    case 'get_property_expenses': {
      const property = MOCK_PROPERTIES.find(p => p.id === args.property_id);
      if (!property) {
        return { error: 'Property not found' };
      }

      const expenses = MOCK_EXPENSES.filter(e => e.property === property.name);
      return {
        property: property.name,
        period: args.period,
        totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
        expenses
      };
    }

    // ===== CANNABIS =====
    case 'get_dispensary_sales': {
      const salesData = {
        today: { revenue: 12450, transactions: 156, avgTicket: 79.81 },
        yesterday: { revenue: 11230, transactions: 142, avgTicket: 79.08 },
        this_week: { revenue: 67890, transactions: 845, avgTicket: 80.34 },
        last_week: { revenue: 65432, transactions: 812, avgTicket: 80.58 },
        this_month: { revenue: 245678, transactions: 3045, avgTicket: 80.68 }
      };

      const period = args.period as keyof typeof salesData;
      const data = salesData[period] || salesData.this_month;

      return {
        period: args.period,
        location: args.location || 'All Locations',
        ...data,
        topProducts: [
          { name: 'Blue Dream 1/8', sales: 2340, units: 89 },
          { name: 'Gorilla Glue Cartridge', sales: 1890, units: 63 },
          { name: 'Gummy Bears 100mg', sales: 1560, units: 78 }
        ]
      };
    }

    case 'get_inventory_status': {
      const inventory = [
        { product: 'Blue Dream', category: 'flower', quantity: 45, unit: 'oz', lowStock: false },
        { product: 'OG Kush', category: 'flower', quantity: 12, unit: 'oz', lowStock: true },
        { product: 'Live Resin Cartridge', category: 'concentrate', quantity: 89, unit: 'units', lowStock: false },
        { product: 'Gummy Bears 100mg', category: 'edibles', quantity: 8, unit: 'packs', lowStock: true },
        { product: 'Pre-Roll 5-Pack', category: 'prerolls', quantity: 67, unit: 'packs', lowStock: false },
      ];

      let filtered = inventory;
      if (args.product_type && args.product_type !== 'all') {
        filtered = filtered.filter(i => i.category === args.product_type);
      }
      if (args.low_stock_only) {
        filtered = filtered.filter(i => i.lowStock);
      }

      return {
        location: args.location || 'All Locations',
        itemCount: filtered.length,
        lowStockCount: filtered.filter(i => i.lowStock).length,
        inventory: filtered
      };
    }

    // ===== ALERTS =====
    case 'get_alerts': {
      const alerts: Array<{ type: string; severity: string; message: string; data?: unknown }> = [];

      // Check low balances
      if (!args.alert_type || args.alert_type === 'all' || args.alert_type === 'low_balance') {
        MOCK_ACCOUNTS.forEach(a => {
          if (a.balance < a.lowThreshold) {
            alerts.push({
              type: 'low_balance',
              severity: 'warning',
              message: `${a.name} is below threshold ($${a.balance.toLocaleString()} / $${a.lowThreshold.toLocaleString()})`,
              data: a
            });
          }
        });
      }

      // Add sample alerts
      if (!args.alert_type || args.alert_type === 'all' || args.alert_type === 'overdue_bills') {
        alerts.push({
          type: 'overdue_bill',
          severity: 'high',
          message: 'Verde Farms bill ($4,500) due in 5 days'
        });
      }

      if (!args.alert_type || args.alert_type === 'all' || args.alert_type === 'inventory') {
        alerts.push({
          type: 'low_inventory',
          severity: 'medium',
          message: 'OG Kush and Gummy Bears running low at Phoenix location'
        });
      }

      return {
        totalAlerts: alerts.length,
        highPriority: alerts.filter(a => a.severity === 'high').length,
        alerts
      };
    }

    // ===== JARVIS DAILY BRIEFING =====
    case 'get_daily_briefing': {
      const now = new Date();
      const californiaTime = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }).format(now);

      const hour = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false });
      const hourNum = parseInt(hour);

      let greeting = 'Good evening';
      if (hourNum < 12) greeting = 'Good morning';
      else if (hourNum < 17) greeting = 'Good afternoon';

      // Simulated weather for Anaheim Hills (realistic SoCal weather)
      const temps = [68, 72, 75, 78, 71, 74, 76, 73, 70, 77];
      const conditions = ['sunny', 'partly cloudy', 'clear skies', 'sunny with light breeze'];
      const temp = temps[Math.floor(Math.random() * temps.length)];
      const condition = conditions[Math.floor(Math.random() * conditions.length)];

      // Simulated market data
      const marketChange = (Math.random() * 2 - 0.5).toFixed(2);
      const marketDirection = parseFloat(marketChange) >= 0 ? 'up' : 'down';
      const marketSentiment = parseFloat(marketChange) >= 0.5 ? 'bullish' : parseFloat(marketChange) >= 0 ? 'slightly positive' : 'cautious';

      // Get REAL bills from QuickBooks
      const alerts: Array<{ type: string; priority: string; message: string; vendor?: string; amount?: number; dueDate?: string }> = [];
      let realBills: Array<{ VendorRef?: { name: string }; TotalAmt?: number; DueDate?: string; Balance?: number }> = [];

      try {
        const isQbAuth = await quickbooks.isAuthenticated();
        if (isQbAuth) {
          realBills = await quickbooks.getBills();

          // Process real bills - find upcoming/overdue
          const today = new Date();
          for (const bill of realBills) {
            if (bill.Balance && bill.Balance > 0) {
              const dueDate = bill.DueDate ? new Date(bill.DueDate) : null;
              const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

              let priority = 'medium';
              let message = '';

              if (daysUntilDue !== null) {
                if (daysUntilDue < 0) {
                  priority = 'high';
                  message = `OVERDUE: ${bill.VendorRef?.name || 'Unknown Vendor'} bill ($${bill.Balance?.toLocaleString()}) was due ${Math.abs(daysUntilDue)} days ago`;
                } else if (daysUntilDue <= 7) {
                  priority = 'high';
                  message = `${bill.VendorRef?.name || 'Unknown Vendor'} bill ($${bill.Balance?.toLocaleString()}) due in ${daysUntilDue} days`;
                } else if (daysUntilDue <= 14) {
                  priority = 'medium';
                  message = `${bill.VendorRef?.name || 'Unknown Vendor'} bill ($${bill.Balance?.toLocaleString()}) due in ${daysUntilDue} days`;
                }
              }

              if (message) {
                alerts.push({
                  type: 'bill_due',
                  priority,
                  message,
                  vendor: bill.VendorRef?.name,
                  amount: bill.Balance,
                  dueDate: bill.DueDate
                });
              }
            }
          }
        }
      } catch (qbError) {
        console.log('QuickBooks not connected, using mock data:', qbError);
      }

      // If no real bills, add mock alert
      if (alerts.length === 0) {
        alerts.push({
          type: 'info',
          priority: 'low',
          message: 'No urgent bills - you\'re all caught up!'
        });
      }

      // Get pending documents from Supabase
      let pendingDocs = 0;
      try {
        const { count } = await supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'needs_review');
        pendingDocs = count || 0;
      } catch {
        // Ignore
      }

      // Get total cash position
      const totalCash = MOCK_ACCOUNTS.reduce((sum, a) => sum + a.balance, 0);

      // Calculate totals for bills
      const totalBillsOwed = realBills.reduce((sum, b) => sum + (b.Balance || 0), 0);
      const overdueAlerts = alerts.filter(a => a.message?.includes('OVERDUE'));
      const dueSoonAlerts = alerts.filter(a => a.priority === 'high' && !a.message?.includes('OVERDUE'));
      const totalOverdue = overdueAlerts.reduce((sum, a) => sum + (a.amount || 0), 0);

      // Find the biggest bill for mention
      const biggestBill = alerts.reduce((max, a) =>
        (a.amount || 0) > (max?.amount || 0) ? a : max,
        null as typeof alerts[0] | null
      );

      // Simple summary for Jane to work with (NOT a template)
      return {
        greeting,
        dateTime: californiaTime,
        // Key financial data
        cashPosition: totalCash,
        cashFormatted: `$${(totalCash / 1000000).toFixed(1)}M`,
        // Bills summary
        totalBills: alerts.length,
        totalBillsAmount: totalBillsOwed,
        overdueCount: overdueAlerts.length,
        overdueAmount: totalOverdue,
        dueTodayCount: dueSoonAlerts.filter(a => a.message?.includes('due in 0')).length,
        // Biggest bill (for optional mention)
        biggestBill: biggestBill ? {
          vendor: biggestBill.vendor,
          amount: biggestBill.amount,
          isOverdue: biggestBill.message?.includes('OVERDUE')
        } : null,
        // Pending docs
        pendingDocs,
        // Raw alerts if Jane needs details
        alerts,
        // NO pre-formatted message - Jane should craft her own natural response
      };
    }

    // ===== GET ACTION ITEMS - "What should I do today?" =====
    case 'get_action_items': {
      const actionItems: Array<{
        priority: 'high' | 'medium' | 'low';
        category: string;
        action: string;
        details?: string;
        amount?: number;
        dueDate?: string;
      }> = [];

      // 1. Get REAL bills from QuickBooks
      try {
        const isQbAuth = await quickbooks.isAuthenticated();
        if (isQbAuth) {
          const bills = await quickbooks.getBills();
          const today = new Date();

          for (const bill of bills) {
            if (bill.Balance && bill.Balance > 0) {
              const dueDate = bill.DueDate ? new Date(bill.DueDate) : null;
              const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

              if (daysUntilDue !== null && daysUntilDue < 0) {
                // Overdue
                actionItems.push({
                  priority: 'high',
                  category: 'Bills',
                  action: `Pay overdue bill to ${bill.VendorRef?.name || 'Unknown'}`,
                  details: `$${bill.Balance.toLocaleString()} was due ${Math.abs(daysUntilDue)} days ago`,
                  amount: bill.Balance,
                  dueDate: bill.DueDate
                });
              } else if (daysUntilDue !== null && daysUntilDue <= 7) {
                // Due within a week
                actionItems.push({
                  priority: 'high',
                  category: 'Bills',
                  action: `Pay bill to ${bill.VendorRef?.name || 'Unknown'}`,
                  details: `$${bill.Balance.toLocaleString()} due in ${daysUntilDue} days`,
                  amount: bill.Balance,
                  dueDate: bill.DueDate
                });
              } else if (daysUntilDue !== null && daysUntilDue <= 14) {
                // Due within two weeks
                actionItems.push({
                  priority: 'medium',
                  category: 'Bills',
                  action: `Schedule payment to ${bill.VendorRef?.name || 'Unknown'}`,
                  details: `$${bill.Balance.toLocaleString()} due in ${daysUntilDue} days`,
                  amount: bill.Balance,
                  dueDate: bill.DueDate
                });
              }
            }
          }
        }
      } catch (qbError) {
        console.log('QuickBooks error getting bills:', qbError);
      }

      // 2. Get pending documents from Supabase
      try {
        const { data: pendingDocs, error } = await supabase
          .from('documents')
          .select('id, category, metadata, created_at')
          .eq('status', 'needs_review')
          .order('created_at', { ascending: true })
          .limit(10);

        if (!error && pendingDocs && pendingDocs.length > 0) {
          actionItems.push({
            priority: pendingDocs.length > 5 ? 'high' : 'medium',
            category: 'Documents',
            action: `Review ${pendingDocs.length} pending document${pendingDocs.length > 1 ? 's' : ''}`,
            details: `Documents waiting in Files & Docs for review and filing`
          });
        }
      } catch {
        // Ignore
      }

      // 3. Get reminders from profile
      try {
        const profile = await profileManager.getProfile();
        const pendingReminders = profile.schedule.reminders.filter(r => !r.completed);

        for (const reminder of pendingReminders) {
          const dueDate = reminder.dueDate ? new Date(reminder.dueDate) : null;
          const today = new Date();
          const isOverdue = dueDate && dueDate < today;

          actionItems.push({
            priority: isOverdue ? 'high' : (reminder.priority as 'high' | 'medium' | 'low'),
            category: 'Reminders',
            action: reminder.content,
            details: reminder.dueDate ? (isOverdue ? `Was due ${reminder.dueDate}` : `Due ${reminder.dueDate}`) : undefined,
            dueDate: reminder.dueDate
          });
        }

        // Check upcoming events
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const upcomingEvents = profile.schedule.upcomingEvents.filter(e => {
          const eventDate = new Date(e.date);
          return eventDate <= tomorrow && eventDate >= new Date();
        });

        for (const event of upcomingEvents) {
          actionItems.push({
            priority: 'high',
            category: 'Events',
            action: `Prepare for: ${event.title}`,
            details: `Scheduled for ${event.date}${event.time ? ` at ${event.time}` : ''}`,
            dueDate: event.date
          });
        }
      } catch {
        // Ignore
      }

      // Sort by priority
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      actionItems.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      // Apply filters if specified
      let filteredItems = actionItems;
      if (args.focus_area && args.focus_area !== 'all') {
        const areaMap: Record<string, string[]> = {
          'bills': ['Bills'],
          'documents': ['Documents'],
          'properties': ['Properties'],
          'dispensaries': ['Dispensaries']
        };
        const categories = areaMap[args.focus_area] || [];
        filteredItems = actionItems.filter(item => categories.includes(item.category));
      }
      if (args.priority_filter && args.priority_filter !== 'all') {
        filteredItems = filteredItems.filter(item => item.priority === args.priority_filter);
      }

      // Build formatted message
      const highPriority = filteredItems.filter(i => i.priority === 'high');
      const mediumPriority = filteredItems.filter(i => i.priority === 'medium');

      let formattedMessage = `Here's what needs your attention today:\n\n`;

      if (highPriority.length > 0) {
        formattedMessage += `**🔴 High Priority:**\n`;
        highPriority.forEach((item, idx) => {
          formattedMessage += `${idx + 1}. ${item.action}${item.details ? ` - ${item.details}` : ''}\n`;
        });
        formattedMessage += '\n';
      }

      if (mediumPriority.length > 0) {
        formattedMessage += `**🟡 Medium Priority:**\n`;
        mediumPriority.forEach((item, idx) => {
          formattedMessage += `${idx + 1}. ${item.action}${item.details ? ` - ${item.details}` : ''}\n`;
        });
        formattedMessage += '\n';
      }

      if (filteredItems.length === 0) {
        formattedMessage = `Great news! You're all caught up - no urgent action items right now. Would you like me to review your upcoming schedule or generate a financial report?`;
      } else {
        formattedMessage += `\nWould you like me to help with any of these?`;
      }

      // Calculate totals
      const totalBillsDue = filteredItems
        .filter(i => i.category === 'Bills' && i.amount)
        .reduce((sum, i) => sum + (i.amount || 0), 0);

      return {
        actionItems: filteredItems,
        totalItems: filteredItems.length,
        highPriorityCount: highPriority.length,
        mediumPriorityCount: mediumPriority.length,
        totalBillsDue,
        formattedMessage,
        message: formattedMessage  // Jane should use this
      };
    }

    // ===== MEMORY & LEARNING - JARVIS FEATURES =====
    case 'remember_fact': {
      const success = await profileManager.addMemory(
        args.fact,
        args.category,
        'conversation'
      );

      return {
        success,
        fact: args.fact,
        category: args.category,
        message: success
          ? `Got it! I'll remember that: "${args.fact}"`
          : 'I had trouble saving that, but I\'ll try to remember it for this conversation.'
      };
    }

    case 'add_contact': {
      const success = await profileManager.addContact(
        args.name,
        args.relationship,
        args.notes
      );

      return {
        success,
        name: args.name,
        relationship: args.relationship,
        message: success
          ? `Added ${args.name} (${args.relationship}) to your contacts!`
          : `I'll remember ${args.name} for this conversation.`
      };
    }

    case 'add_reminder': {
      const success = await profileManager.addReminder(
        args.content,
        args.due_date,
        args.priority || 'medium'
      );

      return {
        success,
        content: args.content,
        dueDate: args.due_date,
        priority: args.priority || 'medium',
        message: success
          ? `Reminder set: "${args.content}"${args.due_date ? ` (due ${args.due_date})` : ''}`
          : 'I\'ll try to remind you about that.'
      };
    }

    case 'add_event': {
      const success = await profileManager.addEvent(
        args.title,
        args.date,
        args.time,
        args.notes
      );

      return {
        success,
        title: args.title,
        date: args.date,
        time: args.time,
        message: success
          ? `Event added: "${args.title}" on ${args.date}${args.time ? ` at ${args.time}` : ''}`
          : 'I had trouble adding that event, but I\'ll remember it.'
      };
    }

    case 'get_reminders': {
      const profile = await profileManager.getProfile();
      const reminders = profile.schedule.reminders.filter(r =>
        args.include_completed ? true : !r.completed
      );

      const daysAhead = args.days_ahead || 7;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

      const upcomingEvents = profile.schedule.upcomingEvents.filter(e => {
        const eventDate = new Date(e.date);
        return eventDate <= cutoffDate && eventDate >= new Date();
      });

      return {
        reminders,
        upcomingEvents,
        reminderCount: reminders.length,
        eventCount: upcomingEvents.length,
        message: reminders.length === 0 && upcomingEvents.length === 0
          ? 'You\'re all clear! No pending reminders or upcoming events.'
          : `You have ${reminders.length} reminder(s) and ${upcomingEvents.length} upcoming event(s).`
      };
    }

    case 'update_preference': {
      let success = false;
      const prefType = args.preference_type;
      const value = args.value;

      switch (prefType) {
        case 'communication_style':
          success = await profileManager.updatePreference('communicationStyle', value);
          break;
        case 'preferred_name':
          success = await profileManager.updatePreference('preferredName', value);
          break;
        case 'favorite_topic':
          success = await profileManager.addFavoriteTopic(value);
          break;
        case 'disliked_topic':
          const profile = await profileManager.getProfile();
          if (!profile.preferences.dislikedTopics.includes(value)) {
            profile.preferences.dislikedTopics.push(value);
            success = await profileManager.updateProfile(profile);
          } else {
            success = true;
          }
          break;
        default:
          success = false;
      }

      return {
        success,
        preferenceType: prefType,
        value,
        message: success
          ? `Preference updated: ${prefType} = "${value}"`
          : 'I couldn\'t update that preference right now.'
      };
    }

    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
}
