// Wizard backend: idempotently create-or-link a Topvisor project for a local Site,
// attach Google regions, and import keywords. These are all FREE Topvisor operations
// (only checker/go costs money — that lives in the check/job layer, never here).
//
// Idempotency + partial-state recovery: if a previous attempt created the remote
// project but died before regions/keywords, re-running does NOT create a second
// project — it resumes from the saved binding state.

import { prisma } from "@/lib/prisma";
import { getServiceForUser } from "./connection";
import { getOwnedSite, getBinding, deviceToLegacy } from "./projectAccess";
import { normalizeGscProperty, sameDomain } from "./normalizeDomain";
import { googleRegions } from "./mappers";
import { TopvisorError } from "./errors";
import type { MappedProject } from "./types";

export interface SetupRegionInput {
  regionKey: number;
  regionName?: string;
  countryCode?: string;
  language: string;
  device: number; // 0 desktop | 1 tablet | 2 phone
  depth: number; // 1..5
}

export interface SetupInput {
  mode: "create" | "link";
  externalProjectId?: string; // required for link
  projectName?: string;
  regions: SetupRegionInput[];
  keywords: string[];
  groupName: string;
}

export interface CandidateProject {
  externalProjectId: string;
  name: string;
  url: string;
}

/** Existing Topvisor projects whose domain matches this site (for the link-vs-create step). */
export async function getCandidates(userId: string, siteId: string): Promise<CandidateProject[]> {
  const site = await getOwnedSite(userId, siteId);
  if (!site) throw new TopvisorError("TOPVISOR_PROJECT_NOT_FOUND", "Site not found");
  const svc = await getServiceForUser(userId);
  const { projects } = await svc.getProjects({ limit: 1000 });
  const target = site.siteId || site.url;
  return projects
    .filter((p) => p.url && sameDomain(p.url, target))
    .map((p) => ({ externalProjectId: p.externalProjectId, name: p.name, url: p.url }));
}

interface SetupResult {
  rankProjectId: string;
  externalProjectId: string | null;
  status: string;
  regionCount: number;
  keywordsAdded: number;
  keywordsDuplicated: number;
}

export async function setupProject(userId: string, siteId: string, input: SetupInput): Promise<SetupResult> {
  const site = await getOwnedSite(userId, siteId);
  if (!site) throw new TopvisorError("TOPVISOR_PROJECT_NOT_FOUND", "Site not found");
  const svc = await getServiceForUser(userId);

  const normalizedDomain = normalizeGscProperty(site.siteId || site.url).host;

  // 1. Load or create the local binding (idempotent).
  let binding = await getBinding(siteId);
  if (!binding) {
    binding = await prisma.rankProject.create({
      data: { siteId, provider: "topvisor", normalizedDomain, status: "draft" },
      include: { regions: true },
    });
  }

  const job = await prisma.rankJob.create({
    data: { userId, rankProjectId: binding.id, type: "create_project", status: "running", startedAt: new Date() },
  });

  try {
    // 2. Resolve the remote project id (create or link) — only if not already set.
    let externalProjectId = binding.externalProjectId ?? null;
    let externalProjectName = binding.externalProjectName ?? null;

    if (!externalProjectId) {
      if (input.mode === "link") {
        if (!input.externalProjectId) throw new TopvisorError("TOPVISOR_PROJECT_NOT_FOUND", "No project id to link");
        externalProjectId = String(input.externalProjectId);
      } else {
        // create — guard against an accidental duplicate for the same domain.
        const { projects } = await svc.getProjects({ limit: 1000 });
        const dup = projects.find((p) => p.url && sameDomain(p.url, normalizedDomain));
        if (dup) {
          throw new TopvisorError("TOPVISOR_PROJECT_DUPLICATE", "A Topvisor project already exists for this domain", {
            detail: dup.externalProjectId,
          });
        }
        externalProjectId = await svc.createProject(normalizedDomain, input.projectName);
      }
      // Attach the Google searcher (ignore "already added" style errors).
      try {
        await svc.addGoogleSearcher(externalProjectId);
      } catch (e) {
        if (!(e instanceof TopvisorError && e.code === "TOPVISOR_REMOTE_ERROR")) throw e;
      }
      binding = await prisma.rankProject.update({
        where: { id: binding.id },
        data: { externalProjectId, externalProjectName, status: "partial" },
        include: { regions: true },
      });
    }

    // 3. Add requested regions that aren't attached yet (dedupe by key+lang+device).
    for (const r of input.regions) {
      const exists = binding.regions.some(
        (x) => x.regionKey === r.regionKey && x.language === r.language && x.device === r.device,
      );
      if (exists) continue;
      await svc.addRegion({
        projectId: externalProjectId,
        regionKey: r.regionKey,
        language: r.language,
        device: r.device,
        depth: r.depth,
      });
      await prisma.rankRegion.create({
        data: {
          rankProjectId: binding.id,
          searcherKey: 1,
          regionKey: r.regionKey,
          regionName: r.regionName ?? null,
          countryCode: r.countryCode ?? null,
          language: r.language,
          device: r.device,
          depth: r.depth,
        },
      });
    }

    // 4. Re-fetch the remote project to learn each region's region_index, then persist it.
    const remote: MappedProject | null = await svc.getProject(externalProjectId);
    if (remote) {
      const gRegions = googleRegions(remote);
      const localRegions = await prisma.rankRegion.findMany({ where: { rankProjectId: binding.id } });
      for (const lr of localRegions) {
        const match = gRegions.find(
          (g) => g.regionKey === lr.regionKey && g.language === lr.language && g.device === lr.device,
        );
        if (match && match.regionIndex != null && match.regionIndex !== lr.regionIndex) {
          await prisma.rankRegion.update({ where: { id: lr.id }, data: { regionIndex: match.regionIndex } });
        }
      }
    }

    // 5. Import keywords (free) and mirror them locally.
    let keywordsAdded = 0;
    let keywordsDuplicated = 0;
    if (input.keywords.length > 0) {
      const stats = await svc.importKeywords(externalProjectId, input.keywords, input.groupName);
      keywordsAdded = stats.added;
      keywordsDuplicated = stats.duplicated;

      const primary = input.regions[0];
      const legacyDevice = primary ? deviceToLegacy(primary.device) : "desktop";
      const legacyCountry = (primary?.countryCode ?? "us").toLowerCase();
      const legacyLang = primary?.language ?? "en";
      for (const kw of input.keywords) {
        try {
          await prisma.trackedKeyword.create({
            data: {
              siteId,
              keyword: kw,
              provider: "topvisor",
              rankProjectId: binding.id,
              externalGroupName: input.groupName,
              device: legacyDevice,
              country: legacyCountry,
              lang: legacyLang,
              active: true,
            },
          });
        } catch {
          // Unique [rankProjectId, keyword] — already tracked locally, skip.
        }
      }
    }

    // 6. Final status.
    const regionCount = await prisma.rankRegion.count({ where: { rankProjectId: binding.id } });
    const kwCount = await prisma.trackedKeyword.count({ where: { rankProjectId: binding.id } });
    const status = externalProjectId && regionCount > 0 && kwCount > 0 ? "active" : "partial";
    await prisma.rankProject.update({
      where: { id: binding.id },
      data: { status, externalProjectId, lastRemoteSyncAt: new Date(), lastError: null },
    });
    await prisma.rankJob.update({
      where: { id: job.id },
      data: { status: "completed", progress: 100, finishedAt: new Date() },
    });

    return { rankProjectId: binding.id, externalProjectId, status, regionCount, keywordsAdded, keywordsDuplicated };
  } catch (err) {
    const code = err instanceof TopvisorError ? err.code : "TOPVISOR_REMOTE_ERROR";
    await prisma.rankProject.update({ where: { id: binding.id }, data: { status: "partial", lastError: code } }).catch(() => {});
    await prisma.rankJob
      .update({ where: { id: job.id }, data: { status: "failed", errorCode: code, finishedAt: new Date() } })
      .catch(() => {});
    throw err;
  }
}
