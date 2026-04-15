import { execSync } from "node:child_process";
import { CredentialError } from "../errors.js";
import { redact } from "../output/redact.js";

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
