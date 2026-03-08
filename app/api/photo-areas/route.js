import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import sebringAreas from "@/data/sebring-photo-areas.json";
import { getAreaAssetsByTrack, getDb } from "@/lib/db";

const TRACKS = {
  sebring: {
    id: "sebring",
    name: "Sebring International Raceway",
    areas: sebringAreas,
  },
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
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL);
}

function groupAssignedRows(rows) {
  const byArea = {};
  for (const r of rows) {
    if (!byArea[r.area_id]) byArea[r.area_id] = [];
    byArea[r.area_id].push({
      id: r.asset_id,
      name: r.asset_name || r.asset_id,
      thumbUrl: r.thumb_url,
      fullUrl: r.full_url,
      assignedAt: r.assigned_at,
    });
  }
  return byArea;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const trackId = String(searchParams.get("trackId") || "").trim().toLowerCase();

  if (!trackId) {
    return NextResponse.json({
      tracks: Object.values(TRACKS).map((t) => ({ id: t.id, name: t.name })),
    });
  }

  const track = TRACKS[trackId];
  if (!track) {
    return NextResponse.json({ error: "Unsupported trackId" }, { status: 400 });
  }

  let assignedByArea = {};
  try {
    if (hasPostgresConfig()) {
      await ensurePostgresSchema();
      const { rows } = await sql`
        SELECT track_id, area_id, asset_id, asset_name, thumb_url, full_url, assigned_at
        FROM photo_area_assets
        WHERE track_id = ${trackId}
        ORDER BY assigned_at DESC
      `;
      assignedByArea = groupAssignedRows(rows);
    } else {
      const db = getDb();
      assignedByArea = getAreaAssetsByTrack(db, trackId);
    }
  } catch (error) {
    console.error("[photo-areas:GET] storage error", error);
    // In environments without writable local DB (e.g. some serverless deployments),
    // return static areas so assignment UI still works for area selection.
    assignedByArea = {};
  }
  const areas = track.areas.map((a) => ({
    ...a,
    photos: assignedByArea[a.id]?.length
      ? assignedByArea[a.id]
      : a.defaultPhoto
        ? [{ id: a.defaultPhoto.id, name: a.title, thumbUrl: a.defaultPhoto.src, fullUrl: a.defaultPhoto.src }]
        : [],
  }));

  return NextResponse.json({
    track: { id: track.id, name: track.name },
    areas,
  });
}
