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

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export interface DeviceFlowPrompt {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

export interface RunDeviceFlowOptions {
  clientId: string;
  scope?: string;
  onPrompt: (prompt: DeviceFlowPrompt) => void | Promise<void>;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
}

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

function isAccessTokenSuccess(
  body: AccessTokenResponse,
): body is AccessTokenSuccess {
  return "access_token" in body && typeof body.access_token === "string";
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function runDeviceFlow(
  opts: RunDeviceFlowOptions,
): Promise<string> {
  const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = opts.sleep ?? defaultSleep;

  // Step 1 — request device code.
  const startResp = await fetchImpl(DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: opts.clientId,
      ...(opts.scope ? { scope: opts.scope } : {}),
    }),
  });
  if (!startResp.ok) {
    throw new Error(`device code request failed: HTTP ${startResp.status}`);
  }
  const start = (await startResp.json()) as DeviceCodeResponse;

  await opts.onPrompt({
    userCode: start.user_code,
    verificationUri: start.verification_uri,
    expiresIn: start.expires_in,
  });

  // Step 2/3 — poll for access token.
  let intervalSec = start.interval > 0 ? start.interval : 5;

  // Loop until terminal state. Bounded by the server's expires_in via
  // expired_token error response.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await sleep(intervalSec * 1_000);

    const pollResp = await fetchImpl(ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: opts.clientId,
        device_code: start.device_code,
        grant_type: DEVICE_CODE_GRANT,
      }),
    });
    if (!pollResp.ok) {
      throw new Error(`device flow poll failed: HTTP ${pollResp.status}`);
    }
    const body = (await pollResp.json()) as AccessTokenResponse;

    if (isAccessTokenSuccess(body)) {
      return body.access_token;
    }

    switch (body.error) {
      case "authorization_pending":
        continue;
      case "slow_down":
        intervalSec += 5;
        continue;
      case "expired_token":
        throw new Error(
          "device flow expired before authorization. Run `universe login` again.",
        );
      case "access_denied":
        throw new Error("device flow access denied by user.");
      default:
        throw new Error(
          body.error_description
            ? `device flow error: ${body.error}: ${body.error_description}`
            : `device flow error: ${body.error}`,
        );
    }
  }
}
