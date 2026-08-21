const AWS_KEY_PATTERN = /(?:AKIA|ASIA|AROA|AIDA|ACCA|ANPA|ABIA|AGPA)[A-Z0-9]{12,}/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const CONTEXT_PATTERN =
  /(?:access_key_id|secret_access_key|accessKeyId|secretAccessKey|secret|password|token|key|credential|auth)\s*[=:]\s*([A-Za-z0-9/+=]{21,}|[a-f0-9]{32,})/gi;
const CREDENTIAL_KEY_PATTERN = /(?:secret|password|token|key|credential|auth)/i;
const EXACT_KEYS = new Set([
  "accesskeyid",
  "secretaccesskey",
  "access_key_id",
  "secret_access_key",
]);
const JSON_PATTERN =
  /"(?:secret|password|token|key|credential|auth|access_key_id|secret_access_key|accessKeyId|secretAccessKey)"\s*:\s*"[^"]+"/gi;
const LONG_SECRET_PATTERN = /^[A-Za-z0-9/+=]{21,}$/;
const URL_CREDENTIAL_PATTERN = /https?:\/\/[^@\s]+@/g;

function redact(value: string): string {
  return value
    .replace(URL_CREDENTIAL_PATTERN, (match) => {
      const protocolEnd = match.indexOf("://") + 3;
      return `${match.slice(0, protocolEnd)}****:****@`;
    })
    .replace(AWS_KEY_PATTERN, (match) => `${match.slice(0, 4)}****${match.slice(-4)}`)
    .replace(BEARER_PATTERN, "Bearer ****")
    .replace(JSON_PATTERN, (match) => `${match.slice(0, match.indexOf(":") + 1)}"****"`)
    .replace(CONTEXT_PATTERN, (match) => {
      const equalsIndex = match.indexOf("=");
      const colonIndex = match.indexOf(":");
      const separatorIndex =
        equalsIndex >= 0 && colonIndex >= 0
          ? Math.min(equalsIndex, colonIndex)
          : Math.max(equalsIndex, colonIndex);
      return `${match.slice(0, separatorIndex + 1)}****`;
    });
}

function redactValue(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    if (key !== undefined && EXACT_KEYS.has(key.toLowerCase())) return "****";
    const result = redact(value);
    return result === value &&
      key !== undefined &&
      CREDENTIAL_KEY_PATTERN.test(key) &&
      LONG_SECRET_PATTERN.test(value)
      ? "****"
      : result;
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item, key));
  if (value !== null && typeof value === "object") {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

function redactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactValue(item, key)]),
  );
}

export { redact, redactObject };
