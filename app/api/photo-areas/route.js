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

async function withPgClient(fn) {
  const connectionString = getPostgresConnectionString();
  if (!connectionString) throw new Error("Missing Postgres connection string");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
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
      race TEXT,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (track_id, area_id, asset_id)
    )
  `);
  await runPgQuery(`
    ALTER TABLE photo_area_assets
    ADD COLUMN IF NOT EXISTS year INTEGER
  `);
  await runPgQuery(`
    ALTER TABLE photo_area_assets
    ADD COLUMN IF NOT EXISTS race TEXT
  `);
  await runPgQuery(`
    CREATE TABLE IF NOT EXISTS photo_areas (
      track_id TEXT NOT NULL,
      area_id TEXT NOT NULL,
      title TEXT NOT NULL,
      north DOUBLE PRECISION NOT NULL,
      south DOUBLE PRECISION NOT NULL,
      east DOUBLE PRECISION NOT NULL,
      west DOUBLE PRECISION NOT NULL,
      center_lat DOUBLE PRECISION NOT NULL,
      center_lng DOUBLE PRECISION NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (track_id, area_id)
    )
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
  if (source.includes("wec-sebring-2023") || source.includes("/photos/wec_1000/")) return 2023;
  if (source.includes("sebring_2022") || source.includes("sebring-2022")) return 2022;
  if (source.includes("sebring2023") || source.includes("sebring_2023") || source.includes("sebring-2023")) return 2023;
  const match = source.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const n = Number(match[0]);
  return n >= 1900 && n <= 2100 ? n : null;
}

function inferRaceFromPhotoLike(photo) {
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
  if (source.includes("wec-sebring-2023") || source.includes("/photos/wec_1000/")) return "1000 Miles of Sebring";
  return "12 Hours of Sebring";
}

function normalizePhotoYear(raw, fallbackPhoto) {
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1900 && n <= 2100) return n;
  return inferYearFromPhotoLike(fallbackPhoto);
}

function normalizePhotoRace(raw, fallbackPhoto) {
  const race = String(raw || "").trim();
  if (race) return race;
  return inferRaceFromPhotoLike(fallbackPhoto);
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
      race: normalizePhotoRace(r.race, r),
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

function normalizeAreaDefinition(rawArea) {
  if (!rawArea || typeof rawArea !== "object") return null;
  const id = String(rawArea.id || "").trim();
  if (!id) return null;
  const title = String(rawArea.title || id).trim();
  const north = Number(rawArea?.bounds?.north);
  const south = Number(rawArea?.bounds?.south);
  const east = Number(rawArea?.bounds?.east);
  const west = Number(rawArea?.bounds?.west);
  if (![north, south, east, west].every(Number.isFinite)) return null;
  const bounds = {
    north: Math.max(north, south),
    south: Math.min(north, south),
    east: Math.max(east, west),
    west: Math.min(east, west),
  };
  let centerLat = Number(rawArea?.center?.[0]);
  let centerLng = Number(rawArea?.center?.[1]);
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
    centerLat = (bounds.north + bounds.south) / 2;
    centerLng = (bounds.east + bounds.west) / 2;
  }
  return {
    id,
    title,
    bounds,
    center: [Number(centerLat.toFixed(6)), Number(centerLng.toFixed(6))],
    defaultPhoto: rawArea.defaultPhoto || null,
  };
}

async function loadTrackAreas(trackId, track) {
  if (!hasPostgresConfig()) return track.areas;
  await ensurePostgresSchema();
  const { rows } = await runPgQuery(
    `
      SELECT area_id, title, north, south, east, west, center_lat, center_lng
      FROM photo_areas
      WHERE track_id = $1
      ORDER BY area_id
    `,
    [trackId]
  );
  if (!Array.isArray(rows) || rows.length === 0) return track.areas;
  const synced = rows
    .map((r) =>
      normalizeAreaDefinition({
        id: r.area_id,
        title: r.title,
        bounds: {
          north: r.north,
          south: r.south,
          east: r.east,
          west: r.west,
        },
        center: [r.center_lat, r.center_lng],
      })
    )
    .filter(Boolean);
  if (!synced.length) return track.areas;
  const defaultsById = new Map(
    track.areas.filter((a) => a?.defaultPhoto).map((a) => [String(a.id), a.defaultPhoto])
  );
  return synced.map((a) => ({
    ...a,
    defaultPhoto: defaultsById.get(String(a.id)) || null,
  }));
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
        SELECT track_id, area_id, asset_id, asset_name, thumb_url, full_url, year, race, assigned_at
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
  let trackAreas = track.areas;
  try {
    trackAreas = await loadTrackAreas(trackId, track);
  } catch (error) {
    console.error("[photo-areas:GET] area-definition load error", error);
    trackAreas = track.areas;
  }

  assignedByArea = keepMostRecentByAsset(assignedByArea);
  const areas = trackAreas.map((a) => ({
    ...a,
    photos: assignedByArea[a.id]?.length
      ? assignedByArea[a.id]
      : a.defaultPhoto
        ? [{
            id: a.defaultPhoto.id,
            name: a.title,
            thumbUrl: a.defaultPhoto.src,
            fullUrl: a.defaultPhoto.src,
            year: 2023,
            race: "12 Hours of Sebring",
          }]
        : [],
  }));
  const staticAreaIds = new Set(trackAreas.map((a) => a.id));
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

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const trackId = String(body?.trackId || "").trim().toLowerCase();
  const track = TRACKS[trackId];
  if (!track) {
    return NextResponse.json({ error: "Unsupported trackId" }, { status: 400 });
  }

  if (!hasPostgresConfig()) {
    return NextResponse.json({ error: "Area sync storage is not configured" }, { status: 400 });
  }

  const inputAreas = Array.isArray(body?.areas) ? body.areas : [];
  const normalized = inputAreas.map(normalizeAreaDefinition).filter(Boolean);
  if (!normalized.length) {
    return NextResponse.json({ error: "No valid areas provided" }, { status: 400 });
  }

  try {
    await ensurePostgresSchema();
    await withPgClient(async (client) => {
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM photo_areas WHERE track_id = $1", [trackId]);
        const updatedAt = new Date().toISOString();
        for (const area of normalized) {
          await client.query(
            `
              INSERT INTO photo_areas (track_id, area_id, title, north, south, east, west, center_lat, center_lng, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `,
            [
              trackId,
              area.id,
              area.title,
              area.bounds.north,
              area.bounds.south,
              area.bounds.east,
              area.bounds.west,
              area.center[0],
              area.center[1],
              updatedAt,
            ]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    return NextResponse.json({ ok: true, count: normalized.length });
  } catch (error) {
    console.error("[photo-areas:POST] area-definition save error", error);
    return NextResponse.json({ error: "Failed to save area definitions" }, { status: 500 });
  }
}
