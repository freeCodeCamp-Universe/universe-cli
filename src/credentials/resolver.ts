import { execSync } from "node:child_process";
import { CredentialError } from "../errors.js";
import { redact } from "../output/redact.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function validateEndpoint(endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new CredentialError(`S3_ENDPOINT is not a valid URL: ${endpoint}`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new CredentialError(
      "S3_ENDPOINT must not contain credentials in the URL (user:pass@host). Use S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY instead.",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new CredentialError(
      `S3_ENDPOINT must use http or https, got: ${url.protocol}`,
    );
  }
  if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
    throw new CredentialError(
      `S3_ENDPOINT must use https for non-localhost hosts. Plaintext http is only allowed for localhost/127.0.0.1. Got: ${endpoint}`,
    );
  }
}

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region?: string;
}

export interface ResolveCredentialsOptions {
  remoteName: string;
}

function tryEnvCredentials(): S3Credentials | "none" | "partial" {
  const key = process.env.S3_ACCESS_KEY_ID;
  const secret = process.env.S3_SECRET_ACCESS_KEY;
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;

  const present = [key, secret, endpoint].filter(Boolean);

  if (present.length === 0) return "none";
  if (present.length < 3) return "partial";

  validateEndpoint(endpoint!);

  const creds: S3Credentials = {
    accessKeyId: key!,
    secretAccessKey: secret!,
    endpoint: endpoint!,
  };
  if (region) creds.region = region;
  return creds;
}

function fromRclone(remoteName: string): S3Credentials {
  let output: Buffer;
  try {
    output = execSync("rclone config dump", { stdio: "pipe" }) as Buffer;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new CredentialError(
        "rclone not found — install rclone or provide S3 credentials via environment variables",
      );
    }
    throw new CredentialError(
      `Failed to run rclone config dump: ${redact(err instanceof Error ? err.message : "unknown error")}`,
    );
  }

  let parsed: Record<string, Record<string, string>>;
  try {
    parsed = JSON.parse(output.toString("utf-8")) as Record<
      string,
      Record<string, string>
    >;
  } catch {
    throw new CredentialError(
      `Failed to parse rclone config for remote ${remoteName}`,
    );
  }
  output = null as unknown as Buffer;

  const remote = parsed[remoteName];
  if (!remote) {
    throw new CredentialError(
      `Remote "${remoteName}" not found in rclone config. Available remotes: ${Object.keys(parsed).join(", ") || "(none)"}`,
    );
  }

  const missing: string[] = [];
  if (!remote.access_key_id) missing.push("access_key_id");
  if (!remote.secret_access_key) missing.push("secret_access_key");
  if (!remote.endpoint) missing.push("endpoint");

  if (missing.length > 0) {
    throw new CredentialError(
      `Rclone remote "${remoteName}" is missing required fields: ${missing.join(", ")}`,
    );
  }

  const creds: S3Credentials = {
    accessKeyId: remote.access_key_id,
    secretAccessKey: remote.secret_access_key,
    endpoint: remote.endpoint,
  };
  if (remote.region) creds.region = remote.region;
  return creds;
}

export function resolveCredentials(
  options: ResolveCredentialsOptions,
): S3Credentials {
  const envResult = tryEnvCredentials();

  if (envResult === "partial") {
    throw new CredentialError(
      "Partial S3 credentials in environment. Set all three: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT — or remove all to use rclone fallback.",
    );
  }

  if (envResult !== "none") {
    return envResult;
  }

  return fromRclone(options.remoteName);
}
