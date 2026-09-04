import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DonationConfigManager } from "./donation-config-manager.port.js";

class LocalDonationConfigManager implements DonationConfigManager {
  exists(projectDirectory: string): boolean {
    return existsSync(join(projectDirectory, "donation-config.json"));
  }

  async write(projectDirectory: string): Promise<void> {
    const config = { donationId: randomUUID() };
    await writeFile(
      join(projectDirectory, "donation-config.json"),
      JSON.stringify(config, null, 2) + "\n",
    );
  }
}

export { LocalDonationConfigManager };
