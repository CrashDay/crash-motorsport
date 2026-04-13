import { NextResponse } from "next/server";
import { Client } from "pg";
import crypto from "crypto";
import { getDb, getSharedAlbumAssetsByAlbumKey, getSharedAlbumBySlug } from "@/lib/db";
import { isValidSharedAlbumSeries } from "@/lib/shared-albums";
import lightroomImageUrl from "@/lib/lightroom-image-url";

const { normalizeLightroomImageUrl } = lightroomImageUrl;

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getPostgresConfig() {
  const candidates = [
    ["POSTGRES_URL", process.env.POSTGRES_URL],
    ["POSTGRES_URL_NON_POOLING", process.env.POSTGRES_URL_NON_POOLING],
    ["POSTGRES_PRISMA_URL", process.env.POSTGRES_PRISMA_URL],
    ["PRISMA_DATABASE_URL", process.env.PRISMA_DATABASE_URL],
    ["DATABASE_URL", process.env.DATABASE_URL],
  ];
  for (const [source, value] of candidates) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    return { source, value: raw };
  }
  return { source: "", value: "" };
}

function getPostgresConnectionString() {
  return getPostgresConfig().value;
}

function getPostgresIdentity() {
  const { source, value } = getPostgresConfig();
  if (!value) {
    return {
      source: source || null,
      host: null,
      dbName: null,
      user: null,
      fingerprint: null,
    };
  }
  try {
    const parsed = new URL(value);
    const dbName = parsed.pathname ? parsed.pathname.replace(/^\/+/, "") || null : null;
    const user = parsed.username ? decodeURIComponent(parsed.username) : null;
    const host = parsed.hostname || null;
    const fingerprint = crypto
      .createHash("sha1")
      .update(value)
      .digest("hex")
      .slice(0, 12);
    return {
      source: source || null,
      host,
      dbName,
      user,
      fingerprint,
    };
  } catch {
    return {
      source: source || null,
      host: null,
      dbName: null,
      user: null,
      fingerprint: null,
    };
  }
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

async function loadPgAlbum(series, slug) {
  return withPgClient(async (client) => {
    const albumRows = await client.query(
      `
        SELECT album_key, series, slug, title, year, race, cover_thumb_url, created_at, updated_at
        FROM shared_albums
        WHERE series = $1 AND slug = $2
        ORDER BY updated_at DESC, created_at DESC, album_key DESC
        LIMIT 1
      `,
      [series, slug]
    );
    const album = albumRows.rows[0];
    if (!album) return null;

    const assetRows = await client.query(
      `
        SELECT saa.album_key, saa.asset_id, saa.asset_name, saa.thumb_url, saa.full_url, saa.year, saa.race, saa.assigned_at, pa.capture_time
        FROM shared_album_assets saa
        LEFT JOIN photo_assets pa ON pa.asset_id = saa.asset_id
        WHERE saa.album_key = $1
        ORDER BY pa.capture_time IS NULL ASC, pa.capture_time ASC, saa.asset_name ASC, saa.assigned_at ASC
      `,
      [album.album_key]
    );

    return {
      albumKey: album.album_key,
      series: album.series,
      slug: album.slug,
      title: album.title,
      year: Number.isFinite(Number(album.year)) ? Number(album.year) : null,
      race: album.race || null,
      coverThumbUrl: normalizeLightroomImageUrl(album.cover_thumb_url) || null,
      createdAt: album.created_at,
      updatedAt: album.updated_at,
      assets: assetRows.rows.map((asset) => ({
        id: asset.asset_id,
        name: asset.asset_name,
        thumbUrl: normalizeLightroomImageUrl(asset.thumb_url),
        fullUrl: normalizeLightroomImageUrl(asset.full_url),
        year: Number.isFinite(Number(asset.year)) ? Number(asset.year) : null,
        race: asset.race || null,
        assignedAt: asset.assigned_at,
        captureTime: asset.capture_time || null,
      })),
    };
  });
}

async function loadPgAlbumRows(series, slug) {
  return withPgClient(async (client) => {
    const rows = await client.query(
      `
        SELECT
          a.album_key,
          a.series,
          a.slug,
          a.title,
          a.created_at,
          a.updated_at,
          COUNT(saa.asset_id) AS asset_count
        FROM shared_albums a
        LEFT JOIN shared_album_assets saa ON saa.album_key = a.album_key
        WHERE a.series = $1 AND a.slug = $2
        GROUP BY a.album_key, a.series, a.slug, a.title, a.created_at, a.updated_at
        ORDER BY a.updated_at DESC, a.created_at DESC, a.album_key DESC
      `,
      [series, slug]
    );
    return rows.rows.map((row) => ({
      albumKey: row.album_key,
      series: row.series,
      slug: row.slug,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      assetCount: Number(row.asset_count || 0),
    }));
  });
}

export async function GET(request, { params }) {
  const awaitedParams = await params;
  const series = String(awaitedParams?.series || "").trim().toLowerCase();
  const slug = String(awaitedParams?.slug || "").trim();
  const debugMode = String(request?.nextUrl?.searchParams?.get("debug") || "").trim().toLowerCase();

  if (!series || !isValidSharedAlbumSeries(series)) {
    return NextResponse.json({ error: "Invalid series" }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  try {
    if (hasPostgresConfig()) {
      const dbIdentity = getPostgresIdentity();
      if (debugMode === "rows") {
        const albumRows = await loadPgAlbumRows(series, slug);
        return NextResponse.json({
          storage: "postgres",
          dbSource: dbIdentity.source,
          dbHost: dbIdentity.host,
          dbName: dbIdentity.dbName,
          dbUser: dbIdentity.user,
          dbFingerprint: dbIdentity.fingerprint,
          rowCount: albumRows.length,
          rows: albumRows,
        });
      }
      const album = await loadPgAlbum(series, slug);
      if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });
      return NextResponse.json({
        storage: "postgres",
        dbSource: dbIdentity.source,
        dbHost: dbIdentity.host,
        dbName: dbIdentity.dbName,
        dbUser: dbIdentity.user,
        dbFingerprint: dbIdentity.fingerprint,
        assetCount: album.assets.length,
        album,
      });
    }

    const db = getDb();
    const album = getSharedAlbumBySlug(db, { series, slug });
    if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });
    const assets = getSharedAlbumAssetsByAlbumKey(db, album.albumKey);
    return NextResponse.json({
      storage: "sqlite",
      dbSource: null,
      dbHost: null,
      dbName: null,
      dbUser: null,
      dbFingerprint: null,
      assetCount: assets.length,
      album: {
        ...album,
        assets,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 503 });
  }
}
