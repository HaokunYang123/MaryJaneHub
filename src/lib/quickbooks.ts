import OAuthClient from 'intuit-oauth';

// QuickBooks OAuth Configuration
const oauthClient = new OAuthClient({
    clientId: process.env.QUICKBOOKS_CLIENT_ID!,
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET!,
    environment: (process.env.QUICKBOOKS_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
    redirectUri: process.env.QUICKBOOKS_REDIRECT_URI!,
});

// Store tokens in memory (in production, use a database)
let tokenData: {
    accessToken: string;
    refreshToken: string;
    realmId: string;
    expiresAt: number;
} | null = null;

export function getAuthUrl(): string {
    return oauthClient.authorizeUri({
        scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
        state: 'mary-hub-state',
    });
}

export async function exchangeToken(url: string): Promise<{ success: boolean; realmId?: string }> {
    try {
        const authResponse = await oauthClient.createToken(url);
        const token = authResponse.getJson();

        tokenData = {
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            realmId: token.realmId || (oauthClient as unknown as { token: { realmId: string } }).token?.realmId || '',
            expiresAt: Date.now() + (token.expires_in * 1000),
        };

        return { success: true, realmId: tokenData.realmId };
    } catch (error) {
        console.error('Token exchange error:', error);
        return { success: false };
    }
}

export function isAuthenticated(): boolean {
    return tokenData !== null && tokenData.expiresAt > Date.now();
}

export function getTokens() {
    return tokenData;
}

async function refreshTokenIfNeeded() {
    if (!tokenData) throw new Error('Not authenticated with QuickBooks');

    if (tokenData.expiresAt < Date.now() + 60000) {
        try {
            oauthClient.setToken({
                access_token: tokenData.accessToken,
                refresh_token: tokenData.refreshToken,
                token_type: 'bearer',
                expires_in: 3600,
                x_refresh_token_expires_in: 8726400,
                realmId: tokenData.realmId,
            });

            const authResponse = await oauthClient.refresh();
            const token = authResponse.getJson();

            tokenData = {
                ...tokenData,
                accessToken: token.access_token,
                refreshToken: token.refresh_token,
                expiresAt: Date.now() + (token.expires_in * 1000),
            };
        } catch (error) {
            console.error('Token refresh error:', error);
            throw error;
        }
    }
}

async function makeRequest(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: object) {
    await refreshTokenIfNeeded();

    const baseUrl = process.env.QUICKBOOKS_ENVIRONMENT === 'production'
        ? 'https://quickbooks.api.intuit.com'
        : 'https://sandbox-quickbooks.api.intuit.com';

    const url = `${baseUrl}/v3/company/${tokenData!.realmId}${endpoint}`;

    const response = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${tokenData!.accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`QuickBooks API error: ${error}`);
    }

    return response.json();
}

// Vendor Management
export async function getVendors() {
    const result = await makeRequest('/query?query=SELECT * FROM Vendor MAXRESULTS 1000');
    return result.QueryResponse.Vendor || [];
}

export async function findVendor(name: string) {
    const vendors = await getVendors();
    return vendors.find((v: { DisplayName: string }) =>
        v.DisplayName.toLowerCase().includes(name.toLowerCase())
    );
}

export async function createVendor(name: string) {
    const result = await makeRequest('/vendor', 'POST', {
        DisplayName: name,
    });
    return result.Vendor;
}

export async function findOrCreateVendor(name: string) {
    let vendor = await findVendor(name);
    if (!vendor) {
        vendor = await createVendor(name);
    }
    return vendor;
}

// Account Management
export async function getExpenseAccounts() {
    const result = await makeRequest('/query?query=SELECT * FROM Account WHERE AccountType = \'Expense\' MAXRESULTS 1000');
    return result.QueryResponse.Account || [];
}

// Auto-categorization based on vendor history
const categoryMap: Record<string, string> = {
    'security': 'Security',
    'electric': 'Utilities',
    'water': 'Utilities',
    'gas': 'Utilities',
    'internet': 'Utilities',
    'phone': 'Utilities',
    'supplies': 'Office Supplies',
    'office': 'Office Supplies',
    'nutrient': 'Supplies',
    'growing': 'Supplies',
    'packaging': 'Supplies',
    'insurance': 'Insurance',
    'rent': 'Rent',
    'lease': 'Rent',
    'legal': 'Professional Services',
    'accounting': 'Professional Services',
    'marketing': 'Marketing',
    'advertising': 'Marketing',
};

export function suggestCategory(vendorName: string, description?: string): string {
    const searchText = `${vendorName} ${description || ''}`.toLowerCase();

    for (const [keyword, category] of Object.entries(categoryMap)) {
        if (searchText.includes(keyword)) {
            return category;
        }
    }

    return 'Miscellaneous';
}

export async function getAccountByName(name: string) {
    const accounts = await getExpenseAccounts();
    return accounts.find((a: { Name: string }) =>
        a.Name.toLowerCase().includes(name.toLowerCase())
    ) || accounts[0]; // Default to first expense account
}

// Bill Management
interface BillLineItem {
    description: string;
    amount: number;
    category?: string;
}

interface CreateBillData {
    vendorName: string;
    dueDate: string;
    lineItems: BillLineItem[];
    invoiceNumber?: string;
}

export async function createBill(data: CreateBillData) {
    // Find or create vendor
    const vendor = await findOrCreateVendor(data.vendorName);

    // Build line items with auto-categorization
    const lines = await Promise.all(data.lineItems.map(async (item, idx) => {
        const category = item.category || suggestCategory(data.vendorName, item.description);
        const account = await getAccountByName(category);

        return {
            Id: String(idx + 1),
            Amount: item.amount,
            DetailType: 'AccountBasedExpenseLineDetail',
            AccountBasedExpenseLineDetail: {
                AccountRef: {
                    value: account.Id,
                    name: account.Name,
                },
            },
            Description: item.description,
        };
    }));

    const billData = {
        VendorRef: {
            value: vendor.Id,
            name: vendor.DisplayName,
        },
        DueDate: data.dueDate,
        Line: lines,
        DocNumber: data.invoiceNumber,
    };

    const result = await makeRequest('/bill', 'POST', billData);
    return result.Bill;
}

// Get all bills
export async function getBills() {
    const result = await makeRequest('/query?query=SELECT * FROM Bill MAXRESULTS 100');
    return result.QueryResponse.Bill || [];
}

// Profit & Loss Report
export async function getProfitAndLoss(startDate: string, endDate: string) {
    const result = await makeRequest(
        `/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}`
    );
    return result;
}

// Expense Summary
export async function getExpenseSummary(startDate: string, endDate: string) {
    const result = await makeRequest(
        `/reports/ProfitAndLossDetail?start_date=${startDate}&end_date=${endDate}&accounting_method=Accrual`
    );
    return result;
}
