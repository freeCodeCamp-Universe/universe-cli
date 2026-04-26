import { describe, expect, it, vi } from "vitest";
import { runDeviceFlow } from "../../src/lib/device-flow.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const baseStart = {
  device_code: "dc_xxx",
  user_code: "ABCD-1234",
  verification_uri: "https://github.com/login/device",
  expires_in: 900,
  interval: 5,
};

describe("runDeviceFlow", () => {
  it("requests device code with client id + scope", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "ghu_secret", token_type: "bearer" }),
      );
    const onPrompt = vi.fn();

    await runDeviceFlow({
      clientId: "Iv1.test",
      scope: "read:org user:email",
      fetch: fetchMock,
      sleep: () => Promise.resolve(),
      onPrompt,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://github.com/login/device/code");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Accept"]).toBe("application/json");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      client_id: "Iv1.test",
      scope: "read:org user:email",
    });
  });

  it("invokes onPrompt with user_code + verification_uri", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "ghu_secret", token_type: "bearer" }),
      );
    const onPrompt = vi.fn();

    await runDeviceFlow({
      clientId: "Iv1.test",
      fetch: fetchMock,
      sleep: () => Promise.resolve(),
      onPrompt,
    });

    expect(onPrompt).toHaveBeenCalledWith({
      userCode: "ABCD-1234",
      verificationUri: "https://github.com/login/device",
      expiresIn: 900,
    });
  });

  it("returns access token when polling succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "ghu_secret", token_type: "bearer" }),
      );

    const tok = await runDeviceFlow({
      clientId: "Iv1.test",
      fetch: fetchMock,
      sleep: () => Promise.resolve(),
      onPrompt: vi.fn(),
    });

    expect(tok).toBe("ghu_secret");
  });

  it("polls /login/oauth/access_token with grant_type", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "ghu", token_type: "bearer" }),
      );

    await runDeviceFlow({
      clientId: "Iv1.test",
      fetch: fetchMock,
      sleep: () => Promise.resolve(),
      onPrompt: vi.fn(),
    });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://github.com/login/oauth/access_token");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      client_id: "Iv1.test",
      device_code: "dc_xxx",
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
  });

  it("keeps polling on authorization_pending", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(
        jsonResponse(200, { error: "authorization_pending" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { error: "authorization_pending" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "ghu", token_type: "bearer" }),
      );

    const tok = await runDeviceFlow({
      clientId: "Iv1.test",
      fetch: fetchMock,
      sleep: () => Promise.resolve(),
      onPrompt: vi.fn(),
    });

    expect(tok).toBe("ghu");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("extends interval by 5s on slow_down response", async () => {
    const sleeps: number[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { ...baseStart, interval: 5 }))
      .mockResolvedValueOnce(jsonResponse(200, { error: "slow_down" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "ghu", token_type: "bearer" }),
      );

    await runDeviceFlow({
      clientId: "Iv1.test",
      fetch: fetchMock,
      sleep: (ms: number) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      onPrompt: vi.fn(),
    });

    // First sleep is the initial interval (5s = 5000ms).
    // After slow_down, interval bumps by 5s → 10000ms.
    expect(sleeps[0]).toBe(5_000);
    expect(sleeps[1]).toBe(10_000);
  });

  it("throws on expired_token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(jsonResponse(200, { error: "expired_token" }));

    await expect(
      runDeviceFlow({
        clientId: "Iv1.test",
        fetch: fetchMock,
        sleep: () => Promise.resolve(),
        onPrompt: vi.fn(),
      }),
    ).rejects.toThrow(/expired/i);
  });

  it("throws on access_denied", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(jsonResponse(200, { error: "access_denied" }));

    await expect(
      runDeviceFlow({
        clientId: "Iv1.test",
        fetch: fetchMock,
        sleep: () => Promise.resolve(),
        onPrompt: vi.fn(),
      }),
    ).rejects.toThrow(/denied/i);
  });

  it("throws when device code request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(404, { error: "not_found" }));

    await expect(
      runDeviceFlow({
        clientId: "Iv1.test",
        fetch: fetchMock,
        sleep: () => Promise.resolve(),
        onPrompt: vi.fn(),
      }),
    ).rejects.toThrow(/device code/i);
  });

  it("throws on unexpected error code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, baseStart))
      .mockResolvedValueOnce(
        jsonResponse(200, { error: "unsupported_grant_type" }),
      );

    await expect(
      runDeviceFlow({
        clientId: "Iv1.test",
        fetch: fetchMock,
        sleep: () => Promise.resolve(),
        onPrompt: vi.fn(),
      }),
    ).rejects.toThrow(/unsupported_grant_type/);
  });
});
