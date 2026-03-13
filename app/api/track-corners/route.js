import { NextResponse } from "next/server";
import { Client } from "pg";
import { getDb, getTrackCornersByTrack, replaceTrackCorners } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPPORTED_TRACKS = new Set(["sebring"]);

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
    CREATE TABLE IF NOT EXISTS track_corners (
      track_id TEXT NOT NULL,
      corner_id TEXT NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (track_id, corner_id)
    )
  `);
  postgresReady = true;
}

function normalizeCornerMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [cornerIdRaw, value] of Object.entries(raw)) {
    const cornerId = String(cornerIdRaw || "").trim();
    if (!cornerId) continue;
    const lat = Number(value?.lat);
    const lng = Number(value?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out[cornerId] = {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    };
  }
  return out;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const trackId = String(searchParams.get("trackId") || "").trim().toLowerCase();
  if (!SUPPORTED_TRACKS.has(trackId)) {
    return NextResponse.json({ error: "Unsupported trackId" }, { status: 400 });
  }

  try {
    if (hasPostgresConfig()) {
      await ensurePostgresSchema();
      const { rows } = await runPgQuery(
        `
          SELECT corner_id, lat, lng
          FROM track_corners
          WHERE track_id = $1
          ORDER BY corner_id ASC
        `,
        [trackId]
      );
      const corners = {};
      for (const row of rows) {
        const lat = Number(row.lat);
        const lng = Number(row.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        corners[String(row.corner_id)] = { lat, lng };
      }
      return NextResponse.json({ trackId, corners }, { headers: { "Cache-Control": "no-store" } });
    }

    if (!isVercelRuntime()) {
      const db = getDb();
      const corners = getTrackCornersByTrack(db, trackId);
      return NextResponse.json({ trackId, corners }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ trackId, corners: {} }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[track-corners:GET] storage error", error);
    return NextResponse.json({ trackId, corners: {} }, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const trackId = String(body?.trackId || "").trim().toLowerCase();
  if (!SUPPORTED_TRACKS.has(trackId)) {
    return NextResponse.json({ error: "Unsupported trackId" }, { status: 400 });
  }

  const corners = normalizeCornerMap(body?.corners);
  if (!Object.keys(corners).length) {
    return NextResponse.json({ error: "No valid corners provided" }, { status: 400 });
  }

  try {
    if (hasPostgresConfig()) {
      await ensurePostgresSchema();
      await withPgClient(async (client) => {
        try {
          await client.query("BEGIN");
          await client.query("DELETE FROM track_corners WHERE track_id = $1", [trackId]);
          const updatedAt = new Date().toISOString();
          for (const [cornerId, value] of Object.entries(corners)) {
            await client.query(
              `
                INSERT INTO track_corners (track_id, corner_id, lat, lng, updated_at)
                VALUES ($1, $2, $3, $4, $5)
              `,
              [trackId, cornerId, value.lat, value.lng, updatedAt]
            );
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
      return NextResponse.json({ ok: true, count: Object.keys(corners).length });
    }

    if (!isVercelRuntime()) {
      const db = getDb();
      replaceTrackCorners(db, {
        track_id: trackId,
        cornersById: corners,
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, count: Object.keys(corners).length });
    }

    return NextResponse.json({ error: "Corner sync storage is not configured" }, { status: 400 });
  } catch (error) {
    console.error("[track-corners:POST] storage error", error);
    return NextResponse.json({ error: "Failed to save corners" }, { status: 500 });
  }
}
