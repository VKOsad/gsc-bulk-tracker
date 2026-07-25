// GET /api/topvisor/projects — the Rank Tracker portfolio feed. Built ENTIRELY from
// the local DB + cache (no per-site Topvisor calls), so it scales to 500+ sites.
// Returns every Site with its Topvisor binding status + cheap position aggregates,
// plus the count of still-unconfigured sites (for the "new sites" banner).

import { NextResponse } from "next/server";
import { getSessionUserId, unauthorized } from "@/lib/topvisor/apiAuth";
import { isRankTrackerEnabled } from "@/lib/topvisor/featureFlag";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  if (!isRankTrackerEnabled()) return NextResponse.json({ enabled: false, sites: [], newSites: 0 });

  const sites = await prisma.site.findMany({
    where: { userId },
    select: { id: true, url: true, siteId: true, tags: true },
    orderBy: { createdAt: "asc" },
  });

  const bindings = await prisma.rankProject.findMany({
    where: { provider: "topvisor", site: { userId } },
    include: { regions: { select: { regionName: true, countryCode: true, device: true, enabled: true } } },
  });
  const bindingBySite = new Map(bindings.map((b) => [b.siteId, b]));
  const projectIds = bindings.map((b) => b.id);

  // Cheap aggregates over the denormalized latest positions (a handful of grouped queries).
  const [counts, tens, threes, avgs] = projectIds.length
    ? await Promise.all([
        prisma.trackedKeyword.groupBy({ by: ["rankProjectId"], where: { rankProjectId: { in: projectIds }, active: true }, _count: { _all: true } }),
        prisma.trackedKeyword.groupBy({ by: ["rankProjectId"], where: { rankProjectId: { in: projectIds }, active: true, lastPosition: { lte: 10, gt: 0 } }, _count: { _all: true } }),
        prisma.trackedKeyword.groupBy({ by: ["rankProjectId"], where: { rankProjectId: { in: projectIds }, active: true, lastPosition: { lte: 3, gt: 0 } }, _count: { _all: true } }),
        prisma.trackedKeyword.groupBy({ by: ["rankProjectId"], where: { rankProjectId: { in: projectIds }, active: true, lastPosition: { not: null } }, _avg: { lastPosition: true } }),
      ])
    : [[], [], [], []];

  const num = (rows: { rankProjectId: string | null; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.rankProjectId, r._count._all]));
  const kwCount = num(counts as never);
  const top10 = num(tens as never);
  const top3 = num(threes as never);
  const avgMap = new Map((avgs as { rankProjectId: string | null; _avg: { lastPosition: number | null } }[]).map((r) => [r.rankProjectId, r._avg.lastPosition]));

  let newSites = 0;
  const rows = sites.map((s) => {
    const b = bindingBySite.get(s.id);
    if (!b) newSites++;
    const region = b?.regions.find((r) => r.enabled) ?? b?.regions[0];
    return {
      siteId: s.id,
      url: s.url,
      gscProperty: s.siteId,
      tags: s.tags ?? "",
      configured: !!b,
      status: b?.status ?? "unconfigured",
      rankProjectId: b?.id ?? null,
      externalProjectId: b?.externalProjectId ?? null,
      autoCheckEnabled: b?.autoCheckEnabled ?? false,
      favorite: b?.favorite ?? false,
      lastCheckCompletedAt: b?.lastCheckCompletedAt ?? null,
      region: region ? { name: region.regionName, country: region.countryCode, device: region.device } : null,
      keywordCount: b ? kwCount.get(b.id) ?? 0 : 0,
      top3: b ? top3.get(b.id) ?? 0 : 0,
      top10: b ? top10.get(b.id) ?? 0 : 0,
      avgPosition: b ? (avgMap.get(b.id) != null ? Math.round((avgMap.get(b.id) as number) * 10) / 10 : null) : null,
    };
  });

  return NextResponse.json({ enabled: true, sites: rows, newSites, projectCount: bindings.length });
}
