import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import sebringAreas from "@/data/sebring-photo-areas.json";
import { assignAreaAsset, getDb, removeAreaAsset } from "@/lib/db";

const VALID_TRACKS = {
  sebring: new Set(sebringAreas.map((a) => a.id)),
};

let postgresReady = false;

async function ensurePostgresSchema() {
  if (postgresReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS photo_area_assets (
      track_id TEXT NOT NULL,
      area_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      asset_name TEXT,
      thumb_url TEXT,
      full_url TEXT,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (track_id, area_id, asset_id)
    )
  `;
  postgresReady = true;
}

function hasPostgresConfig() {
  const connection =
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL;
  if (connection && !process.env.POSTGRES_URL) {
    process.env.POSTGRES_URL = connection;
  }
  return Boolean(connection);
}

function isVercelRuntime() {
  return process.env.VERCEL === "1" || String(process.env.VERCEL || "").toLowerCase() === "true";
}

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
  const canonicalAssetId = [assetId, fullUrl || thumbUrl].filter(Boolean).join("::");

  if (!trackId || !VALID_TRACKS[trackId]) {
    return NextResponse.json({ error: "Unsupported trackId" }, { status: 400 });
  }
  if (!areaId || !VALID_TRACKS[trackId].has(areaId)) {
    return NextResponse.json({ error: "Invalid areaId" }, { status: 400 });
  }
  if (!assetId || !thumbUrl || !fullUrl || !canonicalAssetId) {
    return NextResponse.json({ error: "asset.id, asset.thumbUrl, and asset.fullUrl are required" }, { status: 400 });
  }

  try {
    const assignedAt = new Date().toISOString();
    if (hasPostgresConfig()) {
      await ensurePostgresSchema();
      await sql`
        INSERT INTO photo_area_assets (track_id, area_id, asset_id, asset_name, thumb_url, full_url, assigned_at)
        VALUES (${trackId}, ${areaId}, ${canonicalAssetId}, ${assetName || assetId}, ${thumbUrl}, ${fullUrl}, ${assignedAt})
        ON CONFLICT (track_id, area_id, asset_id) DO UPDATE SET
          asset_name = EXCLUDED.asset_name,
          thumb_url = EXCLUDED.thumb_url,
          full_url = EXCLUDED.full_url,
          assigned_at = EXCLUDED.assigned_at
      `;
    } else if (!isVercelRuntime()) {
      const db = getDb();
      assignAreaAsset(db, {
        track_id: trackId,
        area_id: areaId,
        asset_id: canonicalAssetId,
        asset_name: assetName || assetId,
        thumb_url: thumbUrl,
        full_url: fullUrl,
        assigned_at: assignedAt,
      });
    } else {
      return NextResponse.json(
        { error: "Durable storage is not configured. Set a Postgres connection in Vercel env vars." },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error("[photo-area-assignments:POST] storage error", error);
    return NextResponse.json(
      { error: "Assignment storage unavailable in this environment. Configure Vercel Postgres for durable persistence." },
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
    if (hasPostgresConfig()) {
      await ensurePostgresSchema();
      await sql`
        DELETE FROM photo_area_assets
        WHERE track_id = ${trackId} AND area_id = ${areaId} AND asset_id = ${assetId}
      `;
    } else if (!isVercelRuntime()) {
      const db = getDb();
      removeAreaAsset(db, { track_id: trackId, area_id: areaId, asset_id: assetId });
    } else {
      return NextResponse.json(
        { error: "Durable storage is not configured. Set a Postgres connection in Vercel env vars." },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error("[photo-area-assignments:DELETE] storage error", error);
    return NextResponse.json(
      { error: "Assignment storage unavailable in this environment. Configure Vercel Postgres for durable persistence." },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true });
}
