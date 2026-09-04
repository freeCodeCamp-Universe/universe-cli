interface DonationConfigManager {
  exists(projectDirectory: string): boolean;
  write(projectDirectory: string): Promise<void>;
}

export type { DonationConfigManager };
