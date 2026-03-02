import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getDb, getDbPath, upsertPhotoAsset, upsertRegionPin, upsertPinAsset, detachMissingPinAssets } from "@/lib/db";
import { getRegionIdFromAltText } from "@/lib/region-matching";
import { getRegionById } from "@/lib/regions";

function readMockAssets() {
  const filePath = path.join(process.cwd(), "data", "mock-lightroom-assets.json");
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId");

  if (!trackId) {
    return NextResponse.json({ error: "trackId is required" }, { status: 400 });
  }

  const assets = readMockAssets().filter((a) => a.track_id === trackId);
  const db = getDb();
  const now = new Date().toISOString();

  let imported = 0;
  let matched = 0;
  let pinned = 0;

  const matchedAssetIds = [];
  let regionPinId = null;

  for (const asset of assets) {
    imported += 1;
    const regionId = getRegionIdFromAltText(trackId, asset.alt_text);

    upsertPhotoAsset(db, {
      asset_id: asset.asset_id,
      track_id: trackId,
      capture_time: asset.capture_time,
      alt_text_snapshot: asset.alt_text || "",
      thumb_url: asset.thumb_url,
      full_url: asset.full_url,
      last_synced_at: now,
      catalog_id: null,
    });

    if (regionId) {
      matched += 1;
      matchedAssetIds.push(asset.asset_id);
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

        const sortOrder = Number.isFinite(Date.parse(asset.capture_time))
          ? Date.parse(asset.capture_time)
          : 0;

        upsertPinAsset(db, {
          pin_id: regionPinId,
          asset_id: asset.asset_id,
          sort_order: sortOrder,
          added_at: now,
        });
        pinned += 1;
      }
    }
  }

  if (regionPinId) {
    detachMissingPinAssets(db, regionPinId, matchedAssetIds);
  }

  const { searchParams: respParams } = new URL(request.url);
  const debug = respParams.get("debug");
  if (debug === "1") {
    const totalPins = db.prepare("SELECT COUNT(*) AS c FROM photo_pins").get()?.c || 0;
    const trackPins = db
      .prepare("SELECT COUNT(*) AS c FROM photo_pins WHERE track_id = ?")
      .get(trackId)?.c || 0;
    return NextResponse.json({
      imported,
      matched,
      pinned,
      db_path: getDbPath(),
      total_pins: totalPins,
      track_pins: trackPins,
      cwd: process.cwd(),
    });
  }

  return NextResponse.json({ imported, matched, pinned });
}
