import { parse as parseYaml } from "yaml";
import {
  platformYamlSchemaV2,
  type PlatformYamlV2,
} from "./platform-yaml.schema.js";

export type ParseResult =
  | { ok: true; value: PlatformYamlV2 }
  | { ok: false; error: string };

/**
 * v1 schema markers. Presence of any of these triggers the migration error
 * before zod runs, so staff get a friendly pointer instead of a generic
 * "unknown key" message.
 *
 *   - `r2`: removed — proxy holds R2 admin credentials.
 *   - `stack`: removed — only `static` was ever supported.
 *   - `domain`: removed — domain is derived from `site`.
 *   - `static`: removed — output dir lives under `build.output`.
 *   - `name`: replaced by `site`.
 */
const V1_MARKERS = ["r2", "stack", "domain", "static", "name"] as const;

const MIGRATION_HINT =
  "platform.yaml v1 detected. v0.4 removes credential paths (r2, bucket, region) and per-site team declarations. See docs/platform-yaml.md for the v0.3 → v0.4 migration.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function detectV1(parsed: Record<string, unknown>): string | undefined {
  for (const marker of V1_MARKERS) {
    if (Object.prototype.hasOwnProperty.call(parsed, marker)) {
      return marker;
    }
  }
  return undefined;
}

function formatZodIssues(issues: { path: PropertyKey[]; message: string }[]) {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `  - ${path}: ${issue.message}`;
    })
    .join("\n");
}

/**
 * Parse + validate a `platform.yaml` document against the v2 schema.
 *
 * Returns a tagged result rather than throwing so callers (CLI, tests,
 * Woodpecker steps) can branch without try/catch noise.
 */
export function parsePlatformYaml(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `platform.yaml is not valid YAML: ${message}` };
  }

  if (parsed === null || parsed === undefined) {
    return {
      ok: false,
      error:
        "platform.yaml is empty. Required field: `site`. See docs/platform-yaml.md.",
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      error:
        "platform.yaml must be a YAML mapping at the root. See docs/platform-yaml.md.",
    };
  }

  const v1Marker = detectV1(parsed);
  if (v1Marker) {
    return {
      ok: false,
      error: `${MIGRATION_HINT} (v1 marker detected: \`${v1Marker}\`)`,
    };
  }

  const result = platformYamlSchemaV2.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: `platform.yaml is invalid:\n${formatZodIssues(result.error.issues)}\nSee docs/platform-yaml.md.`,
    };
  }

  return { ok: true, value: result.data };
}

export type { PlatformYamlV2 } from "./platform-yaml.schema.js";
