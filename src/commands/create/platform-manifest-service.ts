import { stringify as stringifyYaml } from "yaml";
import type { CreateSelections } from "./prompt/prompt.port.js";

interface PlatformManifestGenerator {
  generatePlatformManifest(input: CreateSelections): string;
}

class PlatformManifestService implements PlatformManifestGenerator {
  generatePlatformManifest(input: CreateSelections): string {
    const manifest = this.buildManifest(input);
    return stringifyYaml(manifest);
  }

  private buildManifest(input: CreateSelections) {
    const manifest = {
      site: input.name,
    };
    return manifest;
  }
}

export { PlatformManifestService, PlatformManifestGenerator };
