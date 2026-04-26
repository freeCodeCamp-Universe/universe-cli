/**
 * Minimal gitignore-style filter for CLI-side upload exclusion.
 *
 * Supports the patterns we ship by default in `platform.yaml` v2 plus
 * common user additions:
 *
 *   *.map                  — extension glob, matches at any depth
 *   .env*                  — prefix glob, matches at any depth
 *   node_modules/**        — directory tree exclusion
 *   src/secret.txt         — literal path, anchored at output root
 *   fil?.txt               — single-char wildcard
 *
 * Semantics summary:
 *
 *   - Patterns containing `/` are anchored at the upload root.
 *   - Patterns without `/` match the basename of any file.
 *   - `*` matches anything except `/`.
 *   - `**` matches anything including `/`.
 *   - `?` matches a single non-`/` character.
 *   - Backslash separators in input paths are normalized to `/` so the
 *     filter works the same on Windows shells. Pattern matching itself
 *     stays case-sensitive (Unix semantics).
 *
 * No negation (`!`), no per-directory `.gitignore` files, no
 * directory-only suffixes (`/`). If we ever need those, swap in
 * `picomatch` — keep the public API the same.
 */

const SPECIAL = /[.+^${}()|[\]\\]/g;

function globToRegexBody(pattern: string): string {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i] ?? "";
    if (ch === "*") {
      const next = pattern[i + 1];
      if (next === "*") {
        out += ".*";
        i += 2;
        continue;
      }
      out += "[^/]*";
      i += 1;
      continue;
    }
    if (ch === "?") {
      out += "[^/]";
      i += 1;
      continue;
    }
    out += ch.replace(SPECIAL, "\\$&");
    i += 1;
  }
  return out;
}

interface CompiledPattern {
  test: (relPath: string) => boolean;
}

function compilePattern(pattern: string): CompiledPattern {
  const anchored = pattern.includes("/");
  const body = globToRegexBody(pattern);
  if (anchored) {
    const re = new RegExp(`^${body}$`);
    return { test: (rel) => re.test(rel) };
  }
  // Basename-only match: pattern fires for any path whose final
  // segment matches.
  const re = new RegExp(`^${body}$`);
  return {
    test: (rel) => {
      const idx = rel.lastIndexOf("/");
      const base = idx === -1 ? rel : rel.slice(idx + 1);
      return re.test(base);
    },
  };
}

function normalize(rel: string): string {
  let out = rel.replace(/\\/g, "/");
  if (out.startsWith("./")) out = out.slice(2);
  return out;
}

export function createIgnoreFilter(
  patterns: readonly string[],
): (relPath: string) => boolean {
  const compiled = patterns.filter((p) => p.length > 0).map(compilePattern);
  return (relPath: string) => {
    const norm = normalize(relPath);
    for (const c of compiled) {
      if (c.test(norm)) return true;
    }
    return false;
  };
}
