import type { DeviceFlow, DeviceFlowOptions } from "./device-flow.port.js";

class StubDeviceFlow implements DeviceFlow {
  private readonly token: string;

  constructor(token = "stub-token") {
    this.token = token;
  }

  async run(options: DeviceFlowOptions): Promise<string> {
    await options.onPrompt({
      expiresIn: 900,
      userCode: "STUB-CODE",
      verificationUri: "https://github.com/login/device",
    });
    return this.token;
  }
}

export { StubDeviceFlow };
