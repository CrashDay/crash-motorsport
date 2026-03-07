import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  getDb,
  upsertPhotoAsset,
  upsertRegionPin,
  upsertPinAsset,
  detachMissingPinAssets,
  upsertGpsPin,
} from "@/lib/db";
import { getRegionIdFromAltText } from "@/lib/region-matching";
import { getRegionById } from "@/lib/regions";
import { extractAltTextFromFile } from "@/lib/xmp-utils";
import { readGpsFromExiftool } from "@/lib/exiftool-gps";
import { getProjectorForTrack } from "@/lib/geo-projector";

function listImages(dir) {
  const files = fs.readdirSync(dir);
  return files.filter((name) => /\.(jpe?g|png|webp)$/i.test(name));
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId");

  if (!trackId) {
    return NextResponse.json({ error: "trackId is required" }, { status: 400 });
  }

  const root = process.env.LOCAL_EXPORTS_ROOT
    ? path.resolve(process.env.LOCAL_EXPORTS_ROOT)
    : path.join(process.cwd(), "data", "local-exports");
  const folders = ["imsa", "f1"];
  const files = [];

  for (const folder of folders) {
    const dir = path.join(root, folder);
    if (!fs.existsSync(dir)) continue;
    for (const name of listImages(dir)) {
      files.push({ folder, name, abs: path.join(dir, name) });
    }
  }

  const db = getDb();
  const now = new Date().toISOString();
  const projector = getProjectorForTrack(trackId);

  let imported = 0;
  let matched = 0;
  let pinned = 0;
  let detached = 0;

  const matchedAssetIds = [];
  let regionPinId = null;

  for (const file of files) {
    const assetId = `local:${file.folder}/${file.name}`;
    const altText = extractAltTextFromFile(file.abs);
    const gps = readGpsFromExiftool(file.abs);
    const captureTime = now;

    imported += 1;

    upsertPhotoAsset(db, {
      asset_id: assetId,
      track_id: trackId,
      capture_time: captureTime,
      alt_text_snapshot: altText || "",
      thumb_url: `/photos/${file.folder}/${file.name}`,
      full_url: `/photos/${file.folder}/${file.name}`,
      last_synced_at: now,
      catalog_id: null,
    });

    if (gps && projector) {
      const pos = projector(gps.lon, gps.lat);
      const gpsPinId = `gps:${assetId}`;
      upsertGpsPin(db, {
        pin_id: gpsPinId,
        track_id: trackId,
        anchor_x: pos.x,
        anchor_y: pos.y,
        title: "GPS",
      });
      upsertPinAsset(db, {
        pin_id: gpsPinId,
        asset_id: assetId,
        sort_order: Date.parse(captureTime) || 0,
        added_at: now,
      });
      pinned += 1;
    } else {
      const regionId = getRegionIdFromAltText(trackId, altText);
      if (regionId) {
        matched += 1;
        matchedAssetIds.push(assetId);
        const region = getRegionById(regionId);
        if (region) {
          if (!regionPinId) {
            regionPinId = upsertRegionPin(db, {
              track_id: trackId,
              region_id: regionId,
              anchor_x: region.anchor?.x ?? 0,
              anchor_y: region.anchor?.y ?? 0,
              title: region.label,
            });
          }
          upsertPinAsset(db, {
            pin_id: regionPinId,
            asset_id: assetId,
            sort_order: Date.parse(captureTime) || 0,
            added_at: now,
          });
          pinned += 1;
        }
      }
    }
  }

  if (regionPinId) {
    const before = db
      .prepare("SELECT COUNT(*) AS c FROM pin_assets WHERE pin_id = ?")
      .get(regionPinId)?.c || 0;
    detachMissingPinAssets(db, regionPinId, matchedAssetIds);
    const after = db
      .prepare("SELECT COUNT(*) AS c FROM pin_assets WHERE pin_id = ?")
      .get(regionPinId)?.c || 0;
    detached = Math.max(0, before - after);
  }

  return NextResponse.json({
    imported_count: imported,
    matched_count: matched,
    pinned_count: pinned,
    detached_count: detached,
  });
}
