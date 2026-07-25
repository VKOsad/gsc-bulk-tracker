// Shared auth + error helpers for the /api/topvisor/* routes. Every mutation route
// requires a real NextAuth session (guests / share links are never allowed to touch
// Topvisor), and errors are normalized to a stable code + HTTP status without leaking
// secrets or stack traces.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { TopvisorError, type TopvisorErrorCode } from "./errors";

export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

export function badRequest(code: string, detail?: string): NextResponse {
  return NextResponse.json({ error: code, ...(detail ? { detail } : {}) }, { status: 400 });
}

const STATUS_BY_CODE: Partial<Record<TopvisorErrorCode, number>> = {
  TOPVISOR_NOT_CONNECTED: 400,
  TOPVISOR_AUTH_FAILED: 401,
  TOPVISOR_ACCESS_RESTRICTED: 403,
  TOPVISOR_PROJECT_NOT_FOUND: 404,
  TOPVISOR_PROJECT_DUPLICATE: 409,
  TOPVISOR_REGION_NOT_CONFIGURED: 409,
  TOPVISOR_CHECK_ALREADY_RUNNING: 409,
  TOPVISOR_INSUFFICIENT_BALANCE: 402,
  TOPVISOR_RATE_LIMITED: 429,
  TOPVISOR_UNAVAILABLE: 503,
  TOPVISOR_TIMEOUT: 504,
  TOPVISOR_BAD_RESPONSE: 502,
  TOPVISOR_REMOTE_ERROR: 502,
  RANK_PROJECT_PARTIAL: 400,
  COST_LIMIT_EXCEEDED: 402,
};

/** Turn any thrown error into a safe JSON response (never leaks the API key/stack). */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof TopvisorError) {
    return NextResponse.json(err.toJSON(), { status: STATUS_BY_CODE[err.code] ?? 500 });
  }
  // Unknown/unexpected — log server-side without the payload, return a generic error.
  console.error("[topvisor] unexpected error:", err instanceof Error ? err.message : String(err));
  return NextResponse.json({ error: "TOPVISOR_REMOTE_ERROR", message: "Unexpected error" }, { status: 500 });
}
