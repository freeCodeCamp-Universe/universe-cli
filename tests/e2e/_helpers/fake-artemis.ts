import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Local stand-in for the artemis deploy proxy used by the E2E suite.
 *
 * Routes are added per task as the suite grows. Today: GET /api/whoami.
 * Each successive task ends adds the routes it exercises (see PLAN P0+).
 *
 * The fixture's behavior is what artemis SHOULD do per ADR-016. CI green
 * + prod broken pinpoints the server, not the CLI — that's the whole
 * point of having an in-house contract surface to assert against.
 */

export interface TokenRecord {
  login: string;
  authorizedSites: string[];
}

export interface FakeArtemisState {
  tokens: Map<string, TokenRecord>;
}

export interface CallLogEntry {
  method: string;
  path: string;
  authorization?: string;
  status: number;
}

export interface FakeArtemis {
  url: string;
  state: FakeArtemisState;
  callLog: CallLogEntry[];
  close: () => Promise<void>;
}

export async function startFakeArtemis(): Promise<FakeArtemis> {
  const state: FakeArtemisState = { tokens: new Map() };
  const callLog: CallLogEntry[] = [];

  const server: Server = createServer((req, res) => {
    handle(req, res, state, callLog);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const addr = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${addr.port}`,
    state,
    callLog,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function handle(
  req: IncomingMessage,
  res: ServerResponse,
  state: FakeArtemisState,
  callLog: CallLogEntry[],
): void {
  const method = req.method ?? "GET";
  const path = req.url ?? "";
  const authorization =
    typeof req.headers["authorization"] === "string"
      ? req.headers["authorization"]
      : undefined;

  if (method === "GET" && path === "/api/whoami") {
    const token = parseBearer(authorization);
    const record = token ? state.tokens.get(token) : undefined;
    if (!record) {
      logAndSend(callLog, method, path, authorization, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    logAndSend(callLog, method, path, authorization, res, 200, {
      login: record.login,
      authorizedSites: record.authorizedSites,
    });
    return;
  }

  logAndSend(callLog, method, path, authorization, res, 404, {
    error: { code: "not_found", message: `no route: ${method} ${path}` },
  });
}

function parseBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return undefined;
  return parts[1];
}

function logAndSend(
  callLog: CallLogEntry[],
  method: string,
  path: string,
  authorization: string | undefined,
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  callLog.push({ method, path, authorization, status });
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
