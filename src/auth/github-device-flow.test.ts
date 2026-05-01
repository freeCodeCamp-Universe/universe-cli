import { GithubDeviceFlow } from "./github-device-flow.js";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

const baseStart = {
  device_code: "dc_xxx",
  expires_in: 900,
  interval: 5,
  user_code: "ABCD-1234",
  verification_uri: "https://github.com/login/device",
};

describe(GithubDeviceFlow, () => {
  it("requests device code with client id and scope", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "ghu_secret", token_type: "bearer" }),
      );
    const flow = new GithubDeviceFlow({ fetch: fetchMock, sleep: () => Promise.resolve() });
    const onPrompt = vi.fn();

    await flow.run({ clientId: "Iv1.test", onPrompt, scope: "read:org user:email" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://github.com/login/device/code");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toStrictEqual({ client_id: "Iv1.test", scope: "read:org user:email" });
  });

  it("invokes onPrompt with user_code and verification_uri", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "ghu_secret", token_type: "bearer" }),
      );
    const onPrompt = vi.fn();
    const flow = new GithubDeviceFlow({ fetch: fetchMock, sleep: () => Promise.resolve() });

    await flow.run({ clientId: "Iv1.test", onPrompt });

    expect(onPrompt).toHaveBeenCalledWith({
      expiresIn: 900,
      userCode: "ABCD-1234",
      verificationUri: "https://github.com/login/device",
    });
  });

  it("returns access token when polling succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "ghu_secret", token_type: "bearer" }),
      );
    const flow = new GithubDeviceFlow({ fetch: fetchMock, sleep: () => Promise.resolve() });

    const tok = await flow.run({ clientId: "Iv1.test", onPrompt: vi.fn() });

    expect(tok).toBe("ghu_secret");
  });

  it("polls /login/oauth/access_token with correct grant_type body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "ghu", token_type: "bearer" }));
    const flow = new GithubDeviceFlow({ fetch: fetchMock, sleep: () => Promise.resolve() });

    await flow.run({ clientId: "Iv1.test", onPrompt: vi.fn() });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://github.com/login/oauth/access_token");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body["grant_type"]).toBe("urn:ietf:params:oauth:grant-type:device_code");
  });

  it("keeps polling on authorization_pending", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(jsonResponse(200, { error: "authorization_pending" }))
      .mockResolvedValueOnce(jsonResponse(200, { error: "authorization_pending" }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "ghu", token_type: "bearer" }));
    const flow = new GithubDeviceFlow({ fetch: fetchMock, sleep: () => Promise.resolve() });

    const tok = await flow.run({ clientId: "Iv1.test", onPrompt: vi.fn() });

    expect(tok).toBe("ghu");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("extends interval by 5 s on slow_down response", async () => {
    const sleeps: number[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { ...baseStart, interval: 5 }))
      .mockResolvedValueOnce(jsonResponse(200, { error: "slow_down" }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "ghu", token_type: "bearer" }));
    const flow = new GithubDeviceFlow({
      fetch: fetchMock,
      sleep: (ms: number) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });

    await flow.run({ clientId: "Iv1.test", onPrompt: vi.fn() });

    expect(sleeps[0]).toBe(5_000);
    expect(sleeps[1]).toBe(10_000);
  });

  it("throws on expired_token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(jsonResponse(200, { error: "expired_token" }));
    const flow = new GithubDeviceFlow({ fetch: fetchMock, sleep: () => Promise.resolve() });

    await expect(flow.run({ clientId: "Iv1.test", onPrompt: vi.fn() })).rejects.toThrow(/expired/i);
  });

  it("throws on access_denied", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(jsonResponse(200, { error: "access_denied" }));
    const flow = new GithubDeviceFlow({ fetch: fetchMock, sleep: () => Promise.resolve() });

    await expect(flow.run({ clientId: "Iv1.test", onPrompt: vi.fn() })).rejects.toThrow(/denied/i);
  });

  it("throws when device code request fails with non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(404, { error: "not_found" }));
    const flow = new GithubDeviceFlow({ fetch: fetchMock, sleep: () => Promise.resolve() });

    await expect(flow.run({ clientId: "Iv1.test", onPrompt: vi.fn() })).rejects.toThrow(
      /device code/i,
    );
  });

  it("throws on unexpected error code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(jsonResponse(200, { error: "unsupported_grant_type" }));
    const flow = new GithubDeviceFlow({ fetch: fetchMock, sleep: () => Promise.resolve() });

    await expect(flow.run({ clientId: "Iv1.test", onPrompt: vi.fn() })).rejects.toThrow(
      /unsupported_grant_type/,
    );
  });
});
