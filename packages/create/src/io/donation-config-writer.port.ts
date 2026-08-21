interface DonationConfigWriter {
  write(projectDirectory: string): Promise<void>;
}

export type { DonationConfigWriter };
