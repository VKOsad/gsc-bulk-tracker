// GET /api/topvisor/rank-projects/[projectId]/history?regionIndex=&days=
// Position-history table + KPI for a project, built from LOCAL RankCheck rows (synced
// from Topvisor). Fast, no live call on load. Columns = the ACTUAL check dates.

import { NextResponse } from "next/server";
import { getSessionUserId, unauthorized } from "@/lib/topvisor/apiAuth";
import { getBindingById } from "@/lib/topvisor/projectAccess";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { projectId } = await params;

  const binding = await getBindingById(userId, projectId);
  if (!binding) return NextResponse.json({ error: "TOPVISOR_PROJECT_NOT_FOUND" }, { status: 404 });

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days") ?? 90)));
  const reqRegionIndex = url.searchParams.get("regionIndex");
  const enabledRegions = binding.regions.filter((r) => r.regionIndex != null);
  const region =
    (reqRegionIndex != null ? enabledRegions.find((r) => r.regionIndex === Number(reqRegionIndex)) : null) ??
    enabledRegions.find((r) => r.enabled) ??
    enabledRegions[0];

  const since = new Date(Date.now() - days * 86400_000);

  const keywords = await prisma.trackedKeyword.findMany({
    where: { rankProjectId: binding.id },
    orderBy: { keyword: "asc" },
    select: { id: true, keyword: true, externalGroupName: true, lastUrl: true },
  });
  const kwIds = keywords.map((k) => k.id);

  const checks = kwIds.length
    ? await prisma.rankCheck.findMany({
        where: {
          keywordId: { in: kwIds },
          source: "topvisor",
          checkedAt: { gte: since },
          ...(region ? { rankRegionId: region.id } : {}),
        },
        orderBy: { checkedAt: "asc" },
        select: { keywordId: true, checkedAt: true, position: true, url: true },
      })
    : [];

  // Distinct check dates (columns), newest first for display.
  const dateSet = new Set<string>();
  for (const c of checks) dateSet.add(c.checkedAt.toISOString().slice(0, 10));
  const dates = Array.from(dateSet).sort(); // asc

  // keywordId → { date → position }
  const byKw = new Map<string, Map<string, { position: number | null; url: string | null }>>();
  for (const c of checks) {
    const d = c.checkedAt.toISOString().slice(0, 10);
    if (!byKw.has(c.keywordId)) byKw.set(c.keywordId, new Map());
    byKw.get(c.keywordId)!.set(d, { position: c.position, url: c.url });
  }

  const rows = keywords.map((k) => {
    const series = byKw.get(k.id);
    const positions: Record<string, number | null> = {};
    let lastUrl = k.lastUrl;
    for (const d of dates) {
      const cell = series?.get(d);
      positions[d] = cell ? cell.position : null;
      if (cell?.url) lastUrl = cell.url;
    }
    return { id: k.id, keyword: k.keyword, group: k.externalGroupName ?? "", lastUrl, positions };
  });

  // KPI from the latest date vs the previous available date.
  const latest = dates[dates.length - 1] ?? null;
  const prev = dates[dates.length - 2] ?? null;
  const latestPositions = rows.map((r) => (latest ? r.positions[latest] : null));
  const prevPositions = rows.map((r) => (prev ? r.positions[prev] : null));
  const inTop = (p: number | null, n: number) => p != null && p > 0 && p <= n;

  let up = 0, down = 0, stay = 0;
  for (let i = 0; i < rows.length; i++) {
    const cur = latestPositions[i];
    const pr = prevPositions[i];
    if (cur == null || pr == null) continue;
    if (cur < pr) up++;
    else if (cur > pr) down++;
    else stay++;
  }
  const found = latestPositions.filter((p): p is number => p != null && p > 0);
  const avg = found.length ? Math.round((found.reduce((a, b) => a + b, 0) / found.length) * 10) / 10 : null;
  const prevFound = prevPositions.filter((p): p is number => p != null && p > 0);
  const prevAvg = prevFound.length ? prevFound.reduce((a, b) => a + b, 0) / prevFound.length : null;

  const kpi = {
    movement: { up, down, stay, total: rows.length },
    avgPosition: avg,
    avgDelta: avg != null && prevAvg != null ? Math.round((prevAvg - avg) * 10) / 10 : null, // + = improved
    medianPosition: median(found),
    distribution: {
      top3: latestPositions.filter((p) => inTop(p, 3)).length,
      top10: latestPositions.filter((p) => inTop(p, 10)).length,
      top30: latestPositions.filter((p) => inTop(p, 30)).length,
      top50: latestPositions.filter((p) => inTop(p, 50)).length,
      top100: latestPositions.filter((p) => inTop(p, 100)).length,
      beyond: latestPositions.filter((p) => p != null && p > 100).length,
      notFound: latestPositions.filter((p) => p == null || p === 0).length,
    },
    // Visibility from Topvisor's ready value would require a live summary call; the
    // portfolio principle keeps this page local, so we surface locally-computed
    // metrics and leave visibility for the (optional) live summary fetch.
    visibility: null as number | null,
  };

  return NextResponse.json({
    project: {
      id: binding.id,
      siteId: binding.siteId,
      url: binding.site.url,
      status: binding.status,
      externalProjectId: binding.externalProjectId,
      regions: enabledRegions.map((r) => ({ regionIndex: r.regionIndex, name: r.regionName, device: r.device, countryCode: r.countryCode })),
      selectedRegionIndex: region?.regionIndex ?? null,
    },
    dates: [...dates].reverse(), // newest first for the table
    keywords: rows,
    kpi,
  });
}
