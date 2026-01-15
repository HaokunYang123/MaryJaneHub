import 'server-only';
import OAuthClient from 'intuit-oauth';
import { cookies } from 'next/headers';

// QuickBooks OAuth Configuration
const oauthClient = new OAuthClient({
    clientId: process.env.QUICKBOOKS_CLIENT_ID!,
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET!,
    environment: (process.env.QUICKBOOKS_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
    redirectUri: process.env.QUICKBOOKS_REDIRECT_URI!,
});

const DEFAULT_REFRESH_TOKEN_TTL = 8726400; // 100 days in seconds
const ACCESS_TOKEN_BUFFER_MS = 60000;

const COOKIE_NAMES = {
    accessToken: 'qb_access_token',
    refreshToken: 'qb_refresh_token',
    realmId: 'qb_realm_id',
    accessExpiresAt: 'qb_access_expires_at',
    refreshExpiresAt: 'qb_refresh_expires_at',
};

interface TokenData {
    accessToken: string;
    refreshToken: string;
    realmId: string;
    accessTokenExpiresAt: number;
    refreshTokenExpiresAt: number;
}

function readTokenData(): TokenData | null {
    const cookieStore = cookies();
    const accessToken = cookieStore.get(COOKIE_NAMES.accessToken)?.value;
    const refreshToken = cookieStore.get(COOKIE_NAMES.refreshToken)?.value;
    const realmId = cookieStore.get(COOKIE_NAMES.realmId)?.value;
    const accessTokenExpiresAt = Number(cookieStore.get(COOKIE_NAMES.accessExpiresAt)?.value);
    const refreshTokenExpiresAt = Number(cookieStore.get(COOKIE_NAMES.refreshExpiresAt)?.value);

    if (!accessToken || !refreshToken || !realmId) return null;
    if (!Number.isFinite(accessTokenExpiresAt) || !Number.isFinite(refreshTokenExpiresAt)) return null;

    return {
        accessToken,
        refreshToken,
        realmId,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
    };
}

function writeTokenCookies(tokenData: TokenData) {
    const cookieStore = cookies();
    const expires = new Date(tokenData.refreshTokenExpiresAt);
    const baseOptions = {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        expires,
    };

    cookieStore.set(COOKIE_NAMES.accessToken, tokenData.accessToken, baseOptions);
    cookieStore.set(COOKIE_NAMES.refreshToken, tokenData.refreshToken, baseOptions);
    cookieStore.set(COOKIE_NAMES.realmId, tokenData.realmId, baseOptions);
    cookieStore.set(COOKIE_NAMES.accessExpiresAt, String(tokenData.accessTokenExpiresAt), baseOptions);
    cookieStore.set(COOKIE_NAMES.refreshExpiresAt, String(tokenData.refreshTokenExpiresAt), baseOptions);
}

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
        const realmId = token.realmId || (oauthClient as unknown as { token: { realmId: string } }).token?.realmId || '';
        const accessTokenExpiresAt = Date.now() + (token.expires_in * 1000);
        const refreshTokenExpiresAt = Date.now() + ((token.x_refresh_token_expires_in || DEFAULT_REFRESH_TOKEN_TTL) * 1000);

        writeTokenCookies({
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            realmId,
            accessTokenExpiresAt,
            refreshTokenExpiresAt,
        });

        return { success: true, realmId };
    } catch (error) {
        console.error('Token exchange error:', error);
        return { success: false };
    }
}

export function isAuthenticated(): boolean {
    const tokenData = readTokenData();
    return !!tokenData && tokenData.refreshTokenExpiresAt > Date.now();
}

export function getTokens() {
    return readTokenData();
}

async function refreshTokenIfNeeded(): Promise<TokenData> {
    const tokenData = readTokenData();
    if (!tokenData) throw new Error('Not authenticated with QuickBooks');

    if (tokenData.accessTokenExpiresAt < Date.now() + ACCESS_TOKEN_BUFFER_MS) {
        try {
            oauthClient.setToken({
                access_token: tokenData.accessToken,
                refresh_token: tokenData.refreshToken,
                token_type: 'bearer',
                expires_in: 3600,
                x_refresh_token_expires_in: DEFAULT_REFRESH_TOKEN_TTL,
                realmId: tokenData.realmId,
            });

            const authResponse = await oauthClient.refresh();
            const token = authResponse.getJson();

            const refreshed: TokenData = {
                accessToken: token.access_token,
                refreshToken: token.refresh_token || tokenData.refreshToken,
                realmId: token.realmId || tokenData.realmId,
                accessTokenExpiresAt: Date.now() + (token.expires_in * 1000),
                refreshTokenExpiresAt: Date.now() + ((token.x_refresh_token_expires_in || DEFAULT_REFRESH_TOKEN_TTL) * 1000),
            };

            writeTokenCookies(refreshed);
            return refreshed;
        } catch (error) {
            console.error('Token refresh error:', error);
            throw error;
        }
    }

    return tokenData;
}

async function makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: object,
    realmIdOverride?: string
) {
    const tokenData = await refreshTokenIfNeeded();

    const baseUrl = process.env.QUICKBOOKS_ENVIRONMENT === 'production'
        ? 'https://quickbooks.api.intuit.com'
        : 'https://sandbox-quickbooks.api.intuit.com';

    const realmId = realmIdOverride || tokenData.realmId;
    const url = `${baseUrl}/v3/company/${realmId}${endpoint}`;

    const response = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`,
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

interface VendorAddressInput {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
}

function normalizeVendorAddress(address?: VendorAddressInput | string) {
    if (!address) return undefined;

    if (typeof address === 'string') {
        return { Line1: address };
    }

    const billAddr: Record<string, string> = {};
    if (address.line1) billAddr.Line1 = address.line1;
    if (address.line2) billAddr.Line2 = address.line2;
    if (address.city) billAddr.City = address.city;
    if (address.state) billAddr.CountrySubDivisionCode = address.state;
    if (address.postalCode) billAddr.PostalCode = address.postalCode;
    if (address.country) billAddr.Country = address.country;

    return Object.keys(billAddr).length > 0 ? billAddr : undefined;
}

function escapeQueryValue(value: string) {
    return value.replace(/'/g, "''");
}

export async function queryVendorByDisplayName(name: string) {
    const escaped = escapeQueryValue(name);
    const query = `SELECT * FROM Vendor WHERE DisplayName = '${escaped}' MAXRESULTS 1`;
    const result = await makeRequest(`/query?query=${encodeURIComponent(query)}`);
    return result.QueryResponse.Vendor?.[0] || null;
}

export async function createVendorWithDetails(
    name: string,
    address?: VendorAddressInput | string,
    phone?: string
) {
    const billAddr = normalizeVendorAddress(address);
    const payload: Record<string, unknown> = {
        DisplayName: name,
    };

    if (billAddr) {
        payload.BillAddr = billAddr;
    }

    if (phone) {
        payload.PrimaryPhone = { FreeFormNumber: phone };
    }

    const result = await makeRequest('/vendor', 'POST', payload);
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

interface QuickBooksClassRef {
    value: string;
    name?: string;
}

interface CreateBillData {
    vendorName: string;
    dueDate: string;
    lineItems: BillLineItem[];
    invoiceNumber?: string;
    classRef?: QuickBooksClassRef;
}

export async function createBill(data: CreateBillData) {
    // Find or create vendor
    const vendor = await findOrCreateVendor(data.vendorName);

    // Build line items with auto-categorization
    const lines = await Promise.all(data.lineItems.map(async (item, idx) => {
        const category = item.category || suggestCategory(data.vendorName, item.description);
        const account = await getAccountByName(category);
        const lineDetail: {
            AccountRef: { value: string; name: string };
            ClassRef?: QuickBooksClassRef;
        } = {
            AccountRef: {
                value: account.Id,
                name: account.Name,
            },
        };

        if (data.classRef) {
            lineDetail.ClassRef = data.classRef;
        }

        return {
            Id: String(idx + 1),
            Amount: item.amount,
            DetailType: 'AccountBasedExpenseLineDetail',
            AccountBasedExpenseLineDetail: {
                ...lineDetail,
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

export async function getProfitAndLossForRealm(realmId: string, startDate: string, endDate: string) {
    const result = await makeRequest(
        `/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}`,
        'GET',
        undefined,
        realmId
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

// Journal Entry Management
export async function createJournalEntry(payload: object, realmIdOverride?: string) {
    const result = await makeRequest('/journalentry', 'POST', payload, realmIdOverride);
    return result.JournalEntry;
}
