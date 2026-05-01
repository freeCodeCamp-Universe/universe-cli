import { LogsError } from "../errors/cli-errors.js";
import type { LogEntry, LogsClient, LogsRequest, LogsResponse } from "./logs-client.port.js";

const SENTINEL_FAILURE_NAME = "logs-failure";

const STUB_LOG_ENTRIES: LogEntry[] = [
  { level: "info", message: "Application started", timestamp: "2026-01-01T00:00:00.000Z" },
  { level: "info", message: "Listening on port 3000", timestamp: "2026-01-01T00:00:01.000Z" },
  {
    level: "warn",
    message: "No DATABASE_URL set, using in-memory store",
    timestamp: "2026-01-01T00:00:02.000Z",
  },
];

class StubLogsClient implements LogsClient {
  getLogs(request: LogsRequest): Promise<LogsResponse> {
    const { environment, manifest } = request;

    if (manifest.name === SENTINEL_FAILURE_NAME) {
      return Promise.reject(
        new LogsError(manifest.name, "log retrieval failed (sentinel fixture)"),
      );
    }

    return Promise.resolve({
      entries: STUB_LOG_ENTRIES,
      environment,
      name: manifest.name,
    });
  }
}

export { StubLogsClient };
