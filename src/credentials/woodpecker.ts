import { CredentialError } from "../errors.js";

export function resolveWoodpeckerToken(): string {
  const token = process.env.WOODPECKER_TOKEN?.trim();
  if (!token) {
    throw new CredentialError(
      "WOODPECKER_TOKEN not set. Create a token at " +
        "https://woodpecker.freecodecamp.net/user/tokens and export it " +
        "via direnv or your shell profile.",
    );
  }
  return token;
}
