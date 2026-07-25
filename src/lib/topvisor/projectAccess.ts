// Ownership helpers for the /api/topvisor/projects/* routes. Every project action is
// scoped to a Site the session user owns; guests/share links never reach these.

import { prisma } from "@/lib/prisma";

export async function getOwnedSite(userId: string, siteId: string) {
  return prisma.site.findFirst({ where: { id: siteId, userId } });
}

/** The Topvisor binding for a site (with its regions), or null. */
export async function getBinding(siteId: string) {
  return prisma.rankProject.findFirst({
    where: { siteId, provider: "topvisor" },
    include: { regions: true },
  });
}

export async function getBindingById(userId: string, rankProjectId: string) {
  return prisma.rankProject.findFirst({
    where: { id: rankProjectId, site: { userId } },
    include: { regions: true, site: true },
  });
}

/** device int (0/1/2) → the legacy TrackedKeyword.device string. */
export function deviceToLegacy(device: number): string {
  return device === 2 ? "mobile" : "desktop";
}
