import { NextResponse } from "next/server";
import { Client } from "pg";
import { getDb, getPinsByTrack } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function buildStaleGpsRows({ rows, liveSharedAssetIds }) {
  const staleRows = [];
  for (const row of rows) {
    const assetId = String(row.asset_id || "").trim();
    if (!assetId.startsWith("shared-album:")) continue;
    if (liveSharedAssetIds.has(assetId)) continue;
    staleRows.push({
      pinId: String(row.pin_id || "").trim(),
      pinTitle: String(row.pin_title || row.pin_id || "").trim(),
      assetId,
      assetName: String(row.asset_name || assetId).trim(),
      reason: "missing_from_current_shared_album",
    });
  }
  staleRows.sort((a, b) => a.pinTitle.localeCompare(b.pinTitle) || a.assetName.localeCompare(b.assetName));
  return staleRows;
}

async function loadPgStaleGpsRows(trackId) {
  return withPgClient(async (client) => {
    const [pinAssetResult, sharedResult] = await Promise.all([
      client.query(
        `
          SELECT p.pin_id, p.title AS pin_title, pa.asset_id, a.alt_text_snapshot AS asset_name
          FROM photo_pins p
          JOIN pin_assets pa ON pa.pin_id = p.pin_id
          LEFT JOIN photo_assets a ON a.asset_id = pa.asset_id
          WHERE p.track_id = $1 AND (p.pin_type = 'gps' OR p.lat IS NOT NULL OR p.lng IS NOT NULL)
        `,
        [trackId]
      ),
      client.query(`SELECT asset_id FROM shared_album_assets`)
    ]);
    return buildStaleGpsRows({
      rows: pinAssetResult.rows,
      liveSharedAssetIds: new Set(sharedResult.rows.map((row) => String(row.asset_id || "").trim()).filter(Boolean)),
    });
  });
}

function loadSqliteStaleGpsRows(trackId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.pin_id, p.title AS pin_title, pa.asset_id, a.alt_text_snapshot AS asset_name
    FROM photo_pins p
    JOIN pin_assets pa ON pa.pin_id = p.pin_id
    LEFT JOIN photo_assets a ON a.asset_id = pa.asset_id
    WHERE p.track_id = ? AND (p.pin_type = 'gps' OR p.lat IS NOT NULL OR p.lng IS NOT NULL)
  `).all(trackId);
  const sharedRows = db.prepare(`SELECT asset_id FROM shared_album_assets`).all();
  return buildStaleGpsRows({
    rows,
    liveSharedAssetIds: new Set(sharedRows.map((row) => String(row.asset_id || "").trim()).filter(Boolean)),
  });
}

async function loadPgEmptyGpsPinIds(trackId) {
  return withPgClient(async (client) => {
    const result = await client.query(
      `
        SELECT p.pin_id
        FROM photo_pins p
        LEFT JOIN pin_assets pa ON pa.pin_id = p.pin_id
        WHERE p.track_id = $1 AND (p.pin_type = 'gps' OR p.lat IS NOT NULL OR p.lng IS NOT NULL)
        GROUP BY p.pin_id
        HAVING COUNT(pa.asset_id) = 0
      `,
      [trackId]
    );
    return result.rows.map((row) => String(row.pin_id || "").trim()).filter(Boolean);
  });
}

function loadSqliteEmptyGpsPinIds(trackId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.pin_id
    FROM photo_pins p
    LEFT JOIN pin_assets pa ON pa.pin_id = p.pin_id
    WHERE p.track_id = ? AND (p.pin_type = 'gps' OR p.lat IS NOT NULL OR p.lng IS NOT NULL)
    GROUP BY p.pin_id
    HAVING COUNT(pa.asset_id) = 0
  `).all(trackId);
  return rows.map((row) => String(row.pin_id || "").trim()).filter(Boolean);
}

async function deletePgStaleGpsRows(trackId, staleRows) {
  return withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      let removedAssetCount = 0;
      for (const row of staleRows) {
        const result = await client.query(
          `DELETE FROM pin_assets WHERE pin_id = $1 AND asset_id = $2`,
          [row.pinId, row.assetId]
        );
        removedAssetCount += Number(result.rowCount || 0);
      }
      const emptyPinIds = await (async () => {
        const result = await client.query(
          `
            SELECT p.pin_id
            FROM photo_pins p
            LEFT JOIN pin_assets pa ON pa.pin_id = p.pin_id
            WHERE p.track_id = $1 AND (p.pin_type = 'gps' OR p.lat IS NOT NULL OR p.lng IS NOT NULL)
            GROUP BY p.pin_id
            HAVING COUNT(pa.asset_id) = 0
          `,
          [trackId]
        );
        return result.rows.map((row) => String(row.pin_id || "").trim()).filter(Boolean);
      })();
      let removedPinCount = 0;
      if (emptyPinIds.length) {
        const result = await client.query(`DELETE FROM photo_pins WHERE pin_id = ANY($1::text[])`, [emptyPinIds]);
        removedPinCount = Number(result.rowCount || 0);
      }
      await client.query("COMMIT");
      return { removedAssetCount, removedPinCount };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

function deleteSqliteStaleGpsRows(trackId, staleRows) {
  const db = getDb();
  const deletePinAsset = db.prepare(`DELETE FROM pin_assets WHERE pin_id = ? AND asset_id = ?`);
  const deletePin = db.prepare(`DELETE FROM photo_pins WHERE pin_id = ?`);
  const tx = db.transaction((entries) => {
    let removedAssetCount = 0;
    for (const row of entries) {
      const result = deletePinAsset.run(row.pinId, row.assetId);
      removedAssetCount += Number(result.changes || 0);
    }
    const emptyPinIds = loadSqliteEmptyGpsPinIds(trackId);
    let removedPinCount = 0;
    for (const pinId of emptyPinIds) {
      const result = deletePin.run(pinId);
      removedPinCount += Number(result.changes || 0);
    }
    return { removedAssetCount, removedPinCount };
  });
  return tx(staleRows);
}

export async function GET(_request, { params }) {
  const awaitedParams = await params;
  const trackId = String(awaitedParams?.trackId || "").trim().toLowerCase();
  if (!trackId) {
    return NextResponse.json({ error: "trackId is required" }, { status: 400 });
  }

  try {
    const staleRows = hasPostgresConfig()
      ? await loadPgStaleGpsRows(trackId)
      : loadSqliteStaleGpsRows(trackId);
    const stalePinIds = new Set(staleRows.map((row) => row.pinId));
    return NextResponse.json({
      trackId,
      staleAssetCount: staleRows.length,
      stalePinCount: stalePinIds.size,
      staleRows,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 503 });
  }
}

export async function DELETE(_request, { params }) {
  const awaitedParams = await params;
  const trackId = String(awaitedParams?.trackId || "").trim().toLowerCase();
  if (!trackId) {
    return NextResponse.json({ error: "trackId is required" }, { status: 400 });
  }

  try {
    const staleRows = hasPostgresConfig()
      ? await loadPgStaleGpsRows(trackId)
      : loadSqliteStaleGpsRows(trackId);
    const result = hasPostgresConfig()
      ? await deletePgStaleGpsRows(trackId, staleRows)
      : deleteSqliteStaleGpsRows(trackId, staleRows);
    const remainingPins = hasPostgresConfig()
      ? await withPgClient(async (client) => {
          const rows = await client.query(
            `
              SELECT COUNT(*) AS c
              FROM photo_pins p
              LEFT JOIN pin_assets pa ON pa.pin_id = p.pin_id
              WHERE p.track_id = $1 AND (p.pin_type = 'gps' OR p.lat IS NOT NULL OR p.lng IS NOT NULL)
              GROUP BY p.pin_id
              HAVING COUNT(pa.asset_id) > 0
            `,
            [trackId]
          );
          return rows.rows.length;
        })
      : getPinsByTrack(getDb(), trackId).filter((pin) => Number(pin.photo_count || 0) > 0 && (pin.pin_type === "gps" || pin.lat !== null || pin.lng !== null)).length;
    return NextResponse.json({
      ok: true,
      trackId,
      staleAssetCountBeforeDelete: staleRows.length,
      stalePinCountBeforeDelete: new Set(staleRows.map((row) => row.pinId)).size,
      removedAssetCount: result.removedAssetCount,
      removedPinCount: result.removedPinCount,
      remainingGpsPinCount: remainingPins,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 503 });
  }
}
