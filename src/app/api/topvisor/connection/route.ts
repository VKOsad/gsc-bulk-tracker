// Topvisor connection management. GET returns masked status; POST saves + verifies
// encrypted credentials; DELETE disconnects. Session-only (no guest/share access).
// The API key is accepted, encrypted and stored server-side — it is NEVER returned.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getSessionUserId,
  unauthorized,
  badRequest,
  errorResponse,
} from "@/lib/topvisor/apiAuth";
import {
  getConnectionStatus,
  saveConnection,
  deleteConnection,
} from "@/lib/topvisor/connection";
import { canConnectTopvisor, isRankTrackerEnabled } from "@/lib/topvisor/featureFlag";

export const runtime = "nodejs";

const SaveBody = z.object({
  apiUserId: z
    .string()
    .trim()
    .regex(/^\d+$/, "apiUserId must be numeric"),
  apiKey: z.string().trim().min(8).max(256),
});

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  if (!isRankTrackerEnabled()) {
    return NextResponse.json({ enabled: false, connected: false });
  }
  try {
    const status = await getConnectionStatus(userId);
    return NextResponse.json({
      enabled: true,
      encryptionReady: canConnectTopvisor(),
      ...status,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  if (!canConnectTopvisor()) {
    // Missing TOPVISOR_ENCRYPTION_KEY (or feature disabled) — can't store a key safely.
    return badRequest("TOPVISOR_ENCRYPTION_NOT_CONFIGURED");
  }
  const body = await req.json().catch(() => null);
  const parsed = SaveBody.safeParse(body);
  if (!parsed.success) {
    return badRequest("INVALID_CREDENTIALS", parsed.error.issues[0]?.message);
  }
  try {
    const status = await saveConnection(userId, parsed.data.apiUserId, parsed.data.apiKey);
    return NextResponse.json(status);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  try {
    await deleteConnection(userId);
    return NextResponse.json({ connected: false, status: "disconnected" });
  } catch (err) {
    return errorResponse(err);
  }
}
