// Parse a Topvisor positions/history payload into local RankCheck rows and refresh
// the denormalized TrackedKeyword.lastPosition/prevPosition/bestPosition — the two
// fields the existing rank-drop alert scheduler reads, so alerts keep working.
//
// history result shape (verified top-level): { headers, keywords[], tops, ... }.
// Each keyword: { name, id?, positionsData: { "<date>:<projectId>:<regionIndex>": cell } }
// cell: { position: number | "--", relevant_url?, snippet? } (position "--"/0 = not found).

import { prisma } from "@/lib/prisma";

interface HistoryCell {
  position?: number | string;
  relevant_url?: string;
  snippet?: string;
}
interface HistoryKeyword {
  name?: string;
  id?: number | string;
  positionsData?: Record<string, HistoryCell>;
}
interface HistoryResult {
  keywords?: HistoryKeyword[];
}

function parsePosition(v: number | string | undefined): number | null {
  if (v == null || v === "--" || v === "" || v === 0 || v === "0") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// key format "YYYY-MM-DD:projectId:regionIndex"
function parseKey(k: string): { date: string; regionIndex: number } | null {
  const parts = k.split(":");
  if (parts.length < 3) return null;
  const date = parts[0];
  const regionIndex = parseInt(parts[parts.length - 1], 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(regionIndex)) return null;
  return { date, regionIndex };
}

export interface SyncStats {
  keywordsMatched: number;
  checksWritten: number;
}

/**
 * Persist a history payload for a project. `regionIndexToId` maps Topvisor
 * region_index → local RankRegion.id. Idempotent: an existing check for the same
 * (keyword, region, day) is not duplicated.
 */
export async function syncHistory(
  rankProjectId: string,
  result: HistoryResult,
  regionIndexToId: Map<number, string>,
  primaryRegionIndex: number | null,
): Promise<SyncStats> {
  const keywords = result.keywords ?? [];
  const localKeywords = await prisma.trackedKeyword.findMany({
    where: { rankProjectId },
    select: { id: true, keyword: true, lastPosition: true, bestPosition: true },
  });
  const byName = new Map(localKeywords.map((k) => [k.keyword.trim().toLowerCase(), k]));

  let keywordsMatched = 0;
  let checksWritten = 0;

  for (const hk of keywords) {
    const local = hk.name ? byName.get(hk.name.trim().toLowerCase()) : undefined;
    if (!local) continue;
    keywordsMatched++;

    // Collect this keyword's cells, sorted by date, so we can also update denorm state.
    const cells: { date: string; regionIndex: number; position: number | null; url?: string; snippet?: string }[] = [];
    for (const [key, cell] of Object.entries(hk.positionsData ?? {})) {
      const parsed = parseKey(key);
      if (!parsed) continue;
      cells.push({
        date: parsed.date,
        regionIndex: parsed.regionIndex,
        position: parsePosition(cell.position),
        url: cell.relevant_url,
        snippet: cell.snippet,
      });
    }
    cells.sort((a, b) => a.date.localeCompare(b.date));

    for (const c of cells) {
      const rankRegionId = regionIndexToId.get(c.regionIndex) ?? null;
      const checkedAt = new Date(`${c.date}T00:00:00Z`);
      // De-dupe: skip if a topvisor check already exists for this keyword+region+day.
      const existing = await prisma.rankCheck.findFirst({
        where: {
          keywordId: local.id,
          rankRegionId,
          checkedAt,
          source: "topvisor",
        },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.rankCheck.create({
        data: {
          keywordId: local.id,
          source: "topvisor",
          rankRegionId,
          checkedAt,
          externalCheckedAt: checkedAt,
          position: c.position,
          url: c.url ?? null,
          snippet: c.snippet ?? null,
          syncedAt: new Date(),
        },
      });
      checksWritten++;
    }

    // Denormalize from the PRIMARY region's series (keeps rank-drop alerts working).
    const primaryCells = cells
      .filter((c) => primaryRegionIndex == null || c.regionIndex === primaryRegionIndex)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (primaryCells.length > 0) {
      const last = primaryCells[primaryCells.length - 1];
      const prev = primaryCells.length > 1 ? primaryCells[primaryCells.length - 2] : null;
      const positions = primaryCells.map((c) => c.position).filter((p): p is number => p != null);
      const best = positions.length ? Math.min(...positions, local.bestPosition ?? Infinity) : local.bestPosition ?? null;
      await prisma.trackedKeyword.update({
        where: { id: local.id },
        data: {
          lastPosition: last.position,
          prevPosition: prev ? prev.position : local.lastPosition,
          bestPosition: best === Infinity ? null : best,
          lastUrl: last.url ?? undefined,
          lastCheckedAt: new Date(`${last.date}T00:00:00Z`),
          lastRemoteSyncAt: new Date(),
        },
      });
    }
  }

  return { keywordsMatched, checksWritten };
}
