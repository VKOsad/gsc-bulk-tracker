// Re-test the currently stored Topvisor connection (a cheap read-only projects call).
// Session-only. Never returns or logs the API key.

import { NextResponse } from "next/server";
import { getSessionUserId, unauthorized, badRequest, errorResponse } from "@/lib/topvisor/apiAuth";
import { testConnection, hasConnection } from "@/lib/topvisor/connection";
import { canConnectTopvisor } from "@/lib/topvisor/featureFlag";

export const runtime = "nodejs";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  if (!canConnectTopvisor()) return badRequest("TOPVISOR_ENCRYPTION_NOT_CONFIGURED");
  if (!(await hasConnection(userId))) return badRequest("TOPVISOR_NOT_CONNECTED");
  try {
    const status = await testConnection(userId);
    return NextResponse.json(status);
  } catch (err) {
    return errorResponse(err);
  }
}
