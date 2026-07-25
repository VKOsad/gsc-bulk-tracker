// Types for the Topvisor API v2 payloads we consume. The API returns many more
// fields than we use; raw shapes keep an index signature so we stay tolerant of
// extra/renamed columns, while mapped shapes are the strict contract for our code.

// ── Raw (as returned by Topvisor) ──────────────────────────────────────────────

export interface RawRegion {
  id?: number;
  key?: number; // region_key — used to ADD a region
  index?: number; // region_index — used to QUERY (history/price/check)
  lang?: string;
  device?: number; // 0 desktop | 1 tablet | 2 phone
  depth?: number; // 1..5
  enabled?: number | boolean;
  searcher_key?: number;
  type?: string; // "CITY" | "COUNTRY" | ...
  countryCode?: string;
  name?: string;
  areaName?: string;
  [k: string]: unknown;
}

export interface RawSearcher {
  id?: number;
  project_id?: number;
  key?: number; // searcher_key (0 Yandex, 1 Google, …)
  name?: string;
  enabled?: number | boolean;
  regions?: RawRegion[];
  [k: string]: unknown;
}

export interface RawProject {
  id?: number | string;
  name?: string;
  url?: string;
  site?: string;
  status?: string | number;
  searchers?: RawSearcher[];
  [k: string]: unknown;
}

// ── Mapped (our strict contract) ───────────────────────────────────────────────

export interface MappedRegion {
  regionKey: number;
  regionIndex: number | null;
  regionName: string;
  countryCode: string | null;
  language: string;
  device: number;
  depth: number;
  searcherKey: number;
  enabled: boolean;
  type: string | null;
}

export interface MappedProject {
  externalProjectId: string;
  name: string;
  url: string;
  status: string | null;
  regions: MappedRegion[];
}

export interface ImportStats {
  sent: number;
  added: number;
  duplicated: number;
  changed: number;
}

export interface PriceQuote {
  price: number;
  projectsIds: number[];
  pricesByUsers?: unknown;
}

// Device / depth helpers shared by UI + mappers.
export const DEVICE = { desktop: 0, tablet: 1, phone: 2 } as const;
export type DeviceLabel = keyof typeof DEVICE;

/** Google depth (1..5) → the TOP window it represents. Top-100 is not available. */
export function depthToTopLabel(depth: number): string {
  const d = Math.max(1, Math.min(5, Math.round(depth)));
  return `Top-${d * 10}`;
}
