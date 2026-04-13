import { Client } from "pg";
import {
  getDb,
  getSharedAlbumAssetsByAlbumKey,
  getSharedAlbumBySlug,
  getSharedAlbumsBySeries,
} from "@/lib/db";
import { SHARED_ALBUM_SERIES } from "@/lib/shared-album-constants";
import lightroomImageUrl from "@/lib/lightroom-image-url";

const { normalizeLightroomImageUrl } = lightroomImageUrl;

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

async function ensurePostgresSchema() {
  if (postgresReady) return;
  await withPgClient(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS shared_albums (
        album_key TEXT PRIMARY KEY,
        series TEXT NOT NULL,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        year INTEGER,
        race TEXT,
        source_album_id TEXT,
        cover_thumb_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS shared_album_assets (
        album_key TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        asset_name TEXT,
        thumb_url TEXT,
        full_url TEXT,
        year INTEGER,
        race TEXT,
        assigned_at TEXT NOT NULL,
        PRIMARY KEY (album_key, asset_id)
      )
    `);
    await client.query(`ALTER TABLE shared_albums ADD COLUMN IF NOT EXISTS year INTEGER`);
    await client.query(`ALTER TABLE shared_albums ADD COLUMN IF NOT EXISTS race TEXT`);
    await client.query(`ALTER TABLE shared_albums ADD COLUMN IF NOT EXISTS source_album_id TEXT`);
    await client.query(`ALTER TABLE shared_albums ADD COLUMN IF NOT EXISTS cover_thumb_url TEXT`);
    await client.query(`ALTER TABLE shared_album_assets ADD COLUMN IF NOT EXISTS year INTEGER`);
    await client.query(`ALTER TABLE shared_album_assets ADD COLUMN IF NOT EXISTS race TEXT`);
  });
  postgresReady = true;
}

export function isValidSharedAlbumSeries(value) {
  return SHARED_ALBUM_SERIES.some((series) => series.key === value);
}

export function slugifyAlbumTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "shared-album";
}

function normalizeComparableText(value) {
  return String(value || "").trim().toLowerCase();
}

function isPlaceholderSharedAlbumSlug(value) {
  return normalizeComparableText(value) === "shared-album";
}

function buildSharedAlbumIdentityKey(album) {
  const title = normalizeComparableText(album?.title);
  const race = normalizeComparableText(album?.race);
  const year = Number.isFinite(Number(album?.year)) ? String(Number(album.year)) : "";
  const cover = normalizeComparableText(album?.coverFullUrl || album?.coverThumbUrl);

  if (!title || !cover) return "";
  return [title, year, race, cover].join("|");
}

function compareSharedAlbumPreference(a, b) {
  const aPlaceholder = isPlaceholderSharedAlbumSlug(a?.slug);
  const bPlaceholder = isPlaceholderSharedAlbumSlug(b?.slug);
  if (aPlaceholder !== bPlaceholder) return aPlaceholder ? 1 : -1;

  const aPhotoCount = Number(a?.photoCount || 0);
  const bPhotoCount = Number(b?.photoCount || 0);
  if (aPhotoCount !== bPhotoCount) return bPhotoCount - aPhotoCount;

  const aUpdatedAt = Date.parse(String(a?.updatedAt || a?.createdAt || ""));
  const bUpdatedAt = Date.parse(String(b?.updatedAt || b?.createdAt || ""));
  if (Number.isFinite(aUpdatedAt) && Number.isFinite(bUpdatedAt) && aUpdatedAt !== bUpdatedAt) {
    return bUpdatedAt - aUpdatedAt;
  }

  return String(a?.slug || "").localeCompare(String(b?.slug || ""));
}

function dedupeSharedAlbums(albums) {
  const bySlug = new Map();
  const byIdentity = new Map();

  for (const album of Array.isArray(albums) ? albums : []) {
    const slugKey = normalizeComparableText(album?.slug || album?.albumKey);
    if (!slugKey) continue;

    const existingBySlug = bySlug.get(slugKey);
    if (!existingBySlug || compareSharedAlbumPreference(album, existingBySlug) < 0) {
      bySlug.set(slugKey, album);
    }
  }

  for (const album of bySlug.values()) {
    const identityKey = buildSharedAlbumIdentityKey(album);
    if (!identityKey) {
      byIdentity.set(`slug:${normalizeComparableText(album.slug || album.albumKey)}`, album);
      continue;
    }

    const existingByIdentity = byIdentity.get(identityKey);
    if (!existingByIdentity) {
      byIdentity.set(identityKey, album);
      continue;
    }

    const shouldCollapse =
      isPlaceholderSharedAlbumSlug(album?.slug) ||
      isPlaceholderSharedAlbumSlug(existingByIdentity?.slug);

    if (!shouldCollapse) {
      byIdentity.set(`slug:${normalizeComparableText(album.slug || album.albumKey)}`, album);
      continue;
    }

    if (compareSharedAlbumPreference(album, existingByIdentity) < 0) {
      byIdentity.set(identityKey, album);
    }
  }

  return Array.from(byIdentity.values()).sort(compareSharedAlbumPreference);
}

export function findCanonicalSharedAlbumSlug(albums, slug) {
  const normalizedSlug = normalizeComparableText(slug);
  if (!normalizedSlug || !isPlaceholderSharedAlbumSlug(normalizedSlug)) return "";

  const allAlbums = Array.isArray(albums) ? albums : [];
  const requestedAlbum = allAlbums.find((album) => normalizeComparableText(album?.slug) === normalizedSlug);
  if (!requestedAlbum) return "";

  const identityKey = buildSharedAlbumIdentityKey(requestedAlbum);
  if (!identityKey) return "";

  const canonicalAlbum = allAlbums
    .filter((album) => buildSharedAlbumIdentityKey(album) === identityKey)
    .sort(compareSharedAlbumPreference)[0];

  if (!canonicalAlbum) return "";
  const canonicalSlug = String(canonicalAlbum.slug || "").trim();
  return canonicalSlug && canonicalSlug !== slug ? canonicalSlug : "";
}

export async function loadSharedAlbums(series) {
  if (!series) return [];
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    const albums = await withPgClient(async (client) => {
      const rows = await client.query(
        `
          SELECT
            a.album_key,
            a.series,
            a.slug,
            a.title,
            a.year,
            a.race,
            a.cover_thumb_url,
            (
              SELECT saa.full_url
              FROM shared_album_assets saa
              WHERE saa.album_key = a.album_key
              ORDER BY saa.assigned_at DESC
              LIMIT 1
            ) AS cover_full_url,
            a.created_at,
            a.updated_at,
            COUNT(saa.asset_id) AS photo_count
          FROM shared_albums a
          LEFT JOIN shared_album_assets saa ON saa.album_key = a.album_key
          WHERE a.series = $1
          GROUP BY a.album_key, a.series, a.slug, a.title, a.year, a.race, a.cover_thumb_url, a.created_at, a.updated_at
          ORDER BY COALESCE(a.year, 0) DESC, a.updated_at DESC
        `,
        [series]
      );
      return rows.rows.map((r) => ({
        albumKey: r.album_key,
        series: r.series,
        slug: r.slug,
        title: r.title,
        year: Number.isFinite(Number(r.year)) ? Number(r.year) : null,
        race: r.race || null,
        coverThumbUrl: normalizeLightroomImageUrl(r.cover_thumb_url) || null,
        coverFullUrl: normalizeLightroomImageUrl(r.cover_full_url) || null,
        photoCount: Number(r.photo_count || 0),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    });
    return dedupeSharedAlbums(albums);
  }
  return dedupeSharedAlbums(getSharedAlbumsBySeries(getDb(), series));
}

export async function loadSharedAlbum(series, slug) {
  if (!series || !slug) return null;
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
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
      const row = albumRows.rows[0];
      if (!row) return null;
      const assetRows = await client.query(
        `
          SELECT saa.album_key, saa.asset_id, saa.asset_name, saa.thumb_url, saa.full_url, saa.year, saa.race, saa.assigned_at, pa.capture_time
          FROM shared_album_assets saa
          LEFT JOIN photo_assets pa ON pa.asset_id = saa.asset_id
          WHERE saa.album_key = $1
          ORDER BY pa.capture_time IS NULL ASC, pa.capture_time ASC, saa.asset_name ASC, saa.assigned_at ASC
        `,
        [row.album_key]
      );
      return {
        albumKey: row.album_key,
        series: row.series,
        slug: row.slug,
        title: row.title,
        year: Number.isFinite(Number(row.year)) ? Number(row.year) : null,
        race: row.race || null,
        coverThumbUrl: normalizeLightroomImageUrl(row.cover_thumb_url) || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
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
  const db = getDb();
  const album = getSharedAlbumBySlug(db, { series, slug });
  if (!album) return null;
  return {
    ...album,
    assets: getSharedAlbumAssetsByAlbumKey(db, album.albumKey),
  };
}
