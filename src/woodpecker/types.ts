export type PipelineStatus =
  | "pending"
  | "running"
  | "success"
  | "failure"
  | "killed"
  | "error"
  | "blocked"
  | "declined";

export interface Pipeline {
  number: number;
  status: PipelineStatus;
  created: number;
  started?: number;
  finished?: number;
  commit: string;
  branch: string;
  variables?: Record<string, string>;
}

export interface LogLine {
  ts: number;
  message: string;
  pos?: number;
  proc?: string;
}

export interface CreatePipelineOptions {
  branch: string;
  variables?: Record<string, string>;
}
