#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { getDb, getPhotoAsset, getSharedAlbumBySlug, getSharedAlbumAssetsByAlbumKey, upsertGpsPin, upsertPinAsset } = require("../lib/db");
const { readPhotoMetadataFromExiftool } = require("../lib/exiftool-gps");
const { getProjectorForTrack } = require("../lib/geo-projector");

const DEFAULT_TRACK_ID = "sebring";
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|heic|heif|tif|tiff)$/i;
const VALID_SERIES = new Set(["imsa", "wec", "f1"]);

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

function hasPostgresConfig() {
  return Boolean(getPostgresConfig().value);
}

function usage() {
  console.error(
    [
      "Usage:",
      "  node scripts/import-shared-album-local-gps.cjs --series <imsa|wec|f1> --slug <album-slug> --folder <path> [--track <track-id>] [--album-api-base <url>]",
      "",
      "Examples:",
      "  POSTGRES_URL=... node scripts/import-shared-album-local-gps.cjs --series imsa --slug sebring-thursday --folder ~/Pictures/sebring-thursday --album-api-base https://crashdaypics.com",
      "  DATABASE_PATH=data/app.db node scripts/import-shared-album-local-gps.cjs --series imsa --slug sebring-thursday --folder ./exports/sebring-thursday",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = { series: "", slug: "", folder: "", trackId: DEFAULT_TRACK_ID, dryRun: false, albumApiBase: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--series") args.series = String(argv[i + 1] || "").trim().toLowerCase();
    else if (arg === "--slug") args.slug = String(argv[i + 1] || "").trim();
    else if (arg === "--folder") args.folder = String(argv[i + 1] || "").trim();
    else if (arg === "--track") args.trackId = String(argv[i + 1] || "").trim().toLowerCase();
    else if (arg === "--album-api-base") args.albumApiBase = String(argv[i + 1] || "").trim();
    else if (arg === "--dry-run") args.dryRun = true;
    else continue;
    if (arg !== "--dry-run") i += 1;
  }
  return args;
}

function normalizeAlbumApiBase(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function listImagesRecursive(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listImagesRecursive(abs));
      continue;
    }
    if (entry.isFile() && IMAGE_EXT_RE.test(entry.name)) {
      files.push(abs);
    }
  }
  return files;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStem(value) {
  return normalizeName(value).replace(/\.[a-z0-9]+$/i, "");
}

function toEpochSecond(value) {
  const epoch = Date.parse(String(value || ""));
  if (!Number.isFinite(epoch)) return null;
  return Math.floor(epoch / 1000);
}

function pushMapValue(map, key, value) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function findUniqueUnmatched(candidates, matchedAssetIds) {
  const available = (candidates || []).filter((candidate) => !matchedAssetIds.has(candidate.assetId));
  return available.length === 1 ? available[0] : null;
}

async function withPgClient(fn) {
  const { value: connectionString, source } = getPostgresConfig();
  if (!connectionString) throw new Error("Missing Postgres connection string");
  let hostname = "";
  try {
    hostname = new URL(connectionString).hostname;
  } catch {
    throw new Error(`Invalid Postgres connection string in ${source}`);
  }
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(`Failed to connect using ${source} (${hostname}): ${String(error?.message || error)}`);
  }
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function loadAlbumAssets(series, slug) {
  const albumApiBase = normalizeAlbumApiBase(process.env.SHARED_ALBUM_API_BASE || global.__sharedAlbumApiBase || "");
  if (albumApiBase) {
    const url = `${albumApiBase}/api/shared-albums/${encodeURIComponent(series)}/${encodeURIComponent(slug)}?t=${Date.now()}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "CrashDayPicsLocalGps/1.0",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Album API request failed: HTTP ${response.status} for ${url}`);
    }
    const payload = await response.json();
    const album = payload?.album;
    if (!album) return null;
    return {
      albumKey: album.albumKey,
      title: album.title,
      assets: Array.isArray(album.assets)
        ? album.assets.map((asset) => ({
            assetId: asset.id,
            assetName: asset.name || asset.id,
            captureTime: asset.captureTime || asset.capture_time || null,
          }))
        : [],
    };
  }

  if (hasPostgresConfig()) {
    return withPgClient(async (client) => {
      const albumRows = await client.query(
        `
          SELECT album_key, title
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
          SELECT saa.asset_id, saa.asset_name, pa.capture_time
          FROM shared_album_assets saa
          LEFT JOIN photo_assets pa ON pa.asset_id = saa.asset_id
          WHERE saa.album_key = $1
          ORDER BY saa.assigned_at DESC
        `,
        [album.album_key]
      );
      return {
        albumKey: album.album_key,
        title: album.title,
        assets: assetRows.rows.map((row) => ({
          assetId: row.asset_id,
          assetName: row.asset_name || row.asset_id,
          captureTime: row.capture_time || null,
        })),
      };
    });
  }

  const db = getDb();
  const album = getSharedAlbumBySlug(db, { series, slug });
  if (!album) return null;
  return {
    albumKey: album.albumKey,
    title: album.title,
    assets: getSharedAlbumAssetsByAlbumKey(db, album.albumKey).map((asset) => {
      const photo = getPhotoAsset(db, asset.id);
      return {
        assetId: asset.id,
        assetName: asset.name || asset.id,
        captureTime: photo?.capture_time || null,
      };
    }),
  };
}

async function storeGpsPinAssignment({ trackId, assetId, lat, lng, anchorX, anchorY, title, sortOrder, addedAt }) {
  const pinId = `gps:${assetId}`;

  if (hasPostgresConfig()) {
    return withPgClient(async (client) => {
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
        [pinId, trackId, anchorX, anchorY, lat, lng, "gps", title]
      );
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
  }

  const db = getDb();
  upsertGpsPin(db, {
    pin_id: pinId,
    track_id: trackId,
    anchor_x: anchorX,
    anchor_y: anchorY,
    lat,
    lng,
    title,
  });
  upsertPinAsset(db, {
    pin_id: pinId,
    asset_id: assetId,
    sort_order: sortOrder,
    added_at: addedAt,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!VALID_SERIES.has(args.series) || !args.slug || !args.folder) {
    usage();
    process.exitCode = 1;
    return;
  }

  const folder = path.resolve(args.folder);
  global.__sharedAlbumApiBase = normalizeAlbumApiBase(args.albumApiBase);
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new Error(`Folder not found: ${folder}`);
  }

  const trackId = args.trackId || DEFAULT_TRACK_ID;
  const projector = getProjectorForTrack(trackId);
  if (!projector) {
    throw new Error(`Track projector is not configured for ${trackId}`);
  }

  const album = await loadAlbumAssets(args.series, args.slug);
  if (!album) {
    throw new Error(`Shared album not found for ${args.series}/${args.slug}. Import the shared album first.`);
  }
  if (!album.assets.length) {
    throw new Error(`Shared album ${args.series}/${args.slug} has no imported assets.`);
  }

  const localFiles = listImagesRecursive(folder);
  if (!localFiles.length) {
    throw new Error(`No image files found under ${folder}`);
  }

  const byName = new Map();
  const byStem = new Map();
  const byTime = new Map();
  for (const asset of album.assets) {
    pushMapValue(byName, normalizeName(asset.assetName), asset);
    pushMapValue(byStem, normalizeStem(asset.assetName), asset);
    const epochSecond = toEpochSecond(asset.captureTime);
    if (epochSecond !== null) pushMapValue(byTime, String(epochSecond), asset);
  }

  const matchedAssetIds = new Set();
  const matchedSamples = [];
  const unmatchedSamples = [];
  let gpsFileCount = 0;
  let pinnedCount = 0;
  let matchedByFilenameCount = 0;
  let matchedByCaptureTimeCount = 0;
  let ambiguousCount = 0;

  for (const filePath of localFiles) {
    const metadata = readPhotoMetadataFromExiftool(filePath);
    if (!metadata?.gps) continue;
    gpsFileCount += 1;

    const fileName = metadata.fileName || path.basename(filePath);
    const exactName = normalizeName(fileName);
    const stem = normalizeStem(fileName);
    const epochSecond = toEpochSecond(metadata.captureTime);

    let matched = findUniqueUnmatched(byName.get(exactName), matchedAssetIds);
    let matchMethod = matched ? "filename" : "";

    if (!matched) {
      matched = findUniqueUnmatched(byStem.get(stem), matchedAssetIds);
      if (matched) matchMethod = "stem";
    }

    if (!matched && epochSecond !== null) {
      matched = findUniqueUnmatched(byTime.get(String(epochSecond)), matchedAssetIds);
      if (matched) matchMethod = "capture_time";
    }

    if (!matched) {
      const hasAmbiguousCandidates =
        ((byName.get(exactName) || []).filter((candidate) => !matchedAssetIds.has(candidate.assetId)).length > 1) ||
        ((byStem.get(stem) || []).filter((candidate) => !matchedAssetIds.has(candidate.assetId)).length > 1) ||
        (epochSecond !== null &&
          (byTime.get(String(epochSecond)) || []).filter((candidate) => !matchedAssetIds.has(candidate.assetId)).length > 1);
      if (hasAmbiguousCandidates) ambiguousCount += 1;
      if (unmatchedSamples.length < 10) {
        unmatchedSamples.push({
          fileName,
          captureTime: metadata.captureTime,
          reason: hasAmbiguousCandidates ? "ambiguous_match" : "no_match",
        });
      }
      continue;
    }

    matchedAssetIds.add(matched.assetId);
    if (matchMethod === "capture_time") matchedByCaptureTimeCount += 1;
    else matchedByFilenameCount += 1;

    if (!args.dryRun) {
      const pos = projector(metadata.gps.lon, metadata.gps.lat);
      await storeGpsPinAssignment({
        trackId,
        assetId: matched.assetId,
        lat: metadata.gps.lat,
        lng: metadata.gps.lon,
        anchorX: pos.x,
        anchorY: pos.y,
        title: album.title || "GPS",
        sortOrder: Date.parse(matched.captureTime || metadata.captureTime || new Date().toISOString()) || Date.now(),
        addedAt: new Date().toISOString(),
      });
    }

    pinnedCount += 1;
    if (matchedSamples.length < 10) {
      matchedSamples.push({
        assetId: matched.assetId,
        assetName: matched.assetName,
        fileName,
        matchMethod,
        captureTime: metadata.captureTime,
      });
    }
  }

  const summary = {
    mode: args.dryRun ? "dry-run" : "write",
    database: hasPostgresConfig() ? "postgres" : "sqlite",
    databaseSource: getPostgresConfig().source || null,
    albumSource: global.__sharedAlbumApiBase ? "album-api" : hasPostgresConfig() ? "database" : "sqlite",
    album: `${args.series}/${args.slug}`,
    trackId,
    folder,
    albumAssetCount: album.assets.length,
    localFileCount: localFiles.length,
    localGpsFileCount: gpsFileCount,
    pinnedCount,
    matchedByFilenameCount,
    matchedByCaptureTimeCount,
    ambiguousCount,
    unmatchedLocalGpsCount: Math.max(0, gpsFileCount - pinnedCount),
    unmatchedAlbumAssetCount: Math.max(0, album.assets.length - pinnedCount),
    matchedSamples,
    unmatchedSamples,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
