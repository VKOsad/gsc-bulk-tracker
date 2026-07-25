// GET /api/topvisor/projects/[siteId]/candidates
// Existing Topvisor projects whose domain matches this site (link-vs-create step).

import { NextResponse } from "next/server";
import { getSessionUserId, unauthorized, errorResponse } from "@/lib/topvisor/apiAuth";
import { getCandidates } from "@/lib/topvisor/projectSetup";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { siteId } = await params;
  try {
    const candidates = await getCandidates(userId, siteId);
    return NextResponse.json({ candidates });
  } catch (err) {
    return errorResponse(err);
  }
}
