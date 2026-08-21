import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DonationConfigWriter } from "./donation-config-writer.port.js";

class LocalDonationConfigWriter implements DonationConfigWriter {
  async write(projectDirectory: string): Promise<void> {
    const config = { donationId: randomUUID() };
    await writeFile(
      join(projectDirectory, "donation-config.json"),
      JSON.stringify(config, null, 2) + "\n",
    );
  }
}

export { LocalDonationConfigWriter };
