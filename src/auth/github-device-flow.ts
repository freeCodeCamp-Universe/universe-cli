import { setTimeout as setTimeoutP } from "node:timers/promises";
import type { DeviceFlow, DeviceFlowOptions } from "./device-flow.port.js";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface AccessTokenSuccess {
  access_token: string;
  token_type: string;
  scope?: string;
}

interface AccessTokenError {
  error: string;
  error_description?: string;
}

type AccessTokenResponse = AccessTokenSuccess | AccessTokenError;

const isAccessTokenSuccess = (body: AccessTokenResponse): body is AccessTokenSuccess =>
  "access_token" in body && typeof body.access_token === "string";

interface GithubDeviceFlowOptions {
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface PollContext {
  clientId: string;
  deviceCode: string;
  fetchImpl: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;
}

const poll = async (intervalSec: number, ctx: PollContext): Promise<string> => {
  await ctx.sleep(intervalSec * 1_000);

  const pollResp = await ctx.fetchImpl(ACCESS_TOKEN_URL, {
    body: JSON.stringify({
      client_id: ctx.clientId,
      device_code: ctx.deviceCode,
      grant_type: DEVICE_CODE_GRANT,
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (pollResp.ok) {
    const body = (await pollResp.json()) as AccessTokenResponse;

    if (isAccessTokenSuccess(body)) {
      return body.access_token;
    }

    const { error, error_description: desc } = body;
    if (error === "authorization_pending") {
      return poll(intervalSec, ctx);
    }
    if (error === "slow_down") {
      return poll(intervalSec + 5, ctx);
    }
    if (error === "expired_token") {
      throw new Error("device flow expired before authorization. Run `universe login` again.");
    }
    if (error === "access_denied") {
      throw new Error("device flow access denied by user.");
    }
    throw new Error(
      desc === undefined ? `device flow error: ${error}` : `device flow error: ${error}: ${desc}`,
    );
  }
  throw new Error(`device flow poll failed: HTTP ${pollResp.status}`);
};

/**
 * GitHub OAuth device flow per
 *   https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
 *
 * The flow:
 *   1. POST /login/device/code → device_code, user_code, verification_uri, interval
 *   2. Display user_code + verification_uri to the user (via onPrompt callback)
 *   3. Poll POST /login/oauth/access_token at `interval` seconds with the
 *      `urn:ietf:params:oauth:grant-type:device_code` grant_type until either:
 *        - {access_token} arrives → success
 *        - {error: authorization_pending} → keep polling
 *        - {error: slow_down} → bump interval by 5s, keep polling
 *        - {error: expired_token | access_denied | <other>} → fail
 *
 * Network + GitHub APIs are pluggable via injection so the tests run
 * fully offline.
 */

class GithubDeviceFlow implements DeviceFlow {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts?: GithubDeviceFlowOptions) {
    this.fetchImpl = opts?.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = opts?.sleep ?? setTimeoutP;
  }

  async run(options: DeviceFlowOptions): Promise<string> {
    const startResp = await this.fetchImpl(DEVICE_CODE_URL, {
      body: JSON.stringify({
        client_id: options.clientId,
        ...(options.scope === undefined ? {} : { scope: options.scope }),
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (startResp.ok) {
      const start = (await startResp.json()) as DeviceCodeResponse;

      await options.onPrompt({
        expiresIn: start.expires_in,
        userCode: start.user_code,
        verificationUri: start.verification_uri,
      });

      const intervalSec = start.interval > 0 ? start.interval : 5;
      return poll(intervalSec, {
        clientId: options.clientId,
        deviceCode: start.device_code,
        fetchImpl: this.fetchImpl,
        sleep: this.sleep,
      });
    }
    throw new Error(`device code request failed: HTTP ${startResp.status}`);
  }
}

export { GithubDeviceFlow };
export type { GithubDeviceFlowOptions };
