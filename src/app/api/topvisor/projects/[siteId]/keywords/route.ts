// Keyword management for a Topvisor project binding.
//  GET    — list locally-tracked keywords (+ latest denormalized position).
//  POST   — parse + import to Topvisor (free) and mirror locally.
//  DELETE — remove from the local interface (remote deletion is a separate, explicit op).
// Session + Site ownership required. Adding keywords never launches a paid check.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId, unauthorized, badRequest, errorResponse } from "@/lib/topvisor/apiAuth";
import { getServiceForUser } from "@/lib/topvisor/connection";
import { getOwnedSite, getBinding, deviceToLegacy } from "@/lib/topvisor/projectAccess";
import { parseKeywords } from "@/lib/topvisor/keywordParser";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { siteId } = await params;
  const site = await getOwnedSite(userId, siteId);
  if (!site) return badRequest("TOPVISOR_PROJECT_NOT_FOUND");
  const binding = await getBinding(siteId);
  if (!binding) return NextResponse.json({ keywords: [] });

  const rows = await prisma.trackedKeyword.findMany({
    where: { rankProjectId: binding.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      keyword: true,
      externalGroupName: true,
      externalKeywordId: true,
      active: true,
      lastPosition: true,
      prevPosition: true,
      bestPosition: true,
      lastUrl: true,
      lastCheckedAt: true,
    },
  });
  return NextResponse.json({ keywords: rows });
}

const AddSchema = z.object({
  keywords: z.union([z.string(), z.array(z.string())]),
  groupName: z.string().trim().min(1).max(100).default("Основная"),
});

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { siteId } = await params;
  const site = await getOwnedSite(userId, siteId);
  if (!site) return badRequest("TOPVISOR_PROJECT_NOT_FOUND");
  const binding = await getBinding(siteId);
  if (!binding?.externalProjectId) return badRequest("RANK_PROJECT_PARTIAL");

  const body = await req.json().catch(() => null);
  const parsed = AddSchema.safeParse(body);
  if (!parsed.success) return badRequest("INVALID_KEYWORDS", parsed.error.issues[0]?.message);

  const raw = Array.isArray(parsed.data.keywords) ? parsed.data.keywords.join("\n") : parsed.data.keywords;
  const { valid, duplicates } = parseKeywords(raw);
  if (valid.length === 0) return badRequest("INVALID_KEYWORDS", "no valid keywords");

  try {
    const svc = await getServiceForUser(userId);
    const stats = await svc.importKeywords(binding.externalProjectId, valid, parsed.data.groupName);

    const primary = binding.regions.find((r) => r.enabled) ?? binding.regions[0];
    const legacyDevice = primary ? deviceToLegacy(primary.device) : "desktop";
    const legacyCountry = (primary?.countryCode ?? "us").toLowerCase();
    const legacyLang = primary?.language ?? "en";

    let addedLocal = 0;
    for (const kw of valid) {
      try {
        await prisma.trackedKeyword.create({
          data: {
            siteId,
            keyword: kw,
            provider: "topvisor",
            rankProjectId: binding.id,
            externalGroupName: parsed.data.groupName,
            device: legacyDevice,
            country: legacyCountry,
            lang: legacyLang,
            active: true,
          },
        });
        addedLocal++;
      } catch {
        /* unique [rankProjectId, keyword] — already tracked */
      }
    }
    return NextResponse.json({
      importedRemote: stats,
      localDuplicates: duplicates,
      addedLocal,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const DeleteSchema = z.object({
  ids: z.array(z.string()).min(1).max(2000),
  // remote deletion from Topvisor is a separate, explicit flag (default: local only)
  remote: z.boolean().optional(),
});

export async function DELETE(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { siteId } = await params;
  const site = await getOwnedSite(userId, siteId);
  if (!site) return badRequest("TOPVISOR_PROJECT_NOT_FOUND");
  const binding = await getBinding(siteId);
  if (!binding) return badRequest("RANK_PROJECT_PARTIAL");

  const body = await req.json().catch(() => null);
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) return badRequest("INVALID_REQUEST", parsed.error.issues[0]?.message);

  // Scope strictly to this project's keywords (ownership already checked via site).
  const res = await prisma.trackedKeyword.deleteMany({
    where: { id: { in: parsed.data.ids }, rankProjectId: binding.id },
  });
  // NOTE: remote Topvisor deletion is intentionally deferred to a verified del endpoint.
  return NextResponse.json({ deletedLocal: res.count, remoteDeletionRequested: !!parsed.data.remote });
}
