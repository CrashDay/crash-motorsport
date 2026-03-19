import { NextResponse } from "next/server";
import { Client } from "pg";
import { getDb, getAssetsByPin } from "@/lib/db";
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

async function getPgAssetsByPin(pinId) {
  return withPgClient(async (client) => {
    const rows = await client.query(
      `
        SELECT a.asset_id, a.capture_time, a.thumb_url, a.full_url, a.alt_text_snapshot, a.year, a.race
        FROM pin_assets pa
        JOIN photo_assets a ON a.asset_id = pa.asset_id
        WHERE pa.pin_id = $1
        ORDER BY a.capture_time ASC
      `,
      [pinId]
    );

    return rows.rows.map((r) => ({
      asset_id: r.asset_id,
      capture_time: r.capture_time,
      thumb_url: normalizeLightroomImageUrl(r.thumb_url),
      full_url: normalizeLightroomImageUrl(r.full_url),
      alt_text_snapshot: r.alt_text_snapshot,
      year: Number.isFinite(Number(r.year)) ? Number(r.year) : null,
      race: r.race || null,
    }));
  });
}

export async function GET(_request, { params }) {
  const awaitedParams = await params;
  const pinId = awaitedParams.pinId;

  if (hasPostgresConfig()) {
    const assets = await getPgAssetsByPin(pinId);
    return NextResponse.json({ assets });
  }

  const db = getDb();
  const assets = getAssetsByPin(db, pinId);
  return NextResponse.json({ assets });
}
