import { NextResponse } from "next/server";
import { Client } from "pg";
import { getDb, getDbPath, getPinsByTrack } from "@/lib/db";
import lightroomImageUrl from "@/lib/lightroom-image-url";

const { normalizeLightroomImageUrl } = lightroomImageUrl;

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
  const connection = getPostgresConnectionString();
  if (connection && !process.env.POSTGRES_URL) {
    process.env.POSTGRES_URL = connection;
  }
  return Boolean(connection);
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
  return withPgClient(async (client) => {
    await client.query(`ALTER TABLE photo_pins ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
    await client.query(`ALTER TABLE photo_pins ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
  });
}

async function getPgPinsByTrack(trackId) {
  return withPgClient(async (client) => {
    const rows = await client.query(
      `
        SELECT
          p.pin_id,
          p.track_id,
          p.region_id,
          p.anchor_x,
          p.anchor_y,
          p.lat,
          p.lng,
          p.pin_type,
          p.title,
          COUNT(pa.asset_id) AS photo_count,
          (
            SELECT a.thumb_url
            FROM pin_assets pa2
            JOIN photo_assets a ON a.asset_id = pa2.asset_id
            WHERE pa2.pin_id = p.pin_id
            ORDER BY a.capture_time DESC
            LIMIT 1
          ) AS cover_thumb_url
        FROM photo_pins p
        LEFT JOIN pin_assets pa ON pa.pin_id = p.pin_id
        WHERE p.track_id = $1
        GROUP BY p.pin_id, p.track_id, p.region_id, p.anchor_x, p.anchor_y, p.pin_type, p.title
        ORDER BY p.title ASC
      `,
      [trackId]
    );

    return rows.rows.map((r) => ({
      pin_id: r.pin_id,
      track_id: r.track_id,
      region_id: r.region_id,
      title: r.title,
      anchor_x: Number(r.anchor_x),
      anchor_y: Number(r.anchor_y),
      lat: r.lat === null ? null : Number(r.lat),
      lng: r.lng === null ? null : Number(r.lng),
      pin_type: r.pin_type,
      photo_count: Number(r.photo_count || 0),
      cover_thumb_url: normalizeLightroomImageUrl(r.cover_thumb_url) || null,
    }));
  });
}

async function getPgDebugCounts(trackId) {
  return withPgClient(async (client) => {
    const totalPins = Number((await client.query("SELECT COUNT(*) AS c FROM photo_pins")).rows[0]?.c || 0);
    const trackPins = Number(
      (await client.query("SELECT COUNT(*) AS c FROM photo_pins WHERE track_id = $1", [trackId])).rows[0]?.c || 0
    );
    return { totalPins, trackPins };
  });
}

export async function GET(_request, { params }) {
  const awaitedParams = await params;
  const rawTrackId = awaitedParams.trackId;
  const trackId = String(rawTrackId || "").trim().toLowerCase();
  const { searchParams } = new URL(_request.url);
  const debug = searchParams.get("debug");

  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    const pins = await getPgPinsByTrack(trackId);
    if (debug === "1") {
      const { totalPins, trackPins } = await getPgDebugCounts(trackId);
      return NextResponse.json({
        pins,
        storage: "postgres",
        total_pins: totalPins,
        track_pins: trackPins,
        track_id_raw: rawTrackId,
        track_id_norm: trackId,
      });
    }
    return NextResponse.json({ pins });
  }

  const db = getDb();
  const pins = getPinsByTrack(db, trackId);
  if (debug === "1") {
    const totalPins = db.prepare("SELECT COUNT(*) AS c FROM photo_pins").get()?.c || 0;
    const trackPins = db
      .prepare("SELECT COUNT(*) AS c FROM photo_pins WHERE track_id = ?")
      .get(trackId)?.c || 0;
    return NextResponse.json({
      pins,
      storage: "sqlite",
      db_path: getDbPath(),
      total_pins: totalPins,
      track_pins: trackPins,
      track_id_raw: rawTrackId,
      track_id_norm: trackId,
      track_id_codes: String(rawTrackId || "")
        .split("")
        .map((ch) => ch.charCodeAt(0)),
      cwd: process.cwd(),
    });
  }
  return NextResponse.json({ pins });
}
