// Background-job orchestration for paid Topvisor checks. A check is NEVER run inside
// the HTTP request: the route creates a RankJob, this module launches checker/go
// (async on Topvisor) and later polls for completion + syncs results. Cost is
// confirmed by the caller before we ever get here.

import { prisma } from "@/lib/prisma";
import { getServiceForUser } from "./connection";
import { syncHistory } from "./historySync";
import { TopvisorError } from "./errors";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CheckRequest {
  regionsIndexes: number[];
  groupsIds?: number[];
  doSnapshots?: boolean;
  keywordId?: number;
  estimatedCost?: number;
}

/**
 * Create + launch a check job. Double-run guard: at most one active check per project.
 * Throws TOPVISOR_CHECK_ALREADY_RUNNING if one is already in flight.
 */
export async function createCheckJob(userId: string, rankProjectId: string, req: CheckRequest) {
  const binding = await prisma.rankProject.findFirst({
    where: { id: rankProjectId, site: { userId } },
    include: { regions: true },
  });
  if (!binding?.externalProjectId) throw new TopvisorError("RANK_PROJECT_PARTIAL", "Project not fully set up");

  const active = await prisma.rankJob.findFirst({
    where: { rankProjectId, type: "check", status: { in: ["queued", "running", "waiting_remote"] } },
    select: { id: true },
  });
  if (active) throw new TopvisorError("TOPVISOR_CHECK_ALREADY_RUNNING", "A check is already running for this project");

  const regionsIndexes =
    req.regionsIndexes?.length > 0
      ? req.regionsIndexes
      : binding.regions.filter((r) => r.enabled && r.regionIndex != null).map((r) => r.regionIndex as number);
  if (regionsIndexes.length === 0) {
    throw new TopvisorError("TOPVISOR_REGION_NOT_CONFIGURED", "No region_index available yet");
  }

  const job = await prisma.rankJob.create({
    data: {
      userId,
      rankProjectId,
      type: "check",
      status: "running",
      startedAt: new Date(),
      estimatedCost: req.estimatedCost ?? null,
      payload: JSON.stringify({ regionsIndexes, groupsIds: req.groupsIds, doSnapshots: !!req.doSnapshots }),
    },
  });

  try {
    const svc = await getServiceForUser(userId);
    await svc.runCheck({
      projectId: binding.externalProjectId,
      regionsIndexes,
      groupsIds: req.groupsIds,
      doSnapshots: req.doSnapshots,
      keywordId: req.keywordId,
    });
    await prisma.rankJob.update({ where: { id: job.id }, data: { status: "waiting_remote", progress: 10 } });
    await prisma.rankProject.update({
      where: { id: rankProjectId },
      data: { status: "checking", lastCheckRequestedAt: new Date(), lastError: null },
    });
  } catch (err) {
    const code = err instanceof TopvisorError ? err.code : "TOPVISOR_REMOTE_ERROR";
    await prisma.rankJob.update({
      where: { id: job.id },
      data: { status: "failed", errorCode: code, finishedAt: new Date() },
    });
    await prisma.rankProject.update({ where: { id: rankProjectId }, data: { status: "error", lastError: code } });
    throw err;
  }

  return job;
}

/** Pull recent history for a project and persist it (used after a check + manual sync). */
export async function syncProjectResults(userId: string, rankProjectId: string, days = 90) {
  const binding = await prisma.rankProject.findFirst({
    where: { id: rankProjectId, site: { userId } },
    include: { regions: true },
  });
  if (!binding?.externalProjectId) return { keywordsMatched: 0, checksWritten: 0 };

  const regions = binding.regions.filter((r) => r.regionIndex != null);
  const regionsIndexes = regions.map((r) => r.regionIndex as number);
  if (regionsIndexes.length === 0) return { keywordsMatched: 0, checksWritten: 0 };

  const regionIndexToId = new Map<number, string>(regions.map((r) => [r.regionIndex as number, r.id]));
  const primary = regions.find((r) => r.enabled) ?? regions[0];

  const svc = await getServiceForUser(userId);
  const result = (await svc.getHistory({
    projectId: binding.externalProjectId,
    regionsIndexes,
    date1: isoDaysAgo(days),
    date2: isoToday(),
  })) as Parameters<typeof syncHistory>[1];

  const stats = await syncHistory(rankProjectId, result, regionIndexToId, primary?.regionIndex ?? null);
  await prisma.rankProject.update({
    where: { id: rankProjectId },
    data: { lastRemoteSyncAt: new Date() },
  });
  return stats;
}

/**
 * Poll every waiting_remote check job. When Topvisor reports the project's positions
 * are complete (percent >= 100), sync results and finish the job. Called by the
 * in-process scheduler. Bounded work: processes a handful per tick.
 */
export async function pollWaitingJobs(limit = 10): Promise<void> {
  const jobs = await prisma.rankJob.findMany({
    where: { type: "check", status: "waiting_remote" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { project: true },
  });

  for (const job of jobs) {
    if (!job.rankProjectId || !job.project?.externalProjectId) {
      await prisma.rankJob.update({ where: { id: job.id }, data: { status: "failed", errorCode: "RANK_PROJECT_PARTIAL", finishedAt: new Date() } });
      continue;
    }
    try {
      const svc = await getServiceForUser(job.userId);
      const status = await svc.getProjectStatus(job.project.externalProjectId);
      const done = status.percent == null ? false : status.percent >= 100;
      const startedMs = job.startedAt ? job.startedAt.getTime() : job.createdAt.getTime();
      const stale = Date.now() - startedMs > 45 * 60_000; // 45-min safety timeout

      if (done || stale) {
        const stats = await syncProjectResults(job.userId, job.rankProjectId, 30);
        await prisma.rankJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            progress: 100,
            remoteStatus: status.percent != null ? `${status.percent}%` : null,
            result: JSON.stringify(stats),
            finishedAt: new Date(),
          },
        });
        await prisma.rankProject.update({
          where: { id: job.rankProjectId },
          data: { status: "active", lastCheckCompletedAt: new Date(), lastError: null },
        });
      } else {
        await prisma.rankJob.update({
          where: { id: job.id },
          data: { progress: Math.min(95, Math.max(10, Math.round(status.percent ?? 10))), remoteStatus: `${status.percent ?? 0}%` },
        });
      }
    } catch (err) {
      const code = err instanceof TopvisorError ? err.code : "TOPVISOR_REMOTE_ERROR";
      // Transient errors: leave the job waiting; it'll be retried next tick.
      if (!(err instanceof TopvisorError) || err.retryable) continue;
      await prisma.rankJob.update({ where: { id: job.id }, data: { status: "failed", errorCode: code, finishedAt: new Date() } });
      await prisma.rankProject.update({ where: { id: job.rankProjectId }, data: { status: "error", lastError: code } }).catch(() => {});
    }
  }
}
