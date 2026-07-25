// GET /api/topvisor/regions?search=&country=  — Topvisor region autocomplete for Google.
// Session + connection required. Server-side TTL cache; client debounces.

import { NextResponse } from "next/server";
import { getSessionUserId, unauthorized, errorResponse } from "@/lib/topvisor/apiAuth";
import { getServiceForUser } from "@/lib/topvisor/connection";
import { getCachedRegions, setCachedRegions } from "@/lib/topvisor/regionCache";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const url = new URL(req.url);
  const search = (url.searchParams.get("search") ?? "").trim();
  const country = url.searchParams.get("country")?.trim() || undefined;
  if (search.length < 2) return NextResponse.json({ regions: [] });

  const cached = getCachedRegions(search, country);
  if (cached) return NextResponse.json({ regions: cached, cached: true });

  try {
    const svc = await getServiceForUser(userId);
    const regions = await svc.searchRegions(search, { countryCode: country, limit: 20 });
    setCachedRegions(search, country, regions);
    return NextResponse.json({ regions });
  } catch (err) {
    return errorResponse(err);
  }
}
