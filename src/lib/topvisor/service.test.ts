import { describe, it, expect } from "vitest";
import { createTopvisorService } from "./service";
import type { TopvisorClient } from "./client";

// Records every request and returns canned responses, so we can assert the service
// builds exactly the payloads the verified API expects — with NO network.
function makeClient(respond: (path: string, body: Record<string, unknown>) => unknown) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const client: TopvisorClient = {
    async post(path, body) {
      calls.push({ path, body });
      return respond(path, body) as never;
    },
    async postWithMeta(path, body) {
      calls.push({ path, body });
      const r = respond(path, body) as { __meta?: boolean; result?: unknown; total?: number };
      if (r && typeof r === "object" && (r as { __meta?: boolean }).__meta) {
        return { result: r.result as never, total: r.total, nextOffset: undefined };
      }
      return { result: r as never, total: undefined, nextOffset: undefined };
    },
  };
  return { client, calls };
}

describe("Topvisor service", () => {
  it("verifyConnection reports the project count from `total`", async () => {
    const { client } = makeClient(() => ({ __meta: true, result: [{ id: 1 }], total: 2 }));
    const svc = createTopvisorService(client);
    expect(await svc.verifyConnection()).toEqual({ ok: true, projectCount: 2 });
  });

  it("searchRegions posts to system_2/common/regions and maps key/index", async () => {
    const { client, calls } = makeClient(() => [
      { key: 65, index: 90, name: "Новосибирск", countryCode: "RU", lang: "ru", device: 0, depth: 1, enabled: 1, searcher_key: 1 },
    ]);
    const svc = createTopvisorService(client);
    const regions = await svc.searchRegions("новоси", { countryCode: "RU" });
    expect(calls[0].path).toBe("get/system_2/common/regions");
    expect(calls[0].body).toMatchObject({ searcher_key: 1, search: "новоси", country_code: "RU" });
    expect(regions[0]).toMatchObject({ regionKey: 65, regionIndex: 90 });
  });

  it("addRegion sends region_key + region_depth (default Top-50) + device", async () => {
    const { client, calls } = makeClient(() => ({}));
    const svc = createTopvisorService(client);
    await svc.addRegion({ projectId: 12119759, regionKey: 200, language: "en", device: 2 });
    expect(calls[0].path).toBe("add/positions_2/searchers_regions");
    expect(calls[0].body).toMatchObject({
      project_id: 12119759,
      searcher_key: 1,
      region_key: 200,
      region_lang: "en",
      region_device: 2,
      region_depth: 5,
    });
  });

  it("importKeywords maps countSended/Added/Duplicated/Changed", async () => {
    const { client, calls } = makeClient(() => ({ countSended: 100, countAdded: 90, countDuplicated: 5, countChanged: 5 }));
    const svc = createTopvisorService(client);
    const stats = await svc.importKeywords(1, ["a", "b"], "Основная");
    expect(stats).toEqual({ sent: 100, added: 90, duplicated: 5, changed: 5 });
    expect(calls[0].path).toBe("add/keywords_2/keywords/import");
    expect(String(calls[0].body.keywords)).toContain("name;group_name");
  });

  it("getPrice selects the project via filters-by-id (NO project_id) and defaults do_snapshots=0", async () => {
    const { client, calls } = makeClient(() => ({ price: 12.5, projectsIds: [123] }));
    const svc = createTopvisorService(client);
    const quote = await svc.getPrice({ projectId: 123, regionsIndexes: [5, 6] });
    expect(calls[0].path).toBe("get/positions_2/checker/price");
    expect(calls[0].body.project_id).toBeUndefined();
    expect(calls[0].body.filters).toEqual([{ name: "id", operator: "EQUALS", values: [123] }]);
    expect(calls[0].body).toMatchObject({ regions_indexes: [5, 6], do_snapshots: 0, apply_discount: 1 });
    expect(quote.price).toBe(12.5);
  });

  it("runCheck selects via filters-by-id, uses groups_ids, omits snapshots by default", async () => {
    const { client, calls } = makeClient(() => ({ projectsIds: [123] }));
    const svc = createTopvisorService(client);
    const res = await svc.runCheck({ projectId: 123, regionsIndexes: [5], groupsIds: [42] });
    expect(calls[0].path).toBe("edit/positions_2/checker/go");
    expect(calls[0].body.filters).toEqual([{ name: "id", operator: "EQUALS", values: [123] }]);
    expect(calls[0].body).toMatchObject({ regions_indexes: [5], groups_ids: [42] });
    expect(calls[0].body.do_snapshots).toBeUndefined();
    expect(res.projectsIds).toEqual([123]);
  });

  it("createProject returns the new id from an object or scalar", async () => {
    const a = makeClient(() => ({ id: 999 }));
    expect(await createTopvisorService(a.client).createProject("example.com")).toBe("999");
    const b = makeClient(() => 555);
    expect(await createTopvisorService(b.client).createProject("example.com")).toBe("555");
  });

  it("getHistory opts into serp_features only when requested", async () => {
    const { client, calls } = makeClient(() => ({}));
    const svc = createTopvisorService(client);
    await svc.getHistory({ projectId: 1, regionsIndexes: [5], serpFeatures: true });
    expect(calls[0].body.positions_fields).toContain("snippet");
    expect(calls[0].body.fields).toEqual(["serp_features"]);
    await svc.getHistory({ projectId: 1, regionsIndexes: [5] });
    expect(calls[1].body.fields).toBeUndefined();
  });
});
