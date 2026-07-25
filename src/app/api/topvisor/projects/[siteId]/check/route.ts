// POST /api/topvisor/projects/[siteId]/check
// Launch a PAID check — only with explicit confirmation (the client shows the price
// from /price first). Runs as a background RankJob; the request returns immediately
// with a jobId. Double-run protection lives in createCheckJob.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId, unauthorized, badRequest, errorResponse } from "@/lib/topvisor/apiAuth";
import { getOwnedSite, getBinding } from "@/lib/topvisor/projectAccess";
import { createCheckJob } from "@/lib/topvisor/rankJobs";
import { canConnectTopvisor } from "@/lib/topvisor/featureFlag";

export const runtime = "nodejs";

const CheckSchema = z.object({
  confirm: z.literal(true), // explicit cost confirmation is REQUIRED
  regionsIndexes: z.array(z.number().int()).optional(),
  groupsIds: z.array(z.number().int()).optional(),
  doSnapshots: z.boolean().optional(),
  keywordId: z.number().int().optional(),
  confirmedCost: z.number().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  if (!canConnectTopvisor()) return badRequest("TOPVISOR_ENCRYPTION_NOT_CONFIGURED");

  const { siteId } = await params;
  const site = await getOwnedSite(userId, siteId);
  if (!site) return badRequest("TOPVISOR_PROJECT_NOT_FOUND");
  const binding = await getBinding(siteId);
  if (!binding?.externalProjectId) return badRequest("RANK_PROJECT_PARTIAL");

  const body = await req.json().catch(() => null);
  const parsed = CheckSchema.safeParse(body);
  if (!parsed.success) {
    // Missing confirm:true → the caller must confirm the cost first.
    return badRequest("COST_CONFIRMATION_REQUIRED", parsed.error.issues[0]?.message);
  }

  try {
    const job = await createCheckJob(userId, binding.id, {
      regionsIndexes: parsed.data.regionsIndexes ?? [],
      groupsIds: parsed.data.groupsIds,
      doSnapshots: parsed.data.doSnapshots,
      keywordId: parsed.data.keywordId,
      estimatedCost: parsed.data.confirmedCost,
    });
    return NextResponse.json({ jobId: job.id, status: job.status });
  } catch (err) {
    return errorResponse(err);
  }
}
