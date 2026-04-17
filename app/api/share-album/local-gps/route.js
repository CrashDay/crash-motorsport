import { NextResponse } from "next/server";
import { normalizeLocalGpsFiles, runLocalGpsImport } from "@/lib/local-gps-import";

const VALID_SERIES = new Set(["imsa", "wec", "f1"]);

export async function POST(request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const series = String(body?.series || "").trim().toLowerCase();
  const slug = String(body?.slug || "").trim();
  const trackId = String(body?.trackId || "sebring").trim().toLowerCase();
  const dryRun = Boolean(body?.dryRun);
  const localFiles = normalizeLocalGpsFiles(body?.localFiles);

  if (!VALID_SERIES.has(series) || !slug) {
    return NextResponse.json({ error: "series and slug are required" }, { status: 400 });
  }
  if (!localFiles.length) {
    return NextResponse.json({ error: "No local files were provided" }, { status: 400 });
  }

  try {
    const summary = await runLocalGpsImport({
      series,
      slug,
      trackId,
      localFiles,
      dryRun,
      metadataSource: "browser",
    });
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
