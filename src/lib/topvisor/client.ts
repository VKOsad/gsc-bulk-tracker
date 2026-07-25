// Server-only Topvisor API v2 client — a thin typed fetch wrapper.
// Every request is POST https://api.topvisor.com/v2/json/<path> with the three
// required headers. Handles: AbortController timeout, retry with exponential
// backoff + jitter for 429 / transient 5xx (never for auth/validation/balance),
// the remote `{ result, errors:[{string,detail,code}] }` envelope, and log masking.
//
// Do NOT import this into client components — it uses node timers/fetch on the server.

import {
  TopvisorError,
  fromHttpStatus,
  fromRemoteErrors,
  type RemoteError,
} from "./errors";

export const TOPVISOR_BASE_URL = "https://api.topvisor.com/v2/json";

export interface TopvisorCreds {
  apiUserId: string;
  apiKey: string;
}

export interface TopvisorRequestOptions {
  timeoutMs?: number;
  retries?: number; // additional attempts after the first, for retryable errors
  signal?: AbortSignal; // caller cancellation (composed with the timeout)
}

interface TopvisorEnvelope<T> {
  result?: T;
  errors?: RemoteError[];
  total?: number;
  nextOffset?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 3;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}

// Exponential backoff with full jitter. Base 400ms, cap ~8s.
function backoffMs(attempt: number): number {
  const base = Math.min(8_000, 400 * 2 ** attempt);
  return Math.floor(Math.random() * base);
}

// The fetch implementation is injectable so unit tests can mock it without network.
export type FetchLike = typeof fetch;

export interface TopvisorClient {
  /**
   * POST to a Topvisor path like "get/projects_2/projects" and return `result`.
   * Throws a normalized TopvisorError on any failure.
   */
  post<T = unknown>(
    path: string,
    body: Record<string, unknown>,
    opts?: TopvisorRequestOptions,
  ): Promise<T>;
  /** Same as post() but also returns pagination metadata (total / nextOffset). */
  postWithMeta<T = unknown>(
    path: string,
    body: Record<string, unknown>,
    opts?: TopvisorRequestOptions,
  ): Promise<{ result: T; total?: number; nextOffset?: number }>;
}

export function createTopvisorClient(
  creds: TopvisorCreds,
  fetchImpl: FetchLike = fetch,
): TopvisorClient {
  if (!creds.apiUserId || !creds.apiKey) {
    // Programming error — surface clearly, without echoing the (empty) key.
    throw new TopvisorError("TOPVISOR_NOT_CONNECTED", "Topvisor credentials are missing");
  }

  async function once<T>(
    path: string,
    body: Record<string, unknown>,
    timeoutMs: number,
    outerSignal?: AbortSignal,
  ): Promise<TopvisorEnvelope<T>> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const onOuterAbort = () => ac.abort();
    outerSignal?.addEventListener("abort", onOuterAbort, { once: true });

    let res: Response;
    try {
      res = await fetchImpl(`${TOPVISOR_BASE_URL}/${path}`, {
        method: "POST",
        headers: {
          "User-Id": creds.apiUserId,
          Authorization: `bearer ${creds.apiKey}`,
          "Content-type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (err) {
      if (ac.signal.aborted && !outerSignal?.aborted) {
        throw new TopvisorError("TOPVISOR_TIMEOUT", `Topvisor request timed out after ${timeoutMs}ms`, {
          retryable: true,
          cause: err,
        });
      }
      // Network/DNS/connection error — transient, safe to retry.
      throw new TopvisorError("TOPVISOR_UNAVAILABLE", "Topvisor network error", {
        retryable: true,
        cause: err,
      });
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener("abort", onOuterAbort);
    }

    if (!res.ok) {
      let text = "";
      try {
        text = await res.text();
      } catch {
        /* ignore */
      }
      throw fromHttpStatus(res.status, text);
    }

    let json: TopvisorEnvelope<T>;
    try {
      json = (await res.json()) as TopvisorEnvelope<T>;
    } catch (err) {
      throw new TopvisorError("TOPVISOR_BAD_RESPONSE", "Topvisor returned a non-JSON response", {
        cause: err,
      });
    }

    if (Array.isArray(json.errors) && json.errors.length > 0) {
      throw fromRemoteErrors(json.errors);
    }
    return json;
  }

  async function run<T>(
    path: string,
    body: Record<string, unknown>,
    opts: TopvisorRequestOptions,
  ): Promise<TopvisorEnvelope<T>> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retries = opts.retries ?? DEFAULT_RETRIES;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await once<T>(path, body, timeoutMs, opts.signal);
      } catch (err) {
        lastErr = err;
        const retryable = err instanceof TopvisorError && err.retryable;
        if (!retryable || attempt === retries || opts.signal?.aborted) break;
        await sleep(backoffMs(attempt), opts.signal);
      }
    }
    throw lastErr;
  }

  return {
    async post<T>(path, body, opts = {}) {
      const env = await run<T>(path, body, opts);
      return (env.result ?? (Array.isArray(env.result) ? [] : ({} as T))) as T;
    },
    async postWithMeta<T>(path, body, opts = {}) {
      const env = await run<T>(path, body, opts);
      return { result: env.result as T, total: env.total, nextOffset: env.nextOffset };
    },
  };
}
