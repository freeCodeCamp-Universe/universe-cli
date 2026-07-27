const ROOT_INDEX = "index.html";

const STATIC_EXPORT_HINT =
  "This looks like a framework build directory, not a static export. " +
  "Configure a static export (e.g. Next.js output: 'export', Nuxt nuxi generate, " +
  "SvelteKit adapter-static) and point platform.yaml build.output at the export " +
  "directory (e.g. out/, dist/, build/).";

export function hasRootIndex(files: readonly string[]): boolean {
  return files.includes(ROOT_INDEX);
}

export function looksLikeFrameworkBuild(files: readonly string[]): boolean {
  let hasBuildId = false;
  let hasBuildManifest = false;
  for (const f of files) {
    const p = f.replace(/\\/g, "/");
    if (p === "BUILD_ID") hasBuildId = true;
    else if (p === "build-manifest.json") hasBuildManifest = true;
    else if (p === "nitro.json") return true;
    if (
      p.startsWith("_app/immutable/") ||
      p.startsWith(".next/") ||
      p.startsWith(".nuxt/") ||
      p.startsWith(".svelte-kit/") ||
      p.startsWith(".output/")
    ) {
      return true;
    }
  }
  return hasBuildId && hasBuildManifest;
}

export function missingRootIndexMessage(
  files: readonly string[],
  outputDir: string,
): string {
  const base = `No index.html at the deploy root (${outputDir}); the site cannot be served at /.`;
  return looksLikeFrameworkBuild(files)
    ? `${base}\n\n${STATIC_EXPORT_HINT}`
    : base;
}
