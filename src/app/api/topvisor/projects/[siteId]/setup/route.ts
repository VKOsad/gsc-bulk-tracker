// POST /api/topvisor/projects/[siteId]/setup
// Idempotent create-or-link + regions + keyword import. All FREE operations — no
// paid check is ever launched here. Session + Site ownership required.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId, unauthorized, badRequest, errorResponse } from "@/lib/topvisor/apiAuth";
import { setupProject } from "@/lib/topvisor/projectSetup";
import { canConnectTopvisor } from "@/lib/topvisor/featureFlag";
import { parseKeywords } from "@/lib/topvisor/keywordParser";

export const runtime = "nodejs";

const RegionSchema = z.object({
  regionKey: z.number().int().positive(),
  regionName: z.string().max(200).optional(),
  countryCode: z.string().max(4).optional(),
  language: z.string().min(2).max(5),
  device: z.number().int().min(0).max(2),
  depth: z.number().int().min(1).max(5),
});

const SetupSchema = z.object({
  mode: z.enum(["create", "link"]),
  externalProjectId: z.string().max(32).optional(),
  projectName: z.string().max(200).optional(),
  regions: z.array(RegionSchema).min(1).max(10),
  keywords: z.array(z.string()).max(5000).default([]),
  groupName: z.string().trim().min(1).max(100).default("Основная"),
});

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  if (!canConnectTopvisor()) return badRequest("TOPVISOR_ENCRYPTION_NOT_CONFIGURED");

  const { siteId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = SetupSchema.safeParse(body);
  if (!parsed.success) return badRequest("INVALID_SETUP", parsed.error.issues[0]?.message);
  if (parsed.data.mode === "link" && !parsed.data.externalProjectId) {
    return badRequest("INVALID_SETUP", "externalProjectId required for link");
  }

  // Re-normalize keywords server-side (defense in depth) before importing.
  const cleaned = parseKeywords(parsed.data.keywords.join("\n")).valid;

  try {
    const result = await setupProject(userId, siteId, {
      mode: parsed.data.mode,
      externalProjectId: parsed.data.externalProjectId,
      projectName: parsed.data.projectName,
      regions: parsed.data.regions,
      keywords: cleaned,
      groupName: parsed.data.groupName,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
