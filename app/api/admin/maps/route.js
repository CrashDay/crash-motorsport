import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { loadMapPages, normalizeMapPageInput, saveMapPage } from "@/lib/map-pages";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const maps = await loadMapPages();
  return NextResponse.json({ maps }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const input = normalizeMapPageInput(body);
    await saveMapPage(input);
    return NextResponse.json({
      ok: true,
      map: {
        id: input.trackId,
        title: input.title,
        href: `/maps/${input.trackId}`,
        adminHref: `/admin/maps`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 400 });
  }
}
