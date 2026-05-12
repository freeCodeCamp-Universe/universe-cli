import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Local stand-in for github.com endpoints used by the device flow.
 *
 * Routes:
 *   POST /login/device/code           — returns device_code + user_code + …
 *   POST /login/oauth/access_token    — first poll: authorization_pending,
 *                                       subsequent polls: { access_token }
 *
 * The polling state machine lets a single login E2E exercise the
 * "wait once, then succeed" path without timing dependencies.
 */

export interface FakeGithubState {
  /** Issued by /login/device/code on every call. */
  deviceCode: string;
  userCode: string;
  /** Returned to the caller once polling resolves. */
  accessToken: string;
  /** How many polls to return `authorization_pending` before success. */
  pendingPolls: number;
  /** Set by the fixture as polls arrive. */
  pollCount: number;
}

export interface FakeGithub {
  url: string;
  state: FakeGithubState;
  /** Wrap a fetch to redirect github.com → this fixture. */
  rewriteFetch: (impl?: typeof globalThis.fetch) => typeof globalThis.fetch;
  close: () => Promise<void>;
}

export async function startFakeGithub(): Promise<FakeGithub> {
  const state: FakeGithubState = {
    deviceCode: "dev_code_test",
    userCode: "ABCD-1234",
    accessToken: "ghp_fake_github_token",
    pendingPolls: 1,
    pollCount: 0,
  };

  const server: Server = createServer((req, res) => {
    void handle(req, res, state);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const addr = server.address() as AddressInfo;
  let closed = false;
  const url = `http://127.0.0.1:${addr.port}`;

  const rewriteFetch: FakeGithub["rewriteFetch"] = (impl) => {
    const base = impl ?? globalThis.fetch.bind(globalThis);
    return (async (input, init) => {
      const target =
        typeof input === "string" || input instanceof URL
          ? String(input)
          : input.url;
      if (target === "https://github.com/login/device/code") {
        return base(`${url}/login/device/code`, init);
      }
      if (target === "https://github.com/login/oauth/access_token") {
        return base(`${url}/login/oauth/access_token`, init);
      }
      return base(input, init);
    }) as typeof globalThis.fetch;
  };

  return {
    url,
    state,
    rewriteFetch,
    close: () => {
      if (closed) return Promise.resolve();
      closed = true;
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  state: FakeGithubState,
): Promise<void> {
  const method = req.method ?? "GET";
  const path = req.url ?? "";
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (method === "POST" && path === "/login/device/code") {
    return jsonResp(res, 200, {
      device_code: state.deviceCode,
      user_code: state.userCode,
      verification_uri: "https://github.com/login/device",
      expires_in: 900,
      interval: 1,
    });
  }

  if (method === "POST" && path === "/login/oauth/access_token") {
    state.pollCount += 1;
    if (state.pollCount <= state.pendingPolls) {
      return jsonResp(res, 200, { error: "authorization_pending" });
    }
    return jsonResp(res, 200, {
      access_token: state.accessToken,
      token_type: "bearer",
    });
  }

  jsonResp(res, 404, {
    error: "not_found",
    error_description: `no route: ${method} ${path}`,
  });
}

function jsonResp(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
