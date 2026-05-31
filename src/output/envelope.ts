interface Envelope {
  schemaVersion: string;
  command: string;
  success: boolean;
  timestamp: string;
  [key: string]: unknown;
}

interface ErrorEnvelope {
  schemaVersion: string;
  command: string;
  success: false;
  timestamp: string;
  error: {
    code: number;
    message: string;
    kind?: string;
    requestId?: string;
    issues?: string[];
  };
}

export function buildEnvelope(
  command: string,
  success: boolean,
  data?: Record<string, unknown>,
): Envelope {
  return {
    schemaVersion: "1",
    command,
    success,
    timestamp: new Date().toISOString(),
    ...data,
  };
}

export function buildErrorEnvelope(
  command: string,
  code: number,
  message: string,
  issues?: string[],
  kind?: string,
  requestId?: string,
): ErrorEnvelope {
  const error: ErrorEnvelope["error"] = {
    code,
    message,
  };
  if (kind !== undefined) {
    error.kind = kind;
  }
  if (requestId !== undefined) {
    error.requestId = requestId;
  }
  if (issues !== undefined) {
    error.issues = issues;
  }
  return {
    schemaVersion: "1",
    command,
    success: false,
    timestamp: new Date().toISOString(),
    error,
  };
}
