// Pure mappers: Topvisor raw payloads → our strict shapes. No I/O.
// Field names verified against the live API response (region carries BOTH `key`
// (region_key) and `index` (region_index), which are not interchangeable).

import type {
  RawRegion,
  RawProject,
  RawSearcher,
  MappedRegion,
  MappedProject,
} from "./types";

const truthy = (v: unknown): boolean => v === 1 || v === true || v === "1";

export function mapRegion(r: RawRegion): MappedRegion {
  return {
    regionKey: Number(r.key ?? 0),
    regionIndex: r.index != null ? Number(r.index) : null,
    regionName: String(r.name ?? ""),
    countryCode: r.countryCode != null ? String(r.countryCode) : null,
    language: String(r.lang ?? "en"),
    device: Number(r.device ?? 0),
    depth: Number(r.depth ?? 1),
    searcherKey: Number(r.searcher_key ?? 0),
    enabled: truthy(r.enabled ?? 1),
    type: r.type != null ? String(r.type) : null,
  };
}

/** Flatten a project's searchers[].regions[] into a flat list of mapped regions. */
export function mapProjectRegions(searchers: RawSearcher[] | undefined): MappedRegion[] {
  if (!Array.isArray(searchers)) return [];
  const out: MappedRegion[] = [];
  for (const s of searchers) {
    const searcherKey = Number(s.key ?? 0);
    for (const r of s.regions ?? []) {
      out.push({ ...mapRegion(r), searcherKey: r.searcher_key != null ? Number(r.searcher_key) : searcherKey });
    }
  }
  return out;
}

export function mapProject(p: RawProject): MappedProject {
  return {
    externalProjectId: String(p.id ?? ""),
    name: String(p.name ?? p.url ?? ""),
    url: String(p.url ?? ""),
    status: p.status != null ? String(p.status) : null,
    regions: mapProjectRegions(p.searchers),
  };
}

/** Only the Google (searcher_key = 1) regions of a project. */
export function googleRegions(project: MappedProject): MappedRegion[] {
  return project.regions.filter((r) => r.searcherKey === 1);
}
