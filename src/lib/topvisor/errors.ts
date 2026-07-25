// Normalized Topvisor error model. Every failure from the client is turned into a
// TopvisorError with a stable app-level `code` (surfaced to the UI/i18n) so callers
// never have to parse raw HTTP statuses or the remote `errors[]` envelope themselves.

export type TopvisorErrorCode =
  | "TOPVISOR_NOT_CONNECTED"
  | "TOPVISOR_AUTH_FAILED"
  | "TOPVISOR_ACCESS_RESTRICTED"
  | "TOPVISOR_PROJECT_NOT_FOUND"
  | "TOPVISOR_PROJECT_DUPLICATE"
  | "TOPVISOR_REGION_NOT_CONFIGURED"
  | "TOPVISOR_INSUFFICIENT_BALANCE"
  | "TOPVISOR_CHECK_ALREADY_RUNNING"
  | "TOPVISOR_RATE_LIMITED"
  | "TOPVISOR_UNAVAILABLE"
  | "TOPVISOR_TIMEOUT"
  | "TOPVISOR_BAD_RESPONSE"
  | "TOPVISOR_REMOTE_ERROR"
  | "RANK_PROJECT_PARTIAL"
  | "COST_LIMIT_EXCEEDED";

export interface RemoteError {
  string?: string;
  detail?: string;
  code?: string | number;
}

export class TopvisorError extends Error {
  readonly code: TopvisorErrorCode;
  readonly httpStatus?: number;
  readonly remoteCode?: string | number;
  readonly detail?: string;
  readonly retryable: boolean;

  constructor(
    code: TopvisorErrorCode,
    message: string,
    opts: {
      httpStatus?: number;
      remoteCode?: string | number;
      detail?: string;
      retryable?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "TopvisorError";
    this.code = code;
    this.httpStatus = opts.httpStatus;
    this.remoteCode = opts.remoteCode;
    this.detail = opts.detail;
    this.retryable = opts.retryable ?? false;
    if (opts.cause) (this as { cause?: unknown }).cause = opts.cause;
  }

  /** Safe JSON for API responses — never leaks secrets or stack traces. */
  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }
}

/** Map an HTTP status (no JSON body, or a transport-level failure) to a TopvisorError. */
export function fromHttpStatus(status: number, bodyText?: string): TopvisorError {
  if (status === 401 || status === 403) {
    return new TopvisorError("TOPVISOR_AUTH_FAILED", "Topvisor authentication failed", {
      httpStatus: status,
    });
  }
  if (status === 429) {
    return new TopvisorError("TOPVISOR_RATE_LIMITED", "Topvisor rate limit (concurrent requests) exceeded", {
      httpStatus: status,
      retryable: true,
    });
  }
  if (status >= 500) {
    return new TopvisorError("TOPVISOR_UNAVAILABLE", `Topvisor server error (${status})`, {
      httpStatus: status,
      retryable: true,
    });
  }
  return new TopvisorError("TOPVISOR_REMOTE_ERROR", `Topvisor HTTP ${status}`, {
    httpStatus: status,
    detail: bodyText?.slice(0, 200),
  });
}

/**
 * Map the remote JSON error envelope `{ errors: [{ string, detail, code }] }` to a
 * TopvisorError. Codes per official docs: 53 auth, 54 access, 429 concurrency,
 * 503 unavailable, 1xxx/2xxx request/field errors, 10001 internal.
 */
export function fromRemoteErrors(errors: RemoteError[]): TopvisorError {
  const first = errors[0] ?? {};
  const code = String(first.code ?? "");
  const msg = first.string || "Topvisor returned an error";
  const detail = first.detail;
  const lower = `${first.string ?? ""} ${first.detail ?? ""}`.toLowerCase();

  if (code === "53") {
    return new TopvisorError("TOPVISOR_AUTH_FAILED", msg, { remoteCode: code, detail });
  }
  if (code === "54") {
    return new TopvisorError("TOPVISOR_ACCESS_RESTRICTED", msg, { remoteCode: code, detail });
  }
  if (code === "429") {
    return new TopvisorError("TOPVISOR_RATE_LIMITED", msg, { remoteCode: code, detail, retryable: true });
  }
  if (code === "503") {
    return new TopvisorError("TOPVISOR_UNAVAILABLE", msg, { remoteCode: code, detail, retryable: true });
  }
  // No dedicated balance code is published — detect it heuristically from the message.
  if (/balance|insufficient|недостаточно|средств|баланс/.test(lower)) {
    return new TopvisorError("TOPVISOR_INSUFFICIENT_BALANCE", msg, { remoteCode: code, detail });
  }
  return new TopvisorError("TOPVISOR_REMOTE_ERROR", msg, { remoteCode: code, detail });
}
