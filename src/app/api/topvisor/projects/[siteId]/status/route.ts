// GET /api/topvisor/projects/[siteId]/status — binding status, latest job, counts.

import { NextResponse } from "next/server";
import { getSessionUserId, unauthorized } from "@/lib/topvisor/apiAuth";
import { getOwnedSite, getBinding } from "@/lib/topvisor/projectAccess";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { siteId } = await params;
  const site = await getOwnedSite(userId, siteId);
  if (!site) return NextResponse.json({ error: "TOPVISOR_PROJECT_NOT_FOUND" }, { status: 404 });

  const binding = await getBinding(siteId);
  if (!binding) return NextResponse.json({ configured: false, status: "unconfigured" });

  const [keywordCount, latestJob] = await Promise.all([
    prisma.trackedKeyword.count({ where: { rankProjectId: binding.id, active: true } }),
    prisma.rankJob.findFirst({
      where: { rankProjectId: binding.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, status: true, progress: true, estimatedCost: true, errorCode: true },
    }),
  ]);

  return NextResponse.json({
    configured: true,
    rankProjectId: binding.id,
    externalProjectId: binding.externalProjectId,
    status: binding.status,
    autoCheckEnabled: binding.autoCheckEnabled,
    scheduleType: binding.scheduleType,
    lastCheckCompletedAt: binding.lastCheckCompletedAt,
    lastRemoteSyncAt: binding.lastRemoteSyncAt,
    lastError: binding.lastError,
    regionCount: binding.regions.length,
    keywordCount,
    latestJob,
  });
}
