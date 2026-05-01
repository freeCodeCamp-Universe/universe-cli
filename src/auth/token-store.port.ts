interface TokenStore {
  saveToken(token: string): Promise<void>;
  loadToken(): Promise<string | null>;
  deleteToken(): Promise<void>;
}

export type { TokenStore };
