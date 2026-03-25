import { NextResponse } from "next/server";
import { Client } from "pg";
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

async function storeAreaAssignment({ db, areaId, assetId, name, thumbUrl, fullUrl, year, race, assignedAt }) {
  if (!areaId) return;
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    await withPgClient(async (client) => {
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
    });
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

async function storePhotoAsset({ db, assetId, captureTime, altText, thumbUrl, fullUrl, year, race, lastSyncedAt }) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    await withPgClient(async (client) => {
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
    });
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

async function storeGpsPin({ db, pinId, anchorX, anchorY, lat, lng, title }) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    await withPgClient(async (client) => {
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
    });
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

async function storePinAsset({ db, pinId, assetId, sortOrder, addedAt }) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    await withPgClient(async (client) => {
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
    });
    return;
  }
  upsertPinAsset(db, {
    pin_id: pinId,
    asset_id: assetId,
    sort_order: sortOrder,
    added_at: addedAt,
  });
}

async function storeSharedAlbum({ db, albumKey, series, slug, title, year, race, coverThumbUrl, createdAt, updatedAt }) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    await withPgClient(async (client) => {
      await client.query(
        `
          INSERT INTO shared_albums (album_key, series, slug, title, year, race, cover_thumb_url, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (album_key) DO UPDATE SET
            series = EXCLUDED.series,
            slug = EXCLUDED.slug,
            title = EXCLUDED.title,
            year = EXCLUDED.year,
            race = EXCLUDED.race,
            cover_thumb_url = EXCLUDED.cover_thumb_url,
            updated_at = EXCLUDED.updated_at
        `,
        [albumKey, series, slug, title, year, race, coverThumbUrl, createdAt, updatedAt]
      );
    });
    return;
  }
  upsertSharedAlbum(db, {
    album_key: albumKey,
    series,
    slug,
    title,
    year,
    race,
    cover_thumb_url: coverThumbUrl,
    created_at: createdAt,
    updated_at: updatedAt,
  });
}

async function storeSharedAlbumAsset({ db, albumKey, assetId, name, thumbUrl, fullUrl, year, race, assignedAt }) {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    await withPgClient(async (client) => {
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
    });
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

  if (!assets.length) {
    return NextResponse.json({ error: "No shared album images were found" }, { status: 400 });
  }

  const slug = slugifyAlbumTitle(albumTitle);
  const albumKey = `${series}:${slug}`;
  const db = getDb();
  const nowIso = new Date().toISOString();
  const projector = getProjectorForTrack(TRACK_ID);
  let imported = 0;
  let assigned = 0;
  let pinned = 0;
  let coverThumbUrl = "";
  let gpsFoundInFeed = 0;
  let gpsFoundInDetail = 0;
  let gpsMissing = 0;
  const gpsMissingSamples = [];

  try {
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

      const sharedAssetId = `shared-album:${series}:${slug}:${asset.id}`;
      const captureTime = pickCaptureTime(assetDetail);
      const fileName = String(assetDetail?.payload?.importSource?.fileName || asset?.id).trim() || asset.id;
      const thumbUrl = normalizeLightroomImageUrl(
        toAbsoluteUrl(
          assetsBase,
          assetDetail?.links?.["/rels/rendition_type/thumbnail2x"]?.href ||
            asset?.links?.["/rels/rendition_type/thumbnail2x"]?.href
        )
      );
      const fullUrl = normalizeLightroomImageUrl(
        toAbsoluteUrl(
          assetsBase,
          assetDetail?.links?.["/rels/rendition_type/2048"]?.href || asset?.links?.["/rels/rendition_type/2048"]?.href
        ) ||
          toAbsoluteUrl(
            assetsBase,
            assetDetail?.links?.["/rels/rendition_type/fullsize"]?.href ||
              asset?.links?.["/rels/rendition_type/fullsize"]?.href
          )
      );
      const photoName = fileName;
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
      }

      if (!thumbUrl || !fullUrl) continue;
      if (!coverThumbUrl) coverThumbUrl = thumbUrl;

      await storePhotoAsset({
        db,
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
        albumKey,
        assetId: sharedAssetId,
        name: photoName,
        thumbUrl,
        fullUrl,
        year,
        race,
        assignedAt: nowIso,
      });

      if (gps && projector) {
        const pos = projector(gps.lng, gps.lat);
        const pinId = `gps:${sharedAssetId}`;
        await storeGpsPin({
          db,
          pinId,
          anchorX: pos.x,
          anchorY: pos.y,
          lat: gps.lat,
          lng: gps.lng,
          title: race,
        });
        await storePinAsset({
          db,
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
      albumKey,
      series,
      slug,
      title: albumTitle,
      year,
      race,
      coverThumbUrl,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  } catch (error) {
    console.error("[share-album:POST] import error", error);
    return NextResponse.json({ error: String(error?.message || error) || "Album import failed" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    feed_resource_count: feedRows.length,
    normalized_asset_count: assets.length,
    imported_count: imported,
    assigned_count: assigned,
    pinned_count: pinned,
    gps_found_in_feed_count: gpsFoundInFeed,
    gps_found_in_detail_count: gpsFoundInDetail,
    gps_missing_count: gpsMissing,
    gps_missing_samples: gpsMissingSamples,
    album_title: albumTitle,
    album_slug: slug,
    album_href: `/${series}/albums/${slug}`,
    race,
    year,
  });
}
