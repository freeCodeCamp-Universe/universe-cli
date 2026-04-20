export class WoodpeckerError extends Error {
  readonly status: number | undefined;
  readonly body: string | undefined;

  constructor(message: string, status?: number, body?: string) {
    super(message);
    this.name = "WoodpeckerError";
    this.status = status;
    this.body = body;
  }
}
