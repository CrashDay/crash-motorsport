import { NextResponse } from "next/server";
import sebringAreas from "@/data/sebring-photo-areas.json";
import { assignAreaAsset, getDb, removeAreaAsset } from "@/lib/db";

const VALID_TRACKS = {
  sebring: new Set(sebringAreas.map((a) => a.id)),
};

export async function POST(request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackId = String(body?.trackId || "").trim().toLowerCase();
  const areaId = String(body?.areaId || "").trim();
  const asset = body?.asset || {};
  const assetId = String(asset.id || "").trim();
  const assetName = String(asset.name || "").trim();
  const thumbUrl = String(asset.thumbUrl || "").trim();
  const fullUrl = String(asset.fullUrl || "").trim();

  if (!trackId || !VALID_TRACKS[trackId]) {
    return NextResponse.json({ error: "Unsupported trackId" }, { status: 400 });
  }
  if (!areaId || !VALID_TRACKS[trackId].has(areaId)) {
    return NextResponse.json({ error: "Invalid areaId" }, { status: 400 });
  }
  if (!assetId || !thumbUrl || !fullUrl) {
    return NextResponse.json({ error: "asset.id, asset.thumbUrl, and asset.fullUrl are required" }, { status: 400 });
  }

  try {
    const db = getDb();
    assignAreaAsset(db, {
      track_id: trackId,
      area_id: areaId,
      asset_id: assetId,
      asset_name: assetName || assetId,
      thumb_url: thumbUrl,
      full_url: fullUrl,
      assigned_at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Assignment storage unavailable in this environment" },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackId = String(body?.trackId || "").trim().toLowerCase();
  const areaId = String(body?.areaId || "").trim();
  const assetId = String(body?.assetId || "").trim();

  if (!trackId || !VALID_TRACKS[trackId]) {
    return NextResponse.json({ error: "Unsupported trackId" }, { status: 400 });
  }
  if (!areaId || !VALID_TRACKS[trackId].has(areaId)) {
    return NextResponse.json({ error: "Invalid areaId" }, { status: 400 });
  }
  if (!assetId) {
    return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  }

  try {
    const db = getDb();
    removeAreaAsset(db, { track_id: trackId, area_id: areaId, asset_id: assetId });
  } catch {
    return NextResponse.json(
      { error: "Assignment storage unavailable in this environment" },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true });
}
