import type { TokenStore } from "./token-store.port.js";

class StubTokenStore implements TokenStore {
  private token: string | null = null;

  saveToken(token: string): Promise<void> {
    if (token.trim().length === 0) {
      return Promise.reject(new Error("refusing to save empty token"));
    }
    this.token = token;
    return Promise.resolve();
  }

  loadToken(): Promise<string | null> {
    return Promise.resolve(this.token);
  }

  deleteToken(): Promise<void> {
    this.token = null;
    return Promise.resolve();
  }
}

export { StubTokenStore };
