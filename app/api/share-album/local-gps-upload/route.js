import { NextResponse } from "next/server";
import { readServerPhotoMetadata } from "@/lib/server-image-metadata";

const VALID_SERIES = new Set(["imsa", "wec", "f1"]);

export const runtime = "nodejs";

export async function POST(request) {
  let form = null;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const series = String(form.get("series") || "").trim().toLowerCase();
  const slug = String(form.get("slug") || "").trim();
  const mode = String(form.get("mode") || "extract").trim().toLowerCase();
  const files = form.getAll("files");

  if (!VALID_SERIES.has(series) || !slug) {
    return NextResponse.json({ error: "series and slug are required" }, { status: 400 });
  }
  if (!files.length) {
    return NextResponse.json({ error: "No files were uploaded" }, { status: 400 });
  }

  try {
    const localFiles = [];
    const debugSamples = [];
    for (const file of files) {
      if (!file || typeof file.arrayBuffer !== "function") continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      const metadata = await readServerPhotoMetadata(buffer, file.name);
      if (!metadata?.unsupported) {
        localFiles.push(metadata);
        if (debugSamples.length < 5) {
          debugSamples.push({
            fileName: metadata.fileName,
            captureTime: metadata.captureTime || null,
            gps: metadata.gps || null,
            debug: metadata.debug || null,
          });
        }
      }
    }

    if (!localFiles.length) {
      return NextResponse.json({ error: "No supported files were uploaded" }, { status: 400 });
    }

    if (mode !== "extract") {
      return NextResponse.json({ error: "Unsupported mode" }, { status: 400 });
    }

    return NextResponse.json({
      metadataSource: "server-upload",
      localFiles,
      supportedFileCount: localFiles.length,
      debugSamples,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
