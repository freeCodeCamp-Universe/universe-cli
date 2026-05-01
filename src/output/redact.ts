const AWS_KEY_PREFIX_PATTERN = /(?:AKIA|ASIA|AROA|AIDA|ACCA|ANPA|ABIA|AGPA)[A-Z0-9]{12,}/g;
const URL_CREDS_PATTERN = /https?:\/\/[^@\s]+@/g;
const CREDENTIAL_CONTEXT_PATTERN =
  /(?:access_key_id|secret_access_key|accessKeyId|secretAccessKey|secret|password|token|key|credential|auth)\s*[=:]\s*([A-Za-z0-9/+=]{21,})/gi;
const HEX_CREDENTIAL_CONTEXT_PATTERN =
  /(?:secret|password|token|key|credential|auth|access_key_id|secret_access_key)\s*[=:]\s*([a-f0-9]{32,})/gi;
const JSON_CREDENTIAL_PATTERN =
  /"(?:secret|password|token|key|credential|auth|access_key_id|secret_access_key|accessKeyId|secretAccessKey)"\s*:\s*"[^"]+"/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const CREDENTIAL_KEY_PATTERN = /(?:secret|password|token|key|credential|auth)/i;
const EXACT_CREDENTIAL_KEYS = new Set([
  "accesskeyid",
  "secretaccesskey",
  "access_key_id",
  "secret_access_key",
]);
const STANDALONE_LONG_SECRET = /^[A-Za-z0-9/+=]{21,}$/;

const maskAwsKey = (match: string): string => `${match.slice(0, 4)}****${match.slice(-4)}`;

const maskUrlCreds = (match: string): string => {
  const atIndex = match.lastIndexOf("@");
  const protocolEnd = match.indexOf("://") + 3;
  return `${match.slice(0, protocolEnd)}****:****@${match.slice(atIndex + 1)}`;
};

const redact = (value: string): string => {
  let result = value;
  result = result.replace(URL_CREDS_PATTERN, maskUrlCreds);
  result = result.replace(AWS_KEY_PREFIX_PATTERN, maskAwsKey);
  result = result.replace(BEARER_PATTERN, "Bearer ****");
  result = result.replace(JSON_CREDENTIAL_PATTERN, (match) => {
    const colonIndex = match.indexOf(":");
    return `${match.slice(0, colonIndex + 1)}"****"`;
  });
  result = result.replace(CREDENTIAL_CONTEXT_PATTERN, (_match) => {
    const eqIndex = _match.indexOf("=");
    const colonIndex = _match.indexOf(":");
    let sepIndex: number;
    if (eqIndex >= 0 && colonIndex >= 0) {
      sepIndex = Math.min(eqIndex, colonIndex);
    } else if (eqIndex >= 0) {
      sepIndex = eqIndex;
    } else {
      sepIndex = colonIndex;
    }
    return `${_match.slice(0, sepIndex + 1)}****`;
  });
  result = result.replace(HEX_CREDENTIAL_CONTEXT_PATTERN, (_match) => {
    const eqIndex = _match.indexOf("=");
    const colonIndex = _match.indexOf(":");
    let sepIndex: number;
    if (eqIndex >= 0 && colonIndex >= 0) {
      sepIndex = Math.min(eqIndex, colonIndex);
    } else if (eqIndex >= 0) {
      sepIndex = eqIndex;
    } else {
      sepIndex = colonIndex;
    }
    return `${_match.slice(0, sepIndex + 1)}****`;
  });
  return result;
};

const redactValue = (value: unknown, keyName?: string): unknown => {
  if (typeof value === "string") {
    if (keyName !== undefined && EXACT_CREDENTIAL_KEYS.has(keyName.toLowerCase())) {
      return "****";
    }
    const redacted = redact(value);
    if (
      redacted === value &&
      keyName !== undefined &&
      CREDENTIAL_KEY_PATTERN.test(keyName) &&
      STANDALONE_LONG_SECRET.test(value)
    ) {
      return "****";
    }
    return redacted;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, keyName));
  }
  if (value !== null && typeof value === "object") {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
};

const redactObject = (obj: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = redactValue(value, key);
  }
  return result;
};

export { redact, redactObject };
