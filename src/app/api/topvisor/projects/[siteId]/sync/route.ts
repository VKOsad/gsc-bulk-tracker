// POST /api/topvisor/projects/[siteId]/sync — pull the latest positions from Topvisor
// into the local cache (free, read-only). Does NOT launch a paid check.

import { NextResponse } from "next/server";
import { getSessionUserId, unauthorized, badRequest, errorResponse } from "@/lib/topvisor/apiAuth";
import { getOwnedSite, getBinding } from "@/lib/topvisor/projectAccess";
import { syncProjectResults } from "@/lib/topvisor/rankJobs";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { siteId } = await params;
  const site = await getOwnedSite(userId, siteId);
  if (!site) return badRequest("TOPVISOR_PROJECT_NOT_FOUND");
  const binding = await getBinding(siteId);
  if (!binding?.externalProjectId) return badRequest("RANK_PROJECT_PARTIAL");

  try {
    await prisma.rankProject.update({ where: { id: binding.id }, data: { status: "syncing" } });
    const stats = await syncProjectResults(userId, binding.id, 90);
    await prisma.rankProject.update({ where: { id: binding.id }, data: { status: "active", lastError: null } });
    return NextResponse.json(stats);
  } catch (err) {
    await prisma.rankProject.update({ where: { id: binding.id }, data: { status: "active" } }).catch(() => {});
    return errorResponse(err);
  }
}
