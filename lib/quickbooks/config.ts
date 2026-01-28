/**
 * QuickBooks Online OAuth 2.0 Configuration
 */

export type QBEnvironment = "sandbox" | "production";

export interface QBConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: QBEnvironment;
}

/**
 * Get QuickBooks configuration from environment variables
 */
export function getQBConfig(): QBConfig {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  const redirectUri = process.env.QB_REDIRECT_URI;
  const environment = (process.env.QB_ENVIRONMENT || "sandbox") as QBEnvironment;

  if (!clientId) {
    throw new Error("QB_CLIENT_ID environment variable is required");
  }
  if (!clientSecret) {
    throw new Error("QB_CLIENT_SECRET environment variable is required");
  }
  if (!redirectUri) {
    throw new Error("QB_REDIRECT_URI environment variable is required");
  }

  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("QB_ENVIRONMENT must be 'sandbox' or 'production'");
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    environment,
  };
}

/**
 * QuickBooks API base URLs
 */
export const QB_API_BASE_URL = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
} as const;

/**
 * OAuth scopes for QuickBooks
 */
export const QB_SCOPES = [
  "com.intuit.quickbooks.accounting",
] as const;
