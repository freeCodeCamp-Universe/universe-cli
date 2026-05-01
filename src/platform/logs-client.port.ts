import type { PlatformManifest } from "../services/platform-manifest-service.js";

// Throws LogsError on failure.
interface LogsClient {
  getLogs(request: LogsRequest): Promise<LogsResponse>;
}

interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
}

interface LogsRequest {
  environment: string;
  manifest: PlatformManifest;
}

interface LogsResponse {
  entries: LogEntry[];
  environment: string;
  name: string;
}

export type { LogEntry, LogsClient, LogsRequest, LogsResponse };
