// POST /api/topvisor/projects/[siteId]/price
// Ask Topvisor how much a check would cost — shown to the user BEFORE any paid run.
// This is a read-only price query; it never launches a check.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId, unauthorized, badRequest, errorResponse } from "@/lib/topvisor/apiAuth";
import { getServiceForUser } from "@/lib/topvisor/connection";
import { getOwnedSite, getBinding } from "@/lib/topvisor/projectAccess";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PriceSchema = z.object({
  regionsIndexes: z.array(z.number().int()).optional(),
  groupsIds: z.array(z.number().int()).optional(),
  doSnapshots: z.boolean().optional(),
  keywordId: z.number().int().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { siteId } = await params;

  const site = await getOwnedSite(userId, siteId);
  if (!site) return badRequest("TOPVISOR_PROJECT_NOT_FOUND");
  const binding = await getBinding(siteId);
  if (!binding?.externalProjectId) return badRequest("RANK_PROJECT_PARTIAL");

  const body = await req.json().catch(() => ({}));
  const parsed = PriceSchema.safeParse(body ?? {});
  if (!parsed.success) return badRequest("INVALID_REQUEST", parsed.error.issues[0]?.message);

  // Default to all enabled regions that already have a region_index.
  const regionsIndexes =
    parsed.data.regionsIndexes ??
    binding.regions.filter((r) => r.enabled && r.regionIndex != null).map((r) => r.regionIndex as number);
  if (regionsIndexes.length === 0) return badRequest("TOPVISOR_REGION_NOT_CONFIGURED");

  const keywordCount = await prisma.trackedKeyword.count({
    where: { rankProjectId: binding.id, active: true },
  });

  try {
    const svc = await getServiceForUser(userId);
    const quote = await svc.getPrice({
      projectId: binding.externalProjectId,
      regionsIndexes,
      groupsIds: parsed.data.groupsIds,
      doSnapshots: parsed.data.doSnapshots ?? false,
      keywordId: parsed.data.keywordId,
    });
    return NextResponse.json({
      price: quote.price,
      regionsIndexes,
      regionCount: regionsIndexes.length,
      keywordCount,
      doSnapshots: parsed.data.doSnapshots ?? false,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
