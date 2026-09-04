import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDonationConfigManager } from "../../src/lib/local-donation-config-manager.js";

let projectDirectory: string;

beforeEach(async () => {
  projectDirectory = await mkdtemp(join(tmpdir(), "universe-cli-donation-config-"));
});

afterEach(async () => {
  await rm(projectDirectory, { force: true, recursive: true });
});

describe(LocalDonationConfigManager, () => {
  it("returns false when the donation config does not exist", () => {
    const manager = new LocalDonationConfigManager();

    const result = manager.exists(projectDirectory);

    expect(result).toBe(false);
  });

  it("returns true when the donation config exists", async () => {
    const manager = new LocalDonationConfigManager();
    await writeFile(join(projectDirectory, "donation-config.json"), "{}");

    const result = manager.exists(projectDirectory);

    expect(result).toBe(true);
  });
});
