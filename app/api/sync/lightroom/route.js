import { NextResponse } from "next/server";
import {
  getDb,
  upsertPhotoAsset,
  upsertRegionPin,
  upsertPinAsset,
  detachMissingPinAssets,
} from "@/lib/db";
import { getRegionIdFromAltText } from "@/lib/region-matching";
import { getRegionById } from "@/lib/regions";
import {
  listCatalogs,
  listAlbums,
  listAssets,
  getAsset,
  fetchXmp,
  extractAltTextFromXmp,
} from "@/lib/lightroom-client";
import { getProjectorForTrack } from "@/lib/geo-projector";
import { upsertGpsPin } from "@/lib/db";

function pickCaptureTime(asset) {
  return (
    asset?.capture_time ||
    asset?.payload?.captureDate ||
    asset?.payload?.capture_date ||
    asset?.payload?.dateCreated ||
    asset?.created_at ||
    asset?.createdAt ||
    new Date().toISOString()
  );
}

function normalizeList(response) {
  if (!response) return [];
  if (Array.isArray(response.resources)) return response.resources;
  if (Array.isArray(response.albums)) return response.albums;
  if (Array.isArray(response.assets)) return response.assets;
  if (Array.isArray(response.data)) return response.data;
  return [];
}

export async function POST(request) {
  if (process.env.USE_MOCK_LIGHTROOM === "true") {
    return NextResponse.json({ error: "Mock mode enabled" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId");

  if (!trackId) {
    return NextResponse.json({ error: "trackId is required" }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();
  const projector = getProjectorForTrack(trackId);

  let catalogResp;
  try {
    catalogResp = await listCatalogs();
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 401 });
  }
  const catalogs = normalizeList(catalogResp);
  const catalog = catalogs[0];
  if (!catalog?.id) {
    return NextResponse.json({ error: "No Lightroom catalog found" }, { status: 500 });
  }

  let albumId = process.env.LIGHTROOM_PUBLISH_ALBUM_ID || null;
  if (!albumId) {
    const albumName = process.env.LIGHTROOM_PUBLISH_ALBUM_NAME;
    if (albumName) {
      const albumResp = await listAlbums(catalog.id);
      const albums = normalizeList(albumResp);
      const match = albums.find((a) => String(a?.name || a?.title || "").trim() === albumName);
      if (match?.id) albumId = match.id;
    }
  }

  const limit = Number(process.env.LIGHTROOM_SYNC_LIMIT || 50);
  const assetsResp = await listAssets({
    catalogId: catalog.id,
    albumId,
    limit,
  });
  const assets = normalizeList(assetsResp);

  let imported = 0;
  let matched = 0;
  let pinned = 0;
  let detached = 0;

  const matchedAssetIds = [];
  let regionPinId = null;

  for (const asset of assets) {
    imported += 1;
    const assetId = asset?.id || asset?.asset_id;
    if (!assetId) continue;

    let assetDetail = asset;
    if (!asset?.links || !asset?.payload) {
      try {
        assetDetail = await getAsset(catalog.id, assetId);
      } catch {
        assetDetail = asset;
      }
    }

    let altText = assetDetail?.payload?.description || "";
    try {
      const xmp = await fetchXmp(catalog.id, assetId, assetDetail);
      const xmpAlt = extractAltTextFromXmp(xmp);
      if (xmpAlt) altText = xmpAlt;
    } catch {
      // ignore XMP fetch errors; fall back to metadata description
    }

    const gpsCandidate =
      assetDetail?.payload?.gps ||
      assetDetail?.payload?.location ||
      assetDetail?.payload?.coordinate ||
      null;
    const gpsLat = Number(gpsCandidate?.latitude ?? assetDetail?.payload?.latitude);
    const gpsLon = Number(gpsCandidate?.longitude ?? assetDetail?.payload?.longitude);
    const hasGps = Number.isFinite(gpsLat) && Number.isFinite(gpsLon);

    const captureTime = pickCaptureTime(assetDetail);

    upsertPhotoAsset(db, {
      asset_id: assetId,
      track_id: trackId,
      capture_time: captureTime,
      alt_text_snapshot: altText || "",
      thumb_url: `/api/rendition?assetId=${encodeURIComponent(assetId)}&size=thumb`,
      full_url: `/api/rendition?assetId=${encodeURIComponent(assetId)}&size=large`,
      last_synced_at: now,
      catalog_id: catalog.id,
    });

    if (hasGps && projector) {
      const pos = projector(gpsLon, gpsLat);
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
          const sortOrder = Number.isFinite(Date.parse(captureTime))
            ? Date.parse(captureTime)
            : 0;
          upsertPinAsset(db, {
            pin_id: regionPinId,
            asset_id: assetId,
            sort_order: sortOrder,
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
