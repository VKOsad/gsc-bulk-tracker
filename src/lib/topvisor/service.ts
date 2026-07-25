// High-level Topvisor operations built on the low-level client. This is where the
// verified API specifics live (correct paths, `fields`, filter-by-id for checker,
// `groups_ids`, device/depth, import CSV, region_key vs region_index). Everything is
// server-only. Paid actions (getPrice/runCheck) are just requests here — the cost
// gate + confirmation live in the API routes / job layer, never in this module.

import type { TopvisorClient } from "./client";
import { mapProject } from "./mappers";
import { toImportPayload } from "./keywordParser";
import type { MappedProject, MappedRegion, ImportStats, PriceQuote, RawProject, RawRegion } from "./types";
import { mapRegion } from "./mappers";

const GOOGLE = 1;

function idFilter(projectId: string | number) {
  return [{ name: "id", operator: "EQUALS", values: [Number(projectId)] }];
}

export interface CheckTarget {
  projectId: string | number;
  regionsIndexes?: number[]; // region_index values
  groupsIds?: number[];
  keywordId?: number;
  doSnapshots?: boolean; // default false — snapshots can increase cost
}

export function createTopvisorService(client: TopvisorClient) {
  return {
    /** Cheap read used by "Test connection": returns the account's project count. */
    async verifyConnection(): Promise<{ ok: true; projectCount: number }> {
      const res = await client.postWithMeta<RawProject[]>("get/projects_2/projects", {
        limit: 1,
        fields: ["id"],
      });
      const count = res.total ?? (Array.isArray(res.result) ? res.result.length : 0);
      return { ok: true, projectCount: count };
    },

    /** List projects; pass withRegions to include searcher/region details. */
    async getProjects(
      opts: { withRegions?: boolean; limit?: number; offset?: number } = {},
    ): Promise<{ projects: MappedProject[]; total?: number }> {
      const body: Record<string, unknown> = {
        limit: opts.limit ?? 1000,
        offset: opts.offset ?? 0,
        fields: ["id", "name", "url", "site", "status"],
      };
      if (opts.withRegions) body.show_searchers_and_regions = 2;
      const res = await client.postWithMeta<RawProject[]>("get/projects_2/projects", body);
      return { projects: (res.result ?? []).map(mapProject), total: res.total };
    },

    /** Fetch a single project (with regions) by id. */
    async getProject(projectId: string | number): Promise<MappedProject | null> {
      const res = await client.post<RawProject[]>("get/projects_2/projects", {
        id: Number(projectId),
        show_searchers_and_regions: 2,
        fields: ["id", "name", "url", "site", "status"],
      });
      const first = Array.isArray(res) ? res[0] : undefined;
      return first ? mapProject(first) : null;
    },

    /** Create a project; returns the new external project id. */
    async createProject(url: string, name?: string): Promise<string> {
      const res = await client.post<{ id?: number | string } | number | string>(
        "add/projects_2/projects",
        { url, ...(name ? { name } : {}) },
      );
      const id = typeof res === "object" && res !== null ? (res as { id?: unknown }).id : res;
      return String(id ?? "");
    },

    /** Attach the Google searcher (searcher_key = 1) to a project. */
    async addGoogleSearcher(projectId: string | number): Promise<void> {
      await client.post("add/positions_2/searchers", {
        project_id: Number(projectId),
        searcher_key: GOOGLE,
      });
    },

    /** Search Topvisor's region database for Google (with server-side debounce/cache upstream). */
    async searchRegions(
      search: string,
      opts: { countryCode?: string; limit?: number } = {},
    ): Promise<MappedRegion[]> {
      const body: Record<string, unknown> = { searcher_key: GOOGLE, search, limit: opts.limit ?? 20 };
      if (opts.countryCode) body.country_code = opts.countryCode;
      const res = await client.post<RawRegion[]>("get/system_2/common/regions", body);
      return (res ?? []).map(mapRegion);
    },

    /** Add a region to a project (input is region_key). depth 1..5, device 0/1/2. */
    async addRegion(input: {
      projectId: string | number;
      regionKey: number;
      language?: string;
      device?: number;
      depth?: number;
    }): Promise<void> {
      await client.post("add/positions_2/searchers_regions", {
        project_id: Number(input.projectId),
        searcher_key: GOOGLE,
        region_key: Number(input.regionKey),
        region_lang: input.language ?? "en",
        region_device: input.device ?? 0,
        region_depth: input.depth ?? 5, // default Top-50
      });
    },

    /** Import keywords (CSV payload). Returns normalized import stats. */
    async importKeywords(
      projectId: string | number,
      keywords: string[],
      groupName = "Основная",
    ): Promise<ImportStats> {
      const res = await client.post<{
        countSended?: number;
        countAdded?: number;
        countDuplicated?: number;
        countChanged?: number;
      }>("add/keywords_2/keywords/import", {
        project_id: Number(projectId),
        keywords: toImportPayload(keywords, groupName),
        group_name: groupName,
      });
      return {
        sent: Number(res?.countSended ?? 0),
        added: Number(res?.countAdded ?? 0),
        duplicated: Number(res?.countDuplicated ?? 0),
        changed: Number(res?.countChanged ?? 0),
      };
    },

    /** Ask Topvisor how much a check would cost (project selected via filters by id). */
    async getPrice(target: CheckTarget): Promise<PriceQuote> {
      const body: Record<string, unknown> = {
        filters: idFilter(target.projectId),
        apply_discount: 1,
        do_snapshots: target.doSnapshots ? 1 : 0,
      };
      if (target.regionsIndexes?.length) body.regions_indexes = target.regionsIndexes;
      if (target.groupsIds?.length) body.groups_ids = target.groupsIds;
      if (target.keywordId) body.keyword_id = target.keywordId;
      const res = await client.post<{ price?: number; projectsIds?: number[]; pricesByUsers?: unknown }>(
        "get/positions_2/checker/price",
        body,
      );
      return {
        price: Number(res?.price ?? 0),
        projectsIds: res?.projectsIds ?? [],
        pricesByUsers: res?.pricesByUsers,
      };
    },

    /** Launch a check (async). Project selected via filters by id; group via groups_ids. */
    async runCheck(target: CheckTarget): Promise<{ projectsIds: number[] }> {
      const body: Record<string, unknown> = { filters: idFilter(target.projectId) };
      if (target.regionsIndexes?.length) body.regions_indexes = target.regionsIndexes;
      if (target.groupsIds?.length) body.groups_ids = target.groupsIds;
      if (target.keywordId) body.keyword_id = target.keywordId;
      if (target.doSnapshots) body.do_snapshots = 1;
      const res = await client.post<{ projectsIds?: number[] }>("edit/positions_2/checker/go", body);
      return { projectsIds: res?.projectsIds ?? [] };
    },

    /** Position history for a project (region_index-scoped). serp_features is opt-in. */
    async getHistory(input: {
      projectId: string | number;
      regionsIndexes?: number[];
      dates?: string[];
      date1?: string;
      date2?: string;
      serpFeatures?: boolean;
    }): Promise<unknown> {
      const positionsFields = input.serpFeatures
        ? ["position", "relevant_url", "snippet"]
        : ["position", "relevant_url"];
      const body: Record<string, unknown> = {
        project_id: Number(input.projectId),
        positions_fields: positionsFields,
        show_headers: true,
        show_exists_dates: true,
      };
      if (input.regionsIndexes?.length) body.regions_indexes = input.regionsIndexes;
      if (input.dates?.length) body.dates = input.dates;
      else {
        if (input.date1) body.date1 = input.date1;
        if (input.date2) body.date2 = input.date2;
      }
      if (input.serpFeatures) body.fields = ["serp_features"];
      return client.post("get/positions_2/history", body);
    },

    /** Ready-made summary metrics for two compared dates (visibility is pre-computed). */
    async getSummary(input: {
      projectId: string | number;
      regionIndex: number;
      date1: string;
      date2: string;
    }): Promise<unknown> {
      return client.post("get/positions_2/summary", {
        project_id: Number(input.projectId),
        region_index: Number(input.regionIndex),
        dates: [input.date1, input.date2],
        show_dynamics: true,
        show_tops: true,
        show_avg: true,
        show_visibility: true,
      });
    },

    /** Trend series for charts (visibility / avg / TOP buckets). */
    async getSummaryChart(input: {
      projectId: string | number;
      regionIndex: number;
      date1: string;
      date2: string;
    }): Promise<unknown> {
      return client.post("get/positions_2/summary_chart", {
        project_id: Number(input.projectId),
        region_index: Number(input.regionIndex),
        date1: input.date1,
        date2: input.date2,
        show_tops: true,
        show_avg: true,
        show_visibility: true,
      });
    },
  };
}

export type TopvisorService = ReturnType<typeof createTopvisorService>;
