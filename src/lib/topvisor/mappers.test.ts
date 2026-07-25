import { describe, it, expect } from "vitest";
import { mapRegion, mapProject, mapProjectRegions, googleRegions } from "./mappers";

// Shapes taken from a real Topvisor get/projects_2/projects response.
const LIVE_REGION = {
  id: 10601623,
  key: 65,
  lang: "ru",
  device: 0,
  depth: 1,
  index: 90,
  enabled: 1,
  searcher_key: 0,
  type: "CITY",
  countryCode: "RU",
  name: "Новосибирск",
  areaName: "Новосибирская область",
};

describe("mapRegion", () => {
  it("maps region_key from `key` and region_index from `index` (NOT interchangeable)", () => {
    const m = mapRegion(LIVE_REGION);
    expect(m.regionKey).toBe(65);
    expect(m.regionIndex).toBe(90);
    expect(m.regionName).toBe("Новосибирск");
    expect(m.countryCode).toBe("RU");
    expect(m.language).toBe("ru");
    expect(m.device).toBe(0);
    expect(m.enabled).toBe(true);
    expect(m.type).toBe("CITY");
  });

  it("handles a region with no index yet (not-yet-refetched)", () => {
    expect(mapRegion({ key: 1 }).regionIndex).toBeNull();
  });
});

describe("mapProject / mapProjectRegions", () => {
  const project = {
    id: 12119759,
    name: "example",
    url: "example.com",
    status: 0,
    searchers: [
      { id: 1, key: 0, name: "Yandex", regions: [LIVE_REGION] },
      { id: 2, key: 1, name: "Google", regions: [{ key: 200, index: 5, name: "United States", countryCode: "US", searcher_key: 1, device: 0, depth: 5, lang: "en", enabled: 1 }] },
    ],
  };

  it("flattens searchers[].regions[] and inherits searcher_key", () => {
    const regions = mapProjectRegions(project.searchers);
    expect(regions).toHaveLength(2);
    expect(regions.map((r) => r.searcherKey).sort()).toEqual([0, 1]);
  });

  it("maps the project and filters google regions", () => {
    const mp = mapProject(project);
    expect(mp.externalProjectId).toBe("12119759");
    expect(mp.url).toBe("example.com");
    const g = googleRegions(mp);
    expect(g).toHaveLength(1);
    expect(g[0].regionKey).toBe(200);
    expect(g[0].regionIndex).toBe(5);
  });

  it("tolerates a project with no searchers", () => {
    expect(mapProject({ id: 1 }).regions).toEqual([]);
  });
});
