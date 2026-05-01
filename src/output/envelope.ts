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
    issues?: string[];
  };
}

const buildEnvelope = (
  command: string,
  success: boolean,
  data?: Record<string, unknown>,
): Envelope => ({
  command,
  schemaVersion: "1",
  success,
  timestamp: new Date().toISOString(),
  ...data,
});

const buildErrorEnvelope = (
  command: string,
  code: number,
  message: string,
  issues?: string[],
): ErrorEnvelope => {
  const error: { code: number; message: string; issues?: string[] } = { code, message };
  if (issues !== undefined) {
    error.issues = issues;
  }
  return {
    command,
    error,
    schemaVersion: "1",
    success: false,
    timestamp: new Date().toISOString(),
  };
};

export { buildEnvelope, buildErrorEnvelope };
