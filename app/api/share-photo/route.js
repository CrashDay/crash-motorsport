import crypto from "crypto";
import { NextResponse } from "next/server";
import sebringAreas from "@/data/sebring-photo-areas.json";
import { assignAreaAsset, getDb, upsertGpsPin, upsertPhotoAsset, upsertPinAsset } from "@/lib/db";
import { getProjectorForTrack } from "@/lib/geo-projector";

const TRACK_ID = "sebring";
const STATIC_AREA_IDS = new Set(sebringAreas.map((a) => a.id));

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeCaptureTime(value, fallbackIso) {
  const raw = String(value || "").trim();
  if (!raw) return fallbackIso;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function isValidAreaId(areaId) {
  if (!areaId) return false;
  if (STATIC_AREA_IDS.has(areaId)) return true;
  return areaId.startsWith("area-");
}

export async function POST(request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shortLink = normalizeUrl(body?.shortLink);
  const areaId = String(body?.areaId || "").trim();
  const nowIso = new Date().toISOString();
  const captureTime = normalizeCaptureTime(body?.captureTime, nowIso);
  const lat = parseOptionalNumber(body?.lat);
  const lng = parseOptionalNumber(body?.lng);
  const latInvalid = Number.isNaN(lat);
  const lngInvalid = Number.isNaN(lng);
  const hasLat = Number.isFinite(lat);
  const hasLng = Number.isFinite(lng);
  const hasLocation = hasLat && hasLng;

  if (!shortLink) {
    return NextResponse.json({ error: "A valid Lightroom shared short link is required" }, { status: 400 });
  }
  if (captureTime === null) {
    return NextResponse.json({ error: "captureTime must be a valid date/time" }, { status: 400 });
  }
  if (latInvalid || lngInvalid) {
    return NextResponse.json({ error: "lat/lng must be numeric values" }, { status: 400 });
  }
  if ((hasLat && !hasLng) || (hasLng && !hasLat)) {
    return NextResponse.json({ error: "Both lat and lng are required when location is provided" }, { status: 400 });
  }
  if (hasLocation) {
    if (lat < -90 || lat > 90) {
      return NextResponse.json({ error: "lat must be between -90 and 90" }, { status: 400 });
    }
    if (lng < -180 || lng > 180) {
      return NextResponse.json({ error: "lng must be between -180 and 180" }, { status: 400 });
    }
  }
  if (!hasLocation && !areaId) {
    return NextResponse.json({ error: "areaId is required when no location is provided" }, { status: 400 });
  }
  if (areaId && !isValidAreaId(areaId)) {
    return NextResponse.json({ error: "Invalid areaId" }, { status: 400 });
  }

  const db = getDb();
  const assetHash = crypto.createHash("sha1").update(shortLink).digest("hex").slice(0, 20);
  const assetId = `shared:${assetHash}`;
  const canonicalAreaAssetId = `${assetId}::${shortLink}`;

  upsertPhotoAsset(db, {
    asset_id: assetId,
    track_id: TRACK_ID,
    capture_time: captureTime,
    alt_text_snapshot: "Shared via Lightroom link",
    thumb_url: shortLink,
    full_url: shortLink,
    last_synced_at: nowIso,
    catalog_id: null,
  });

  let pinId = null;
  if (hasLocation) {
    const projector = getProjectorForTrack(TRACK_ID);
    if (!projector) {
      return NextResponse.json({ error: "Track projector unavailable" }, { status: 500 });
    }
    const pos = projector(lng, lat);
    pinId = `gps:${assetId}`;
    upsertGpsPin(db, {
      pin_id: pinId,
      track_id: TRACK_ID,
      anchor_x: pos.x,
      anchor_y: pos.y,
      title: "Shared Photo",
    });
    upsertPinAsset(db, {
      pin_id: pinId,
      asset_id: assetId,
      sort_order: Date.parse(captureTime) || Date.now(),
      added_at: nowIso,
    });
  }

  if (areaId) {
    db.prepare(
      `
        DELETE FROM photo_area_assets
        WHERE track_id = ? AND asset_id = ?
      `
    ).run(TRACK_ID, canonicalAreaAssetId);
    assignAreaAsset(db, {
      track_id: TRACK_ID,
      area_id: areaId,
      asset_id: canonicalAreaAssetId,
      asset_name: "Shared Lightroom Photo",
      thumb_url: shortLink,
      full_url: shortLink,
      assigned_at: nowIso,
    });
  }

  return NextResponse.json({
    ok: true,
    assetId,
    pinId,
    hasLocation,
    assignedAreaId: areaId || null,
  });
}
