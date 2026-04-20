export const SITE_NAME_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
export const SITE_NAME_MAX_LENGTH = 50;

export function validateSiteName(name: string): void {
  if (name.length === 0 || name.length > SITE_NAME_MAX_LENGTH) {
    throw new Error(
      `Site name must be 1-${SITE_NAME_MAX_LENGTH} chars, got ${name.length}`,
    );
  }
  if (!SITE_NAME_REGEX.test(name)) {
    throw new Error(
      `Site name must match ${SITE_NAME_REGEX}. ` +
        `Lowercase alphanumeric plus hyphen; no leading/trailing hyphen.`,
    );
  }
  if (name.includes("--")) {
    throw new Error(
      `Site name must not contain "--" (reserved for preview routing).`,
    );
  }
  if (name.startsWith("preview-") || name.endsWith("-preview")) {
    console.warn(
      `Site name "${name}" contains "preview" in a position that may be ` +
        `confusing with preview routing. Consider renaming.`,
    );
  }
}
