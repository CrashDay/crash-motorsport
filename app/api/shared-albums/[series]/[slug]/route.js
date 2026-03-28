import { NextResponse } from "next/server";
import { Client } from "pg";
import { getDb, getSharedAlbumAssetsByAlbumKey, getSharedAlbumBySlug } from "@/lib/db";
import { isValidSharedAlbumSeries } from "@/lib/shared-albums";
import lightroomImageUrl from "@/lib/lightroom-image-url";

const { normalizeLightroomImageUrl } = lightroomImageUrl;

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

async function loadPgAlbum(series, slug) {
  return withPgClient(async (client) => {
    const albumRows = await client.query(
      `
        SELECT album_key, series, slug, title, year, race, cover_thumb_url, created_at, updated_at
        FROM shared_albums
        WHERE series = $1 AND slug = $2
        LIMIT 1
      `,
      [series, slug]
    );
    const album = albumRows.rows[0];
    if (!album) return null;

    const assetRows = await client.query(
      `
        SELECT album_key, asset_id, asset_name, thumb_url, full_url, year, race, assigned_at
        FROM shared_album_assets
        WHERE album_key = $1
        ORDER BY assigned_at DESC
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
      })),
    };
  });
}

export async function GET(_request, { params }) {
  const awaitedParams = await params;
  const series = String(awaitedParams?.series || "").trim().toLowerCase();
  const slug = String(awaitedParams?.slug || "").trim();

  if (!series || !isValidSharedAlbumSeries(series)) {
    return NextResponse.json({ error: "Invalid series" }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  try {
    if (hasPostgresConfig()) {
      const album = await loadPgAlbum(series, slug);
      if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });
      return NextResponse.json({
        storage: "postgres",
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
