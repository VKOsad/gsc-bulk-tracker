// In-process Topvisor scheduler (same pattern as rankScheduler): a single interval
// that (1) polls waiting checks and syncs their results, and (2) launches DUE auto-
// checks — but only for projects the user explicitly enabled, and only when the
// quoted price is within the saved cost limit. Legacy SERP scheduler never touches
// Topvisor projects (they are provider="topvisor"), and vice-versa.
//
// Single-container deploy → a module-level guard is enough. No paid check is ever
// launched here without autoCheckEnabled + a cost check.

import { prisma } from "@/lib/prisma";
import { getServiceForUser } from "./connection";
import { createCheckJob, pollWaitingJobs } from "./rankJobs";
import { isRankTrackerEnabled } from "./featureFlag";
import { TopvisorError } from "./errors";

const TICK_MS = 5 * 60_000; // every 5 minutes
let started = false;
let running = false;

function dueForAutoCheck(project: {
  scheduleType: string;
  lastCheckCompletedAt: Date | null;
  lastCheckRequestedAt: Date | null;
}): boolean {
  const intervalMs = project.scheduleType === "weekly" ? 7 * 86400_000 : 86400_000; // daily default
  const last = Math.max(
    project.lastCheckCompletedAt?.getTime() ?? 0,
    project.lastCheckRequestedAt?.getTime() ?? 0,
  );
  return Date.now() - last >= intervalMs - 60_000;
}

async function runAutoChecks(): Promise<void> {
  const projects = await prisma.rankProject.findMany({
    where: { provider: "topvisor", autoCheckEnabled: true, status: { in: ["active", "error"] } },
    include: { regions: true, site: { select: { userId: true } } },
    take: 25,
  });

  for (const p of projects) {
    if (!p.externalProjectId || !dueForAutoCheck(p)) continue;
    const userId = p.site.userId;
    const regionsIndexes = p.regions.filter((r) => r.enabled && r.regionIndex != null).map((r) => r.regionIndex as number);
    if (regionsIndexes.length === 0) continue;

    try {
      // Cost guard: quote first, respect the saved limit.
      const svc = await getServiceForUser(userId);
      const quote = await svc.getPrice({ projectId: p.externalProjectId, regionsIndexes });
      if (p.costLimit != null && quote.price > p.costLimit) {
        await prisma.rankJob.create({
          data: {
            userId,
            rankProjectId: p.id,
            type: "check",
            status: "cancelled",
            estimatedCost: quote.price,
            errorCode: "COST_LIMIT_EXCEEDED",
            errorMessage: `price ${quote.price} > limit ${p.costLimit}`,
            finishedAt: new Date(),
          },
        });
        continue;
      }
      await createCheckJob(userId, p.id, { regionsIndexes, estimatedCost: quote.price });
    } catch (err) {
      // Already-running / transient / balance → skip this tick, recorded on the project.
      const code = err instanceof TopvisorError ? err.code : "TOPVISOR_REMOTE_ERROR";
      if (code === "TOPVISOR_CHECK_ALREADY_RUNNING") continue;
      await prisma.rankProject.update({ where: { id: p.id }, data: { lastError: code } }).catch(() => {});
    }
  }
}

async function tick(): Promise<void> {
  if (running || !isRankTrackerEnabled()) return;
  running = true;
  try {
    await pollWaitingJobs(10);
    await runAutoChecks();
  } catch (err) {
    console.error("[topvisorScheduler] tick error:", err instanceof Error ? err.message : String(err));
  } finally {
    running = false;
  }
}

export function startTopvisorScheduler(): void {
  if (started || !isRankTrackerEnabled()) return;
  started = true;
  // First poll shortly after boot, then every TICK_MS.
  setTimeout(() => void tick(), 45_000);
  setInterval(() => void tick(), TICK_MS);
  console.log("[topvisorScheduler] started");
}
