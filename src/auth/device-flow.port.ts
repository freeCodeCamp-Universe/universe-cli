interface DeviceFlowPrompt {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

interface DeviceFlowOptions {
  clientId: string;
  scope?: string;
  onPrompt: (prompt: DeviceFlowPrompt) => void | Promise<void>;
}

interface DeviceFlow {
  run(options: DeviceFlowOptions): Promise<string>;
}

export type { DeviceFlow, DeviceFlowOptions, DeviceFlowPrompt };
