import { NextResponse } from "next/server";
import { Client } from "pg";
import crypto from "crypto";
import vm from "vm";
import sebringAreas from "@/data/sebring-photo-areas.json";
import {
  assignAreaAsset,
  assignSharedAlbumAsset,
  getDb,
  upsertGpsPin,
  upsertPhotoAsset,
  upsertPinAsset,
  upsertSharedAlbum,
} from "@/lib/db";
import { getProjectorForTrack } from "@/lib/geo-projector";
import { extractGpsFromLightroomAsset } from "@/lib/lightroom-gps";
import lightroomImageUrl from "@/lib/lightroom-image-url";
import { isValidSharedAlbumSeries, slugifyAlbumTitle } from "@/lib/shared-albums";

const { normalizeLightroomImageUrl } = lightroomImageUrl;

const TRACK_ID = "sebring";
const STATIC_AREA_IDS = new Set(sebringAreas.map((a) => a.id));
const SHARE_HOSTS = new Set(["adobe.ly", "lightroom.adobe.com"]);
const MAX_ALBUM_ASSETS = 500;
const USER_AGENT = "Mozilla/5.0 (compatible; CrashDayPics/1.0; +https://crashdaypics.com)";

let postgresReady = false;

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
  const connection = getPostgresConnectionString();
  if (connection && !process.env.POSTGRES_URL) {
    process.env.POSTGRES_URL = connection;
  }
  return Boolean(connection);
}

function isVercelRuntime() {
  return process.env.VERCEL === "1" || String(process.env.VERCEL || "").toLowerCase() === "true";
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
      CREATE TABLE IF NOT EXISTS photo_assets (
        asset_id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        capture_time TEXT,
        alt_text_snapshot TEXT,
        thumb_url TEXT,
        full_url TEXT,
        year INTEGER,
        race TEXT,
        last_synced_at TEXT,
        catalog_id TEXT
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS photo_pins (
        pin_id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        region_id TEXT,
        anchor_x DOUBLE PRECISION,
        anchor_y DOUBLE PRECISION,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        pin_type TEXT NOT NULL,
        title TEXT
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_pins_track_region
      ON photo_pins(track_id, region_id)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS pin_assets (
        pin_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        sort_order BIGINT,
        added_at TEXT,
        PRIMARY KEY (pin_id, asset_id)
      )
    `);
    await client.query(`
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
    await client.query(`ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS year INTEGER`);
    await client.query(`ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS race TEXT`);
    await client.query(`ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS catalog_id TEXT`);
    await client.query(`ALTER TABLE photo_pins ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
    await client.query(`ALTER TABLE photo_pins ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
    await client.query(`ALTER TABLE photo_area_assets ADD COLUMN IF NOT EXISTS year INTEGER`);
    await client.query(`ALTER TABLE photo_area_assets ADD COLUMN IF NOT EXISTS race TEXT`);
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

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!SHARE_HOSTS.has(parsed.hostname)) return "";
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1900 || n > 2100) return null;
  return n;
}

function normalizeRace(value) {
  const raw = String(value || "").trim();
  return raw;
}

function extractSharedAlbumSourceId(...values) {
  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    const match = raw.match(/\/spaces\/([^/]+)/i);
    if (match?.[1]) return match[1];
  }
  return "";
}

function isValidAreaId(areaId) {
  if (!areaId) return false;
  if (STATIC_AREA_IDS.has(areaId)) return true;
  return areaId.startsWith("area-");
}

function stripWhile1(text) {
  if (!text) return "";
  return String(text).replace(/^while\s*\(\s*1\s*\)\s*\{\s*\}\s*/i, "").trim();
}

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return {
    text: await res.text(),
    finalUrl: res.url,
  };
}

function extractAssignedObject(source, assignment) {
  const marker = `${assignment} =`;
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const braceStart = source.indexOf("{", start);
  if (braceStart < 0) return null;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  return null;
}

function parseSharesConfig(html) {
  const objectText = extractAssignedObject(html, "window.SharesConfig");
  if (!objectText) throw new Error("Shared album metadata was not found");
  try {
    return JSON.parse(objectText);
  } catch {
    try {
      return vm.runInNewContext(`(${objectText})`, {}, { timeout: 1000 });
    } catch {
      throw new Error("Shared album metadata could not be parsed");
    }
  }
}

function toAbsoluteUrl(base, href) {
  if (!href) return "";
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

function pickCaptureTime(asset) {
  return (
    asset?.payload?.captureDate ||
    asset?.payload?.capture_date ||
    asset?.payload?.xmp?.xmp?.CreateDate ||
    asset?.payload?.xmp?.photoshop?.DateCreated ||
    asset?.created ||
    asset?.updated ||
    new Date().toISOString()
  );
}

async function fetchAlbumFeed(initialUrl) {
  const resources = [];
  let nextUrl = initialUrl;
  let base = initialUrl;
  while (nextUrl && resources.length < MAX_ALBUM_ASSETS) {
    const { text } = await fetchText(nextUrl);
    const payload = JSON.parse(stripWhile1(text) || "{}");
    if (payload?.base) base = payload.base;
    if (Array.isArray(payload?.resources)) resources.push(...payload.resources);
    const href = String(payload?.links?.next?.href || "").trim();
    nextUrl = href ? toAbsoluteUrl(payload?.base || initialUrl, href) : "";
  }
  return {
    base,
    resources: resources.slice(0, MAX_ALBUM_ASSETS),
  };
}

function collectAssetDetailHrefs(resource, assetsBase) {
  const hrefs = [];
  const linkMaps = [resource?.links, resource?.asset?.links, resource?.resource?.links];

  for (const links of linkMaps) {
    if (!links || typeof links !== "object") continue;
    for (const [rel, value] of Object.entries(links)) {
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        const href = String(item?.href || "").trim();
        if (!href) continue;
        if (rel.includes("rendition_type")) continue;
        if (
          rel === "self" ||
          rel === "/rels/self" ||
          rel.includes("/assets/") ||
          rel.includes("/asset") ||
          href.includes("/assets/") ||
          href.includes("/asset/")
        ) {
          hrefs.push(toAbsoluteUrl(assetsBase, href));
        }
      }
    }
  }

  return [...new Set(hrefs.filter(Boolean))];
}

async function fetchJson(url) {
  const { text } = await fetchText(url);
  return JSON.parse(stripWhile1(text) || "{}");
}

function normalizeSharedAssetDetailPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload?.id || payload?.payload || payload?.links) return payload;
  if (payload?.asset && (payload.asset?.id || payload.asset?.payload || payload.asset?.links)) return payload.asset;
  if (payload?.resource?.asset && (payload.resource.asset?.id || payload.resource.asset?.payload || payload.resource.asset?.links)) {
    return payload.resource.asset;
  }
  if (Array.isArray(payload?.resources)) {
    for (const resource of payload.resources) {
      if (resource?.asset && (resource.asset?.id || resource.asset?.payload || resource.asset?.links)) return resource.asset;
      if (resource?.id || resource?.payload || resource?.links) return resource;
    }
  }
  return null;
}

function normalizeSharedAlbumFeedRow(row) {
  if (!row || typeof row !== "object") return null;

  const direct = normalizeSharedAssetDetailPayload(row);
  if (direct) return direct;

  const candidates = [
    row?.asset,
    row?.resource,
    row?.resource?.asset,
    row?.master,
    row?.master?.asset,
    row?.image,
    row?.image?.asset,
    row?.item,
    row?.item?.asset,
    row?.content,
    row?.content?.asset,
    row?.payload?.asset,
    row?.payload?.resource,
    row?.payload?.image,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeSharedAssetDetailPayload(candidate);
    if (normalized) return normalized;
  }

  if (row?.payload?.id || row?.payload?.links) {
    return {
      id: row.payload.id,
      payload: row.payload,
      links: row.links || row.payload.links || null,
      subtype: row.subtype || row.payload.subtype || null,
    };
  }

  return null;
}

function collectRenditionHrefs(assetLike, assetsBase) {
  const hrefs = [];
  const links = assetLike?.links;
  if (!links || typeof links !== "object") return hrefs;

  for (const [rel, value] of Object.entries(links)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      const href = String(item?.href || "").trim();
      if (!href) continue;
      hrefs.push({
        rel: String(rel || "").toLowerCase(),
        url: toAbsoluteUrl(assetsBase, href),
      });
    }
  }

  return hrefs;
}

function pickRenditionUrl(assetDetail, asset, assetsBase, kind) {
  const candidates = [
    ...collectRenditionHrefs(assetDetail, assetsBase),
    ...collectRenditionHrefs(asset, assetsBase),
  ];

  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate.url || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    unique.push(candidate);
  }

  const thumbPatterns = ["thumbnail2x", "thumbnail", "thumb", "preview", "web"];
  const fullPatterns = ["2048", "2560", "fullsize", "full", "original", "master"];
  const patterns = kind === "thumb" ? thumbPatterns : fullPatterns;

  for (const pattern of patterns) {
    const match = unique.find((candidate) => candidate.rel.includes(pattern) || candidate.url.toLowerCase().includes(pattern));
    if (match?.url) return normalizeLightroomImageUrl(match.url);
  }

  if (kind === "full") {
    const nonThumb = unique.find((candidate) => !thumbPatterns.some((pattern) => candidate.rel.includes(pattern)));
    if (nonThumb?.url) return normalizeLightroomImageUrl(nonThumb.url);
  }

  const first = unique[0]?.url || "";
  return first ? normalizeLightroomImageUrl(first) : "";
}

function collectGpsDebugSummary(asset) {
  const payload = asset?.payload;
  const links = asset?.links;
  const payloadKeys = payload && typeof payload === "object" ? Object.keys(payload).sort() : [];
  const linkKeys = links && typeof links === "object" ? Object.keys(links).sort() : [];
  return {
    id: asset?.id || null,
    subtype: asset?.subtype || payload?.subtype || null,
    payload_keys: payloadKeys,
    link_keys: linkKeys,
    has_payload_gps: Boolean(payload?.gps),
    has_payload_location: Boolean(payload?.location),
    has_payload_coordinate: Boolean(payload?.coordinate),
    has_payload_exif: Boolean(payload?.exif),
    has_payload_xmp: Boolean(payload?.xmp),
    gps_value_preview: {
      gps: payload?.gps || null,
      location: payload?.location || null,
      coordinate: payload?.coordinate || null,
      latitude: payload?.latitude ?? null,
      longitude: payload?.longitude ?? null,
      exif_gps_latitude: payload?.exif?.GPSLatitude ?? null,
      exif_gps_longitude: payload?.exif?.GPSLongitude ?? null,
      xmp_exif_gps_latitude: payload?.xmp?.exif?.GPSLatitude ?? null,
      xmp_exif_gps_longitude: payload?.xmp?.exif?.GPSLongitude ?? null,
    },
  };
}

async function fetchSharedAssetDetail(resource, assetsBase) {
  const hrefs = collectAssetDetailHrefs(resource, assetsBase);
  for (const href of hrefs) {
    try {
      const payload = await fetchJson(href);
      const normalized = normalizeSharedAssetDetailPayload(payload);
      if (normalized) return normalized;
    } catch {
      // Ignore detail fetch failures and continue with feed metadata.
    }
  }
  return null;
}

async function storeAreaAssignment({ db, pgClient = null, areaId, assetId, name, thumbUrl, fullUrl, year, race, assignedAt }) {
  if (!areaId) return;
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    const run = async (client) => {
      await client.query(
        `
          INSERT INTO photo_area_assets (track_id, area_id, asset_id, asset_name, thumb_url, full_url, year, race, assigned_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (track_id, area_id, asset_id) DO UPDATE SET
            asset_name = EXCLUDED.asset_name,
            thumb_url = EXCLUDED.thumb_url,
            full_url = EXCLUDED.full_url,
            year = EXCLUDED.year,
            race = EXCLUDED.race,
            assigned_at = EXCLUDED.assigned_at
        `,
        [TRACK_ID, areaId, assetId, name, thumbUrl, fullUrl, year, race, assignedAt]
      );
    };
    if (pgClient) {
      await run(pgClient);
    } else {
      await withPgClient(run);
    }
    return;
  }
  if (isVercelRuntime()) {
    throw new Error("Durable storage is not configured. Set a Postgres connection in Vercel env vars.");
  }
  assignAreaAsset(db, {
    track_id: TRACK_ID,
    area_id: areaId,
    asset_id: assetId,
    asset_name: name,
    thumb_url: thumbUrl,
    full_url: fullUrl,
    year,
    race,
    assigned_at: assignedAt,
  });
}

async function storePhotoAsset({ db, pgClient = null, assetId, captureTime, altText, thumbUrl, fullUrl, year, race, lastSyncedAt }) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    const run = async (client) => {
      await client.query(
        `
          INSERT INTO photo_assets (asset_id, track_id, capture_time, alt_text_snapshot, thumb_url, full_url, year, race, last_synced_at, catalog_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL)
          ON CONFLICT (asset_id) DO UPDATE SET
            track_id = EXCLUDED.track_id,
            capture_time = EXCLUDED.capture_time,
            alt_text_snapshot = EXCLUDED.alt_text_snapshot,
            thumb_url = EXCLUDED.thumb_url,
            full_url = EXCLUDED.full_url,
            year = EXCLUDED.year,
            race = EXCLUDED.race,
            last_synced_at = EXCLUDED.last_synced_at,
            catalog_id = EXCLUDED.catalog_id
        `,
        [assetId, TRACK_ID, captureTime, altText, thumbUrl, fullUrl, year, race, lastSyncedAt]
      );
    };
    if (pgClient) {
      await run(pgClient);
    } else {
      await withPgClient(run);
    }
    return;
  }
  upsertPhotoAsset(db, {
    asset_id: assetId,
    track_id: TRACK_ID,
    capture_time: captureTime,
    alt_text_snapshot: altText,
    thumb_url: thumbUrl,
    full_url: fullUrl,
    year,
    race,
    last_synced_at: lastSyncedAt,
    catalog_id: null,
  });
}

async function storeGpsPin({ db, pgClient = null, pinId, anchorX, anchorY, lat, lng, title }) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    const run = async (client) => {
      await client.query(
        `
          INSERT INTO photo_pins (pin_id, track_id, region_id, anchor_x, anchor_y, lat, lng, pin_type, title)
          VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (pin_id) DO UPDATE SET
            anchor_x = EXCLUDED.anchor_x,
            anchor_y = EXCLUDED.anchor_y,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            title = EXCLUDED.title
        `,
        [pinId, TRACK_ID, anchorX, anchorY, lat, lng, "gps", title]
      );
    };
    if (pgClient) {
      await run(pgClient);
    } else {
      await withPgClient(run);
    }
    return;
  }
  upsertGpsPin(db, {
    pin_id: pinId,
    track_id: TRACK_ID,
    anchor_x: anchorX,
    anchor_y: anchorY,
    lat,
    lng,
    title,
  });
}

async function storePinAsset({ db, pgClient = null, pinId, assetId, sortOrder, addedAt }) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    const run = async (client) => {
      await client.query(
        `
          INSERT INTO pin_assets (pin_id, asset_id, sort_order, added_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (pin_id, asset_id) DO UPDATE SET
            sort_order = EXCLUDED.sort_order,
            added_at = EXCLUDED.added_at
        `,
        [pinId, assetId, sortOrder, addedAt]
      );
    };
    if (pgClient) {
      await run(pgClient);
    } else {
      await withPgClient(run);
    }
    return;
  }
  upsertPinAsset(db, {
    pin_id: pinId,
    asset_id: assetId,
    sort_order: sortOrder,
    added_at: addedAt,
  });
}

async function findExistingSharedAlbumMatch({ db, pgClient = null, series, sourceAlbumId }) {
  if (!sourceAlbumId) return null;
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    const run = async (client) => {
      const exactResult = await client.query(
        `
          SELECT album_key, slug, title, created_at, updated_at
          FROM shared_albums
          WHERE series = $1 AND source_album_id = $2
          ORDER BY updated_at DESC, created_at DESC, album_key DESC
          LIMIT 1
        `,
        [series, sourceAlbumId]
      );
      if (exactResult.rows[0]) return exactResult.rows[0];
      const fallbackResult = await client.query(
        `
          SELECT album_key, slug, title, created_at, updated_at
          FROM shared_albums
          WHERE series = $1 AND cover_thumb_url LIKE $2
          ORDER BY updated_at DESC, created_at DESC, album_key DESC
          LIMIT 1
        `,
        [series, `%/spaces/${sourceAlbumId}/%`]
      );
      return fallbackResult.rows[0] || null;
    };
    const row = pgClient ? await run(pgClient) : await withPgClient(run);
    if (!row) return null;
    return {
      albumKey: row.album_key,
      slug: row.slug,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  const exactRow = db
    .prepare(
      `
        SELECT album_key, slug, title, created_at, updated_at
        FROM shared_albums
        WHERE series = ? AND source_album_id = ?
        ORDER BY updated_at DESC, created_at DESC, album_key DESC
        LIMIT 1
      `
    )
    .get(series, sourceAlbumId);
  const fallbackRow =
    exactRow ||
    db
      .prepare(
        `
          SELECT album_key, slug, title, created_at, updated_at
          FROM shared_albums
          WHERE series = ? AND cover_thumb_url LIKE ?
          ORDER BY updated_at DESC, created_at DESC, album_key DESC
          LIMIT 1
        `
      )
      .get(series, `%/spaces/${sourceAlbumId}/%`);
  if (!fallbackRow) return null;
  return {
    albumKey: fallbackRow.album_key,
    slug: fallbackRow.slug,
    title: fallbackRow.title,
    createdAt: fallbackRow.created_at,
    updatedAt: fallbackRow.updated_at,
  };
}

async function storeSharedAlbum({
  db,
  pgClient = null,
  albumKey,
  series,
  slug,
  title,
  year,
  race,
  sourceAlbumId,
  coverThumbUrl,
  createdAt,
  updatedAt,
}) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    const run = async (client) => {
      await client.query(
        `
          INSERT INTO shared_albums (album_key, series, slug, title, year, race, source_album_id, cover_thumb_url, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (album_key) DO UPDATE SET
            series = EXCLUDED.series,
            slug = EXCLUDED.slug,
            title = EXCLUDED.title,
            year = EXCLUDED.year,
            race = EXCLUDED.race,
            source_album_id = EXCLUDED.source_album_id,
            cover_thumb_url = EXCLUDED.cover_thumb_url,
            updated_at = EXCLUDED.updated_at
        `,
        [albumKey, series, slug, title, year, race, sourceAlbumId || null, coverThumbUrl, createdAt, updatedAt]
      );
    };
    if (pgClient) {
      await run(pgClient);
    } else {
      await withPgClient(run);
    }
    return;
  }
  upsertSharedAlbum(db, {
    album_key: albumKey,
    series,
    slug,
    title,
    year,
    race,
    source_album_id: sourceAlbumId || null,
    cover_thumb_url: coverThumbUrl,
    created_at: createdAt,
    updated_at: updatedAt,
  });
}

async function storeSharedAlbumAsset({ db, pgClient = null, albumKey, assetId, name, thumbUrl, fullUrl, year, race, assignedAt }) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    const run = async (client) => {
      await client.query(
        `
          INSERT INTO shared_album_assets (album_key, asset_id, asset_name, thumb_url, full_url, year, race, assigned_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (album_key, asset_id) DO UPDATE SET
            asset_name = EXCLUDED.asset_name,
            thumb_url = EXCLUDED.thumb_url,
            full_url = EXCLUDED.full_url,
            year = EXCLUDED.year,
            race = EXCLUDED.race,
            assigned_at = EXCLUDED.assigned_at
        `,
        [albumKey, assetId, name, thumbUrl, fullUrl, year, race, assignedAt]
      );
    };
    if (pgClient) {
      await run(pgClient);
    } else {
      await withPgClient(run);
    }
    return;
  }
  assignSharedAlbumAsset(db, {
    album_key: albumKey,
    asset_id: assetId,
    asset_name: name,
    thumb_url: thumbUrl,
    full_url: fullUrl,
    year,
    race,
    assigned_at: assignedAt,
  });
}

async function clearSharedAlbumAssets({ db, pgClient = null, albumKey }) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    const run = async (client) => {
      await client.query(`DELETE FROM shared_album_assets WHERE album_key = $1`, [albumKey]);
    };
    if (pgClient) {
      await run(pgClient);
    } else {
      await withPgClient(run);
    }
    return;
  }
  db.prepare(`DELETE FROM shared_album_assets WHERE album_key = ?`).run(albumKey);
}

async function removeStaleSharedAlbums({ db, pgClient = null, albumKey, series, slug }) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    const run = async (client) => {
      const staleRows = await client.query(
        `
          SELECT album_key
          FROM shared_albums
          WHERE series = $1 AND slug = $2 AND album_key <> $3
        `,
        [series, slug, albumKey]
      );
      const staleAlbumKeys = staleRows.rows.map((row) => row.album_key).filter(Boolean);
      if (!staleAlbumKeys.length) return 0;
      await client.query(`DELETE FROM shared_album_assets WHERE album_key = ANY($1::text[])`, [staleAlbumKeys]);
      await client.query(`DELETE FROM shared_albums WHERE album_key = ANY($1::text[])`, [staleAlbumKeys]);
      return staleAlbumKeys.length;
    };
    if (pgClient) {
      return run(pgClient);
    }
    return withPgClient(run);
  }

  const staleAlbumKeys = db
    .prepare(
      `
        SELECT album_key
        FROM shared_albums
        WHERE series = ? AND slug = ? AND album_key <> ?
      `
    )
    .all(series, slug, albumKey)
    .map((row) => row.album_key)
    .filter(Boolean);
  if (!staleAlbumKeys.length) return 0;
  const placeholders = staleAlbumKeys.map(() => "?").join(",");
  db.prepare(`DELETE FROM shared_album_assets WHERE album_key IN (${placeholders})`).run(...staleAlbumKeys);
  db.prepare(`DELETE FROM shared_albums WHERE album_key IN (${placeholders})`).run(...staleAlbumKeys);
  return staleAlbumKeys.length;
}

async function countSharedAlbumAssets({ db, pgClient = null, albumKey }) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    const run = async (client) => {
      const result = await client.query(`SELECT COUNT(*) AS c FROM shared_album_assets WHERE album_key = $1`, [albumKey]);
      return Number(result.rows[0]?.c || 0);
    };
    if (pgClient) {
      return run(pgClient);
    }
    return withPgClient(run);
  }
  return Number(db.prepare(`SELECT COUNT(*) AS c FROM shared_album_assets WHERE album_key = ?`).get(albumKey)?.c || 0);
}

async function loadCommittedSharedAlbumSummary({ db, albumKey, series, slug }) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    return withPgClient(async (client) => {
      const albumResult = await client.query(
        `
          SELECT album_key, created_at, updated_at
          FROM shared_albums
          WHERE album_key = $1
          LIMIT 1
        `,
        [albumKey]
      );
      const assetResult = await client.query(`SELECT COUNT(*) AS c FROM shared_album_assets WHERE album_key = $1`, [albumKey]);
      const rowResult = await client.query(
        `
          SELECT
            a.album_key,
            a.created_at,
            a.updated_at,
            COUNT(saa.asset_id) AS asset_count
          FROM shared_albums a
          LEFT JOIN shared_album_assets saa ON saa.album_key = a.album_key
          WHERE a.series = $1 AND a.slug = $2
          GROUP BY a.album_key, a.created_at, a.updated_at
          ORDER BY a.updated_at DESC, a.created_at DESC, a.album_key DESC
        `,
        [series, slug]
      );
      return {
        storedAssetCount: Number(assetResult.rows[0]?.c || 0),
        createdAt: albumResult.rows[0]?.created_at || null,
        updatedAt: albumResult.rows[0]?.updated_at || null,
        rows: rowResult.rows.map((row) => ({
          albumKey: row.album_key,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          assetCount: Number(row.asset_count || 0),
        })),
      };
    });
  }

  const row = db
    .prepare(
      `
        SELECT album_key, created_at, updated_at
        FROM shared_albums
        WHERE album_key = ?
        LIMIT 1
      `
    )
    .get(albumKey);
  return {
    storedAssetCount: Number(db.prepare(`SELECT COUNT(*) AS c FROM shared_album_assets WHERE album_key = ?`).get(albumKey)?.c || 0),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    rows: db
      .prepare(
        `
          SELECT
            a.album_key,
            a.created_at,
            a.updated_at,
            COUNT(saa.asset_id) AS asset_count
          FROM shared_albums a
          LEFT JOIN shared_album_assets saa ON saa.album_key = a.album_key
          WHERE a.series = ? AND a.slug = ?
          GROUP BY a.album_key, a.created_at, a.updated_at
          ORDER BY a.updated_at DESC, a.created_at DESC, a.album_key DESC
        `
      )
      .all(series, slug)
      .map((summaryRow) => ({
        albumKey: summaryRow.album_key,
        createdAt: summaryRow.created_at,
        updatedAt: summaryRow.updated_at,
        assetCount: Number(summaryRow.asset_count || 0),
      })),
  };
}

function shortHash(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 12);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shortLink = normalizeUrl(body?.shortLink);
  const areaId = String(body?.areaId || "").trim();
  const series = String(body?.series || "").trim().toLowerCase();
  const year = normalizeYear(body?.year);
  const race = normalizeRace(body?.race);

  if (!shortLink) {
    return NextResponse.json({ error: "A valid Lightroom shared album short link is required" }, { status: 400 });
  }
  if (!series || !isValidSharedAlbumSeries(series)) {
    return NextResponse.json({ error: "series is required and must be one of imsa, wec, or f1" }, { status: 400 });
  }
  if (areaId && !isValidAreaId(areaId)) {
    return NextResponse.json({ error: "Invalid areaId" }, { status: 400 });
  }
  if (year === null) {
    return NextResponse.json({ error: "year must be a 4-digit number" }, { status: 400 });
  }
  if (!race) {
    return NextResponse.json({ error: "race is required" }, { status: 400 });
  }

  let sharePage;
  try {
    sharePage = await fetchText(shortLink);
  } catch (error) {
    return NextResponse.json({ error: `Could not load shared album: ${String(error?.message || error)}` }, { status: 400 });
  }

  let sharesConfig;
  try {
    sharesConfig = parseSharesConfig(sharePage.text);
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 400 });
  }

  const albumFeedHref =
    sharesConfig?.albumAttributes?.links?.["/rels/space_album_images_videos"]?.href ||
    sharesConfig?.spaceAttributes?.resources?.[0]?.links?.["/rels/space_album_images_videos"]?.href ||
    "";
  const albumTitle =
    String(sharesConfig?.albumAttributes?.payload?.name || "").trim() ||
    String(sharesConfig?.spaceAttributes?.resources?.[0]?.payload?.name || "").trim() ||
    "Shared Lightroom Album";
  const photosBase = String(sharesConfig?.albumAttributes?.base || sharesConfig?.spaceAttributes?.base || "").trim();

  if (!albumFeedHref || !photosBase) {
    return NextResponse.json({ error: "Shared album feed was not found in the Lightroom page" }, { status: 400 });
  }

  let albumFeed;
  try {
    albumFeed = await fetchAlbumFeed(toAbsoluteUrl(photosBase, albumFeedHref));
  } catch (error) {
    return NextResponse.json({ error: `Could not load shared album assets: ${String(error?.message || error)}` }, { status: 400 });
  }

  const assetsBase = String(albumFeed?.base || photosBase).trim();
  const feedRows = Array.isArray(albumFeed?.resources) ? albumFeed.resources : [];
  const assets = feedRows
    .map((row) => ({ row, asset: normalizeSharedAlbumFeedRow(row) }))
    .filter(({ asset }) => asset?.id && String(asset?.subtype || asset?.payload?.subtype || "").toLowerCase() !== "video");
  const assetIdCounts = new Map();
  for (const { asset } of assets) {
    const key = String(asset?.id || "").trim();
    if (!key) continue;
    assetIdCounts.set(key, (assetIdCounts.get(key) || 0) + 1);
  }
  const duplicateAssetIds = [...assetIdCounts.entries()].filter(([, count]) => count > 1);

  if (!assets.length) {
    return NextResponse.json({ error: "No shared album images were found" }, { status: 400 });
  }

  const db = getDb();
  const nowIso = new Date().toISOString();
  const projector = getProjectorForTrack(TRACK_ID);
  let pgClient = null;
  let imported = 0;
  let assigned = 0;
  let pinned = 0;
  let coverThumbUrl = "";
  let gpsFoundInFeed = 0;
  let gpsFoundInDetail = 0;
  let gpsMissing = 0;
  let missingRenditions = 0;
  let attemptedStoredAssetCount = 0;
  let actualStoredAssetCount = 0;
  let committedStoredAssetCount = 0;
  let committedAlbumCreatedAt = null;
  let committedAlbumUpdatedAt = null;
  let committedAlbumRows = [];
  let staleAlbumRowCountRemoved = 0;
  const gpsMissingSamples = [];
  const gpsMissingDiagnostics = [];
  const missingRenditionSamples = [];
  const duplicateAssetSamples = [];
  const sourceAlbumId = extractSharedAlbumSourceId(
    assetsBase,
    albumFeedHref,
    sharePage.finalUrl,
    sharesConfig?.albumAttributes?.links?.self?.href,
    sharesConfig?.spaceAttributes?.links?.self?.href
  );
  let slug = slugifyAlbumTitle(albumTitle);
  let albumKey = `${series}:${slug}`;
  let albumTitleToStore = albumTitle;
  let matchedExistingAlbumKey = null;

  try {
    if (hasPostgresConfig()) {
      await ensurePostgresSchema();
      pgClient = new Client({
        connectionString: getPostgresConnectionString(),
        ssl: { rejectUnauthorized: false },
      });
      await pgClient.connect();
    }

    const existingAlbum = await findExistingSharedAlbumMatch({ db, pgClient, series, sourceAlbumId });
    if (existingAlbum?.albumKey && existingAlbum?.slug) {
      matchedExistingAlbumKey = existingAlbum.albumKey;
      slug = existingAlbum.slug;
      albumKey = existingAlbum.albumKey;
      albumTitleToStore = existingAlbum.title || albumTitle;
    }

    await clearSharedAlbumAssets({ db, pgClient, albumKey });
    staleAlbumRowCountRemoved = await removeStaleSharedAlbums({ db, pgClient, albumKey, series, slug });

    for (const { row, asset } of assets) {
      let assetDetail = asset;
      let gpsSource = "feed";
      let gps = extractGpsFromLightroomAsset(assetDetail);
      if (!gps) {
        const fetchedDetail = await fetchSharedAssetDetail(row, assetsBase);
        if (fetchedDetail) {
          assetDetail = fetchedDetail;
          gps = extractGpsFromLightroomAsset(assetDetail);
          if (gps) gpsSource = "detail";
        }
      }

      const captureTime = pickCaptureTime(assetDetail);
      const fileName = String(assetDetail?.payload?.importSource?.fileName || asset?.id).trim() || asset.id;
      const thumbUrl = pickRenditionUrl(assetDetail, asset, assetsBase, "thumb");
      const fullUrl = pickRenditionUrl(assetDetail, asset, assetsBase, "full") || thumbUrl;
      const photoName = fileName;
      const duplicateCount = assetIdCounts.get(asset.id) || 0;
      const uniqueDiscriminator =
        duplicateCount > 1 ? shortHash([photoName, thumbUrl, fullUrl, captureTime].filter(Boolean).join("|")) : "";
      const sharedAssetId =
        duplicateCount > 1
          ? `shared-album:${series}:${slug}:${asset.id}:${uniqueDiscriminator}`
          : `shared-album:${series}:${slug}:${asset.id}`;
      if (duplicateCount > 1 && duplicateAssetSamples.length < 12) {
        duplicateAssetSamples.push({
          asset_id: asset.id,
          file_name: photoName,
          shared_asset_id: sharedAssetId,
          duplicate_count: duplicateCount,
        });
      }
      if (gps) {
        if (gpsSource === "detail") gpsFoundInDetail += 1;
        else gpsFoundInFeed += 1;
      } else {
        gpsMissing += 1;
        if (gpsMissingSamples.length < 12) {
          gpsMissingSamples.push({
            asset_id: asset.id,
            file_name: photoName,
          });
        }
        if (gpsMissingDiagnostics.length < 5) {
          gpsMissingDiagnostics.push({
            asset_id: asset.id,
            file_name: photoName,
            feed_summary: collectGpsDebugSummary(asset),
            detail_summary:
              assetDetail && assetDetail !== asset
                ? collectGpsDebugSummary(assetDetail)
                : null,
          });
        }
      }

      if (!thumbUrl || !fullUrl) {
        missingRenditions += 1;
        if (missingRenditionSamples.length < 12) {
          missingRenditionSamples.push({
            asset_id: asset.id,
            file_name: photoName,
          });
        }
        continue;
      }
      if (!coverThumbUrl) coverThumbUrl = thumbUrl;

      await storePhotoAsset({
        db,
        pgClient,
        assetId: sharedAssetId,
        captureTime,
        altText: `${albumTitle} via Lightroom shared album`,
        thumbUrl,
        fullUrl,
        year,
        race,
        lastSyncedAt: nowIso,
      });

      await storeSharedAlbumAsset({
        db,
        pgClient,
        albumKey,
        assetId: sharedAssetId,
        name: photoName,
        thumbUrl,
        fullUrl,
        year,
        race,
        assignedAt: nowIso,
      });
      attemptedStoredAssetCount += 1;

      if (gps && projector) {
        const pos = projector(gps.lng, gps.lat);
        const pinId = `gps:${sharedAssetId}`;
        await storeGpsPin({
          db,
          pgClient,
          pinId,
          anchorX: pos.x,
          anchorY: pos.y,
          lat: gps.lat,
          lng: gps.lng,
          title: race,
        });
        await storePinAsset({
          db,
          pgClient,
          pinId,
          assetId: sharedAssetId,
          sortOrder: Date.parse(captureTime) || Date.now(),
          addedAt: nowIso,
        });
        pinned += 1;
      }

      if (areaId) {
        await storeAreaAssignment({
          db,
          pgClient,
          areaId,
          assetId: sharedAssetId,
          name: photoName,
          thumbUrl,
          fullUrl,
          year,
          race,
          assignedAt: nowIso,
        });
        assigned += 1;
      }

      imported += 1;
    }

    await storeSharedAlbum({
      db,
      pgClient,
      albumKey,
      series,
      slug,
      title: albumTitleToStore,
      year,
      race,
      sourceAlbumId,
      coverThumbUrl,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    actualStoredAssetCount = await countSharedAlbumAssets({ db, pgClient, albumKey });
  } catch (error) {
    console.error("[share-album:POST] import error", error);
    return NextResponse.json({ error: String(error?.message || error) || "Album import failed" }, { status: 503 });
  } finally {
    if (pgClient) {
      try {
        await pgClient.end();
      } catch {
        // ignore connection close errors
      }
    }
  }

  const committedSummary = await loadCommittedSharedAlbumSummary({ db, albumKey, series, slug });
  committedStoredAssetCount = committedSummary.storedAssetCount;
  committedAlbumCreatedAt = committedSummary.createdAt;
  committedAlbumUpdatedAt = committedSummary.updatedAt;
  committedAlbumRows = Array.isArray(committedSummary.rows) ? committedSummary.rows : [];

  const dbIdentity = getPostgresIdentity();

  return NextResponse.json({
    ok: true,
    feed_resource_count: feedRows.length,
    normalized_asset_count: assets.length,
    unique_asset_id_count: assetIdCounts.size,
    duplicate_asset_id_count: duplicateAssetIds.length,
    duplicate_asset_samples: duplicateAssetSamples,
    imported_count: imported,
    attempted_stored_asset_count: attemptedStoredAssetCount,
    stored_asset_count: actualStoredAssetCount,
    committed_stored_asset_count: committedStoredAssetCount,
    committed_album_created_at: committedAlbumCreatedAt,
    committed_album_updated_at: committedAlbumUpdatedAt,
    committed_album_rows: committedAlbumRows,
    stale_album_row_count_removed: staleAlbumRowCountRemoved,
    db_source: dbIdentity.source,
    db_host: dbIdentity.host,
    db_name: dbIdentity.dbName,
    db_user: dbIdentity.user,
    db_fingerprint: dbIdentity.fingerprint,
    assigned_count: assigned,
    pinned_count: pinned,
    gps_found_in_feed_count: gpsFoundInFeed,
    gps_found_in_detail_count: gpsFoundInDetail,
    gps_missing_count: gpsMissing,
    gps_missing_samples: gpsMissingSamples,
    gps_missing_diagnostics: gpsMissingDiagnostics,
    missing_renditions_count: missingRenditions,
    missing_rendition_samples: missingRenditionSamples,
    album_title: albumTitle,
    album_slug: slug,
    matched_existing_album_key: matchedExistingAlbumKey,
    source_album_id: sourceAlbumId || null,
    album_href: `/${series}/albums/${slug}`,
    race,
    year,
  });
}
