import { StubDeviceFlow } from "./stub-device-flow.js";

describe(StubDeviceFlow, () => {
  it("run() resolves with the configured token", async () => {
    const flow = new StubDeviceFlow("test-token");
    const tok = await flow.run({ clientId: "x", onPrompt: vi.fn() });
    expect(tok).toBe("test-token");
  });

  it("run() resolves with stub-token by default", async () => {
    const flow = new StubDeviceFlow();
    const tok = await flow.run({ clientId: "x", onPrompt: vi.fn() });
    expect(tok).toBe("stub-token");
  });

  it("calls onPrompt with dummy values before resolving", async () => {
    const flow = new StubDeviceFlow();
    const onPrompt = vi.fn();
    await flow.run({ clientId: "x", onPrompt });
    expect(onPrompt).toHaveBeenCalledOnce();
    const [prompt] = onPrompt.mock.calls[0] as [
      { userCode: string; verificationUri: string; expiresIn: number },
    ];
    expect(prompt.userCode).toBeDefined();
    expect(prompt.verificationUri).toBeDefined();
    expect(prompt.expiresIn).toBeGreaterThan(0);
  });
});
