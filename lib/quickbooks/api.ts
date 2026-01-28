import { getQBConfig, QB_API_BASE_URL } from "./config";
import { getTokens, saveTokens } from "./token-store";
import { refreshTokens, isTokenExpired, type QBTokens } from "./auth";
import type {
  QBCompanyInfo,
  QBVendor,
  QBVendorInput,
  QBBill,
  QBBillInput,
  QBResponse,
  QBQueryResponse,
  QBApiError,
} from "./types";

/**
 * Get valid access token, refreshing if necessary
 */
async function getValidToken(): Promise<QBTokens> {
  const tokens = await getTokens();

  if (!tokens) {
    throw new Error("QuickBooks not connected. Please connect first.");
  }

  // Refresh if expired or about to expire
  if (isTokenExpired(tokens.expires_at)) {
    console.log("Access token expired, refreshing...");
    const newTokens = await refreshTokens(tokens.refresh_token);
    // Update realm_id from original tokens if not returned
    newTokens.realm_id = newTokens.realm_id || tokens.realm_id;
    await saveTokens(newTokens);
    return newTokens;
  }

  return tokens;
}

/**
 * Make authenticated request to QuickBooks API
 * Handles 401 errors by refreshing token and retrying once
 */
async function qbFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<T> {
  const tokens = await getValidToken();
  const config = getQBConfig();
  const baseUrl = QB_API_BASE_URL[config.environment];

  const url = `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  // Handle 401 by refreshing token and retrying once
  if (response.status === 401 && retryCount === 0) {
    console.log("Received 401, refreshing token and retrying...");
    const newTokens = await refreshTokens(tokens.refresh_token);
    newTokens.realm_id = newTokens.realm_id || tokens.realm_id;
    await saveTokens(newTokens);
    return qbFetch<T>(endpoint, options, retryCount + 1);
  }

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as QBApiError;
    const errorMessage =
      errorData.Fault?.Error?.[0]?.Message ||
      errorData.Fault?.Error?.[0]?.Detail ||
      `HTTP ${response.status}`;
    throw new Error(`QuickBooks API error: ${errorMessage}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Get company information
 */
export async function getCompanyInfo(): Promise<QBCompanyInfo> {
  const tokens = await getValidToken();
  const realmId = tokens.realm_id;

  const response = await qbFetch<QBResponse<QBCompanyInfo>>(
    `/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`
  );

  return response.CompanyInfo;
}

/**
 * Get all vendors
 */
export async function getVendors(): Promise<QBVendor[]> {
  const tokens = await getValidToken();
  const realmId = tokens.realm_id;

  const query = encodeURIComponent("SELECT * FROM Vendor MAXRESULTS 1000");
  const response = await qbFetch<QBQueryResponse<QBVendor>>(
    `/v3/company/${realmId}/query?query=${query}&minorversion=65`
  );

  return response.QueryResponse.Vendor || [];
}

/**
 * Find vendor by display name (case-insensitive partial match)
 */
export async function findVendorByName(name: string): Promise<QBVendor | null> {
  const tokens = await getValidToken();
  const realmId = tokens.realm_id;

  // Escape single quotes in name
  const escapedName = name.replace(/'/g, "\\'");
  const query = encodeURIComponent(
    `SELECT * FROM Vendor WHERE DisplayName LIKE '%${escapedName}%'`
  );

  const response = await qbFetch<QBQueryResponse<QBVendor>>(
    `/v3/company/${realmId}/query?query=${query}&minorversion=65`
  );

  const vendors = response.QueryResponse.Vendor || [];
  return vendors.length > 0 ? vendors[0] : null;
}

/**
 * Find vendor by exact display name
 */
export async function findVendorByExactName(name: string): Promise<QBVendor | null> {
  const tokens = await getValidToken();
  const realmId = tokens.realm_id;

  // Escape single quotes in name
  const escapedName = name.replace(/'/g, "\\'");
  const query = encodeURIComponent(
    `SELECT * FROM Vendor WHERE DisplayName = '${escapedName}'`
  );

  const response = await qbFetch<QBQueryResponse<QBVendor>>(
    `/v3/company/${realmId}/query?query=${query}&minorversion=65`
  );

  const vendors = response.QueryResponse.Vendor || [];
  return vendors.length > 0 ? vendors[0] : null;
}

/**
 * Create a new vendor
 */
export async function createVendor(input: QBVendorInput): Promise<QBVendor> {
  const tokens = await getValidToken();
  const realmId = tokens.realm_id;

  const vendorData: Partial<QBVendor> = {
    DisplayName: input.displayName,
  };

  if (input.email) {
    vendorData.PrimaryEmailAddr = { Address: input.email };
  }

  if (input.companyName) {
    vendorData.CompanyName = input.companyName;
  }

  const response = await qbFetch<QBResponse<QBVendor>>(
    `/v3/company/${realmId}/vendor?minorversion=65`,
    {
      method: "POST",
      body: JSON.stringify(vendorData),
    }
  );

  return response.Vendor;
}

/**
 * Find or create vendor by name
 * Returns existing vendor if found, creates new one if not
 */
export async function findOrCreateVendor(input: QBVendorInput): Promise<QBVendor> {
  // First try to find existing vendor
  const existing = await findVendorByExactName(input.displayName);
  if (existing) {
    return existing;
  }

  // Create new vendor
  return createVendor(input);
}

/**
 * Create a bill
 */
export async function createBill(input: QBBillInput): Promise<QBBill> {
  const tokens = await getValidToken();
  const realmId = tokens.realm_id;

  const billData: QBBill = {
    VendorRef: {
      value: input.vendorId,
      name: input.vendorName,
    },
    Line: input.lines.map((line, index) => ({
      Amount: line.amount,
      Description: line.description,
      DetailType: "AccountBasedExpenseLineDetail" as const,
      LineNum: index + 1,
      AccountBasedExpenseLineDetail: {
        AccountRef: {
          value: line.accountId,
          name: line.accountName,
        },
      },
    })),
  };

  if (input.txnDate) {
    billData.TxnDate = input.txnDate;
  }

  if (input.dueDate) {
    billData.DueDate = input.dueDate;
  }

  if (input.docNumber) {
    billData.DocNumber = input.docNumber;
  }

  if (input.privateNote) {
    billData.PrivateNote = input.privateNote;
  }

  const response = await qbFetch<QBResponse<QBBill>>(
    `/v3/company/${realmId}/bill?minorversion=65`,
    {
      method: "POST",
      body: JSON.stringify(billData),
    }
  );

  return response.Bill;
}

/**
 * Get a bill by ID
 */
export async function getBill(billId: string): Promise<QBBill> {
  const tokens = await getValidToken();
  const realmId = tokens.realm_id;

  const response = await qbFetch<QBResponse<QBBill>>(
    `/v3/company/${realmId}/bill/${billId}?minorversion=65`
  );

  return response.Bill;
}

/**
 * Query accounts to find expense account
 */
export async function getExpenseAccounts(): Promise<
  Array<{ Id: string; Name: string; AccountType: string }>
> {
  const tokens = await getValidToken();
  const realmId = tokens.realm_id;

  const query = encodeURIComponent(
    "SELECT Id, Name, AccountType FROM Account WHERE AccountType = 'Expense' MAXRESULTS 100"
  );

  const response = await qbFetch<
    QBQueryResponse<{ Id: string; Name: string; AccountType: string }>
  >(`/v3/company/${realmId}/query?query=${query}&minorversion=65`);

  return response.QueryResponse.Account || [];
}
