import { stringify as stringifyYaml } from "yaml";
import type { CreateSelections } from "./prompt/prompt.port.js";

import { RUNTIME_OPTIONS } from "./layer-composition/schemas/layers.js";

interface PlatformManifestGenerator {
  generatePlatformManifest(input: CreateSelections): string;
}

class PlatformManifestService implements PlatformManifestGenerator {
  generatePlatformManifest(input: CreateSelections): string {
    const manifest = this.buildManifest(input);
    return stringifyYaml(manifest);
  }

  private buildManifest(input: CreateSelections) {
    if (input.runtime === RUNTIME_OPTIONS.STATIC_WEB) {
      const manifest = {
        site: input.name,
      };
      return manifest;
    }

    const manifest = {
      site: input.name,
    };
    return manifest;
  }
}

export { PlatformManifestService, PlatformManifestGenerator };
