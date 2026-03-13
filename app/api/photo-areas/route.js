import { NextResponse } from "next/server";
import { Client } from "pg";
import sebringAreas from "@/data/sebring-photo-areas.json";
import { getAreaAssetsByTrack, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TRACKS = {
  sebring: {
    id: "sebring",
    name: "Sebring International Raceway",
    areas: sebringAreas,
  },
};

let postgresReady = false;

function getPostgresConnectionString() {
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.PRISMA_DATABASE_URL ||
    process.env.DATABASE_URL ||
    ""
  );
}

async function runPgQuery(text, values = []) {
  const connectionString = getPostgresConnectionString();
  if (!connectionString) throw new Error("Missing Postgres connection string");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await client.query(text, values);
  } finally {
    await client.end();
  }
}

async function ensurePostgresSchema() {
  if (postgresReady) return;
  await runPgQuery(`
    CREATE TABLE IF NOT EXISTS photo_area_assets (
      track_id TEXT NOT NULL,
      area_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      asset_name TEXT,
      thumb_url TEXT,
      full_url TEXT,
      year INTEGER,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (track_id, area_id, asset_id)
    )
  `);
  await runPgQuery(`
    ALTER TABLE photo_area_assets
    ADD COLUMN IF NOT EXISTS year INTEGER
  `);
  postgresReady = true;
}

function hasPostgresConfig() {
  const connection = getPostgresConnectionString();
  if (connection && !process.env.POSTGRES_URL) {
    process.env.POSTGRES_URL = connection;
  }
  return Boolean(connection);
}

function isVercelRuntime() {
  return process.env.VERCEL === "1" || String(process.env.VERCEL || "").toLowerCase() === "true";
}

function inferYearFromPhotoLike(photo) {
  const source = [
    photo?.id,
    photo?.name,
    photo?.thumbUrl,
    photo?.fullUrl,
    photo?.asset_id,
    photo?.asset_name,
    photo?.thumb_url,
    photo?.full_url,
  ]
    .map((v) => String(v || ""))
    .join(" ")
    .toLowerCase();
  if (source.includes("sebring_2022") || source.includes("sebring-2022")) return 2022;
  if (source.includes("sebring2023") || source.includes("sebring_2023") || source.includes("sebring-2023")) return 2023;
  const match = source.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const n = Number(match[0]);
  return n >= 1900 && n <= 2100 ? n : null;
}

function normalizePhotoYear(raw, fallbackPhoto) {
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1900 && n <= 2100) return n;
  return inferYearFromPhotoLike(fallbackPhoto);
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
      year: normalizePhotoYear(r.year, r),
      assignedAt: r.assigned_at,
    });
  }
  return byArea;
}

function keepMostRecentByAsset(assignedByArea) {
  const rows = [];
  for (const [areaId, photos] of Object.entries(assignedByArea || {})) {
    for (const p of Array.isArray(photos) ? photos : []) {
      rows.push({
        areaId,
        photo: p,
        assignedAtTs: Date.parse(String(p?.assignedAt || "")) || 0,
      });
    }
  }
  rows.sort((a, b) => b.assignedAtTs - a.assignedAtTs);

  const seenAssetIds = new Set();
  const out = {};
  for (const row of rows) {
    const assetId = String(row.photo?.id || "").trim();
    if (!assetId || seenAssetIds.has(assetId)) continue;
    seenAssetIds.add(assetId);
    if (!out[row.areaId]) out[row.areaId] = [];
    out[row.areaId].push(row.photo);
  }
  return out;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const trackId = String(searchParams.get("trackId") || "").trim().toLowerCase();

  if (!trackId) {
    return NextResponse.json(
      {
        tracks: Object.values(TRACKS).map((t) => ({ id: t.id, name: t.name })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const track = TRACKS[trackId];
  if (!track) {
    return NextResponse.json({ error: "Unsupported trackId" }, { status: 400 });
  }

  let assignedByArea = {};
  try {
    if (hasPostgresConfig()) {
      await ensurePostgresSchema();
      const { rows } = await runPgQuery(
        `
        SELECT track_id, area_id, asset_id, asset_name, thumb_url, full_url, year, assigned_at
        FROM photo_area_assets
        WHERE track_id = $1
        ORDER BY assigned_at DESC
      `,
        [trackId]
      );
      assignedByArea = groupAssignedRows(rows);
    } else if (!isVercelRuntime()) {
      const db = getDb();
      assignedByArea = getAreaAssetsByTrack(db, trackId);
    } else {
      assignedByArea = {};
    }
  } catch (error) {
    console.error("[photo-areas:GET] storage error", error);
    assignedByArea = {};
  }
  assignedByArea = keepMostRecentByAsset(assignedByArea);
  const areas = track.areas.map((a) => ({
    ...a,
    photos: assignedByArea[a.id]?.length
      ? assignedByArea[a.id]
      : a.defaultPhoto
        ? [{ id: a.defaultPhoto.id, name: a.title, thumbUrl: a.defaultPhoto.src, fullUrl: a.defaultPhoto.src, year: 2023 }]
        : [],
  }));
  const staticAreaIds = new Set(track.areas.map((a) => a.id));
  for (const [areaId, photos] of Object.entries(assignedByArea)) {
    if (staticAreaIds.has(areaId)) continue;
    areas.push({
      id: areaId,
      title: areaId,
      photos: Array.isArray(photos) ? photos : [],
    });
  }

  return NextResponse.json(
    {
      track: { id: track.id, name: track.name },
      areas,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
