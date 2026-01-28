declare module "intuit-oauth" {
  export interface OAuthClientConfig {
    clientId: string;
    clientSecret: string;
    environment: "sandbox" | "production";
    redirectUri: string;
  }

  export interface TokenData {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    x_refresh_token_expires_in: number;
    realmId: string;
  }

  export interface AuthResponse {
    getJson(): TokenData;
  }

  export interface AuthorizeUriOptions {
    scope: string[];
    state?: string;
  }

  class OAuthClient {
    constructor(config: OAuthClientConfig);
    authorizeUri(options: AuthorizeUriOptions): string;
    createToken(uri: string): Promise<AuthResponse>;
    refresh(): Promise<AuthResponse>;
    setToken(token: Partial<TokenData>): void;
    getToken(): TokenData;
  }

  export default OAuthClient;
}
