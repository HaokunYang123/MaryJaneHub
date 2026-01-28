import OAuthClient from "intuit-oauth";
import { getQBConfig, QB_SCOPES } from "./config";

/**
 * Token data returned from QuickBooks OAuth
 */
export interface QBTokens {
  access_token: string;
  refresh_token: string;
  realm_id: string;
  expires_at: string; // ISO timestamp
}

/**
 * Initialize the Intuit OAuth client
 */
export function initOAuthClient(): OAuthClient {
  const config = getQBConfig();

  return new OAuthClient({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    environment: config.environment,
    redirectUri: config.redirectUri,
  });
}

/**
 * Generate the authorization URL for user to connect their QuickBooks account
 *
 * @returns Object with authorization URL and state for CSRF protection
 */
export function getAuthorizationUrl(): { url: string; state: string } {
  const oauthClient = initOAuthClient();

  // Generate a random state for CSRF protection
  const state = generateRandomState();

  const authUri = oauthClient.authorizeUri({
    scope: QB_SCOPES as unknown as string[],
    state,
  });

  return {
    url: authUri,
    state,
  };
}

/**
 * Exchange authorization code for access and refresh tokens
 *
 * @param url - The full callback URL with code and realmId parameters
 * @returns Token data including access_token, refresh_token, realm_id, and expiry
 */
export async function exchangeCodeForTokens(url: string): Promise<QBTokens> {
  const oauthClient = initOAuthClient();

  try {
    const authResponse = await oauthClient.createToken(url);
    const token = authResponse.getJson();

    // Calculate expiry timestamp
    const expiresIn = token.expires_in || 3600; // Default 1 hour
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      realm_id: token.realmId,
      expires_at: expiresAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to exchange code for tokens: ${errorMessage}`);
  }
}

/**
 * Refresh an expired access token using the refresh token
 *
 * @param refreshToken - The refresh token from previous authorization
 * @returns New token data with refreshed access_token
 */
export async function refreshTokens(refreshToken: string): Promise<QBTokens> {
  const oauthClient = initOAuthClient();

  try {
    // Set the refresh token on the client
    oauthClient.setToken({
      refresh_token: refreshToken,
      access_token: "", // Will be refreshed
      token_type: "bearer",
      expires_in: 0,
      x_refresh_token_expires_in: 0,
      realmId: "",
    });

    const authResponse = await oauthClient.refresh();
    const token = authResponse.getJson();

    // Calculate expiry timestamp
    const expiresIn = token.expires_in || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      realm_id: token.realmId,
      expires_at: expiresAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to refresh tokens: ${errorMessage}`);
  }
}

/**
 * Check if tokens are expired or about to expire (within 5 minutes)
 */
export function isTokenExpired(expiresAt: string): boolean {
  const expiryTime = new Date(expiresAt).getTime();
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
  return Date.now() >= expiryTime - bufferTime;
}

/**
 * Generate a random state string for CSRF protection
 */
function generateRandomState(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let state = "";
  for (let i = 0; i < 32; i++) {
    state += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return state;
}
