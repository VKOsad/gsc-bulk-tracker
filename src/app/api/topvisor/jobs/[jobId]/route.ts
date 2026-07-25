// GET /api/topvisor/jobs/[jobId] — poll a job's progress (owner only).

import { NextResponse } from "next/server";
import { getSessionUserId, unauthorized } from "@/lib/topvisor/apiAuth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { jobId } = await params;
  const job = await prisma.rankJob.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      type: true,
      status: true,
      progress: true,
      remoteStatus: true,
      estimatedCost: true,
      errorCode: true,
      result: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  if (!job) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(job);
}
