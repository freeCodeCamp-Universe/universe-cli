import { WoodpeckerError } from "./errors.js";
import type { CreatePipelineOptions, LogLine, Pipeline } from "./types.js";

export type FetchFn = typeof fetch;

export class WoodpeckerClient {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly fetchFn: FetchFn;

  constructor(endpoint: string, token: string, fetchFn: FetchFn = fetch) {
    this.endpoint = endpoint.replace(/\/$/, "");
    this.token = token;
    this.fetchFn = fetchFn;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  async createPipeline(
    repoId: number,
    options: CreatePipelineOptions,
  ): Promise<Pipeline> {
    const url = `${this.endpoint}/api/repos/${repoId}/pipelines`;
    const resp = await this.fetchFn(url, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch: options.branch,
        variables: options.variables ?? {},
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new WoodpeckerError(
        `Pipeline create failed: ${resp.status} ${body}`,
        resp.status,
        body,
      );
    }
    return (await resp.json()) as Pipeline;
  }

  async getPipeline(repoId: number, pipelineNumber: number): Promise<Pipeline> {
    const url = `${this.endpoint}/api/repos/${repoId}/pipelines/${pipelineNumber}`;
    const resp = await this.fetchFn(url, { headers: this.authHeaders() });
    if (!resp.ok) {
      const body = await resp.text();
      throw new WoodpeckerError(
        `Pipeline get failed: ${resp.status} ${body}`,
        resp.status,
        body,
      );
    }
    return (await resp.json()) as Pipeline;
  }

  async *streamLogs(
    repoId: number,
    pipelineNumber: number,
    stepId: number,
  ): AsyncGenerator<LogLine> {
    const url = `${this.endpoint}/api/stream/logs/${repoId}/${pipelineNumber}/${stepId}`;
    const resp = await this.fetchFn(url, { headers: this.authHeaders() });
    if (!resp.ok) {
      const body = await resp.text();
      throw new WoodpeckerError(
        `Log stream failed: ${resp.status} ${body}`,
        resp.status,
        body,
      );
    }
    if (!resp.body) return;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const frameSeparator = /\r\n\r\n|\n\n|\r\r/;
    const dataPrefix = /^data:\s?/;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });

        let match: RegExpExecArray | null;
        while ((match = frameSeparator.exec(buffer)) !== null) {
          const event = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          const data = event
            .split(/\r\n|\n|\r/)
            .filter((line) => dataPrefix.test(line))
            .map((line) => line.replace(dataPrefix, ""))
            .join("\n");
          if (data.length === 0) continue;
          try {
            yield JSON.parse(data) as LogLine;
          } catch {
            // Skip malformed frames rather than aborting the whole stream.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
