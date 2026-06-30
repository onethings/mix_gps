export class ApiError extends Error {
  status: number;
  body?: unknown;
  raw?: string;
  needsTotp?: boolean;

  constructor(message: string, opts?: { status?: number; body?: unknown; raw?: string; needsTotp?: boolean }) {
    super(message);
    this.name = 'ApiError';
    this.status = opts?.status ?? 0;
    this.body = opts?.body;
    this.raw = opts?.raw;
    this.needsTotp = opts?.needsTotp;
  }
}
