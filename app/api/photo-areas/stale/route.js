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

function hasPostgresConfig() {
  return Boolean(getPostgresConnectionString());
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

function extractSharedAlbumAssetId(rawAssetId) {
  const value = String(rawAssetId || "").trim();
  const marker = "::";
  const markerIndex = value.indexOf(marker);
  const candidate = markerIndex >= 0 ? value.slice(0, markerIndex) : value;
  return candidate.startsWith("shared-album:") ? candidate : "";
}

function getAreaTitleMap(track) {
  const map = new Map();
  for (const area of Array.isArray(track?.areas) ? track.areas : []) {
    const id = String(area?.id || "").trim();
    if (!id) continue;
    map.set(id, String(area?.title || id));
  }
  return map;
}

function buildStaleRows({ rows, liveSharedAssetIds, areaTitleById }) {
  const staleRows = [];
  for (const row of rows) {
    const sharedAlbumAssetId = extractSharedAlbumAssetId(row.asset_id);
    if (!sharedAlbumAssetId) continue;
    if (liveSharedAssetIds.has(sharedAlbumAssetId)) continue;
    const areaId = String(row.area_id || "").trim();
    staleRows.push({
      trackId: String(row.track_id || "").trim(),
      areaId,
      areaTitle: areaTitleById.get(areaId) || areaId,
      assetId: String(row.asset_id || "").trim(),
      sharedAlbumAssetId,
      assetName: String(row.asset_name || row.asset_id || "").trim(),
      assignedAt: row.assigned_at || null,
      reason: "missing_from_current_shared_album",
    });
  }
  staleRows.sort((a, b) => String(b.assignedAt || "").localeCompare(String(a.assignedAt || "")));
  return staleRows;
}

async function loadPgStaleRows(trackId, track) {
  return withPgClient(async (client) => {
    const [assignedResult, sharedResult] = await Promise.all([
      client.query(
        `
          SELECT track_id, area_id, asset_id, asset_name, assigned_at
          FROM photo_area_assets
          WHERE track_id = $1
          ORDER BY assigned_at DESC
        `,
        [trackId]
      ),
      client.query(`SELECT asset_id FROM shared_album_assets`)
    ]);
    return buildStaleRows({
      rows: assignedResult.rows,
      liveSharedAssetIds: new Set(sharedResult.rows.map((row) => String(row.asset_id || "").trim()).filter(Boolean)),
      areaTitleById: getAreaTitleMap(track),
    });
  });
}

function loadSqliteStaleRows(trackId, track) {
  const db = getDb();
  const assignedByArea = getAreaAssetsByTrack(db, trackId);
  const rows = [];
  for (const [areaId, photos] of Object.entries(assignedByArea || {})) {
    for (const photo of Array.isArray(photos) ? photos : []) {
      rows.push({
        track_id: trackId,
        area_id: areaId,
        asset_id: photo.id,
        asset_name: photo.name,
        assigned_at: photo.assignedAt,
      });
    }
  }
  const sharedRows = db.prepare(`SELECT asset_id FROM shared_album_assets`).all();
  return buildStaleRows({
    rows,
    liveSharedAssetIds: new Set(sharedRows.map((row) => String(row.asset_id || "").trim()).filter(Boolean)),
    areaTitleById: getAreaTitleMap(track),
  });
}

async function removePgRows(rows) {
  return withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      let removed = 0;
      for (const row of rows) {
        const result = await client.query(
          `
            DELETE FROM photo_area_assets
            WHERE track_id = $1 AND area_id = $2 AND asset_id = $3
          `,
          [row.trackId, row.areaId, row.assetId]
        );
        removed += Number(result.rowCount || 0);
      }
      await client.query("COMMIT");
      return removed;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

function removeSqliteRows(rows) {
  const db = getDb();
  const stmt = db.prepare(`
    DELETE FROM photo_area_assets
    WHERE track_id = ? AND area_id = ? AND asset_id = ?
  `);
  const tx = db.transaction((entries) => {
    let removed = 0;
    for (const row of entries) {
      const result = stmt.run(row.trackId, row.areaId, row.assetId);
      removed += Number(result.changes || 0);
    }
    return removed;
  });
  return tx(rows);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const trackId = String(searchParams.get("trackId") || "").trim().toLowerCase();
  const track = TRACKS[trackId];
  if (!track) {
    return NextResponse.json({ error: "Unsupported trackId" }, { status: 400 });
  }

  try {
    const staleRows = hasPostgresConfig()
      ? await loadPgStaleRows(trackId, track)
      : loadSqliteStaleRows(trackId, track);
    return NextResponse.json({
      trackId,
      staleCount: staleRows.length,
      staleRows,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 503 });
  }
}

export async function DELETE(request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const trackId = String(body?.trackId || "").trim().toLowerCase();
  const track = TRACKS[trackId];
  if (!track) {
    return NextResponse.json({ error: "Unsupported trackId" }, { status: 400 });
  }

  try {
    const staleRows = hasPostgresConfig()
      ? await loadPgStaleRows(trackId, track)
      : loadSqliteStaleRows(trackId, track);
    const removedCount = hasPostgresConfig()
      ? await removePgRows(staleRows)
      : removeSqliteRows(staleRows);
    return NextResponse.json({
      ok: true,
      trackId,
      removedCount,
      staleCountBeforeDelete: staleRows.length,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 503 });
  }
}
