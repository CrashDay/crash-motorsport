import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { Client } from "pg";
import { getDb, getPhotoAsset, getSharedAlbumBySlug, getSharedAlbumAssetsByAlbumKey, upsertGpsPin, upsertPinAsset } from "@/lib/db";
import { getProjectorForTrack } from "@/lib/geo-projector";
import { readPhotoMetadataFromExiftool } from "@/lib/exiftool-gps";
import { isValidSharedAlbumSeries } from "@/lib/shared-albums";

const TRACK_ID = "sebring";
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|heic|heif|tif|tiff)$/i;

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

function normalizeRelativeFolder(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = path.posix.normalize(raw.replace(/\\/g, "/"));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) return "";
  return normalized.replace(/^\/+/, "");
}

function getLocalExportsRoot() {
  return process.env.LOCAL_EXPORTS_ROOT
    ? path.resolve(process.env.LOCAL_EXPORTS_ROOT)
    : path.join(process.cwd(), "data", "local-exports");
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
  const name = normalizeName(value);
  if (!name) return "";
  return name.replace(/\.[a-z0-9]+$/i, "");
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

async function getSharedAlbumAssetsWithCaptureTime(series, slug, pgClient = null) {
  if (hasPostgresConfig()) {
    const run = async (client) => {
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
    };
    if (pgClient) return run(pgClient);
    return withPgClient(run);
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

async function storeGpsPinAndAsset({ pgClient = null, pinId, assetId, anchorX, anchorY, lat, lng, title, sortOrder, addedAt }) {
  if (hasPostgresConfig()) {
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

  const db = getDb();
  upsertGpsPin(db, {
    pin_id: pinId,
    track_id: TRACK_ID,
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

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const series = String(body?.series || "").trim().toLowerCase();
  const slug = String(body?.albumSlug || "").trim();
  const localFolder = normalizeRelativeFolder(body?.localFolder);

  if (!series || !isValidSharedAlbumSeries(series)) {
    return NextResponse.json({ error: "series is required and must be one of imsa, wec, or f1" }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json({ error: "albumSlug is required. Import the shared album first in this session." }, { status: 400 });
  }
  if (!localFolder) {
    return NextResponse.json({ error: "A local export folder is required" }, { status: 400 });
  }

  const root = getLocalExportsRoot();
  const targetDir = path.resolve(root, localFolder);
  const relative = path.relative(root, targetDir);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return NextResponse.json({ error: "localFolder must stay inside LOCAL_EXPORTS_ROOT" }, { status: 400 });
  }
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return NextResponse.json({ error: `Local folder not found: ${localFolder}` }, { status: 400 });
  }

  const projector = getProjectorForTrack(TRACK_ID);
  if (!projector) {
    return NextResponse.json({ error: `Track projector is not configured for ${TRACK_ID}` }, { status: 500 });
  }

  const localFiles = listImagesRecursive(targetDir);
  if (!localFiles.length) {
    return NextResponse.json({ error: "No images found in the local export folder" }, { status: 400 });
  }

  let pgClient = null;
  let album;
  try {
    if (hasPostgresConfig()) {
      pgClient = new Client({
        connectionString: getPostgresConnectionString(),
        ssl: { rejectUnauthorized: false },
      });
      await pgClient.connect();
    }
    album = await getSharedAlbumAssetsWithCaptureTime(series, slug, pgClient);
    if (!album) {
      return NextResponse.json({ error: "Shared album not found. Import the shared album first." }, { status: 404 });
    }
    if (!album.assets.length) {
      return NextResponse.json({ error: "Shared album has no imported assets to match against." }, { status: 400 });
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

    const nowIso = new Date().toISOString();
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
        if (unmatchedSamples.length < 8) {
          unmatchedSamples.push({
            file_name: fileName,
            capture_time: metadata.captureTime,
            reason: hasAmbiguousCandidates ? "ambiguous_match" : "no_match",
          });
        }
        continue;
      }

      matchedAssetIds.add(matched.assetId);
      if (matchMethod === "capture_time") matchedByCaptureTimeCount += 1;
      else matchedByFilenameCount += 1;

      const pos = projector(metadata.gps.lon, metadata.gps.lat);
      await storeGpsPinAndAsset({
        pgClient,
        pinId: `gps:${matched.assetId}`,
        assetId: matched.assetId,
        anchorX: pos.x,
        anchorY: pos.y,
        lat: metadata.gps.lat,
        lng: metadata.gps.lon,
        title: album.title || "GPS",
        sortOrder: Date.parse(matched.captureTime || metadata.captureTime || nowIso) || Date.now(),
        addedAt: nowIso,
      });
      pinnedCount += 1;

      if (matchedSamples.length < 8) {
        matchedSamples.push({
          asset_id: matched.assetId,
          asset_name: matched.assetName,
          file_name: fileName,
          match_method: matchMethod,
          capture_time: metadata.captureTime,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      album_slug: slug,
      album_title: album.title,
      local_folder: localFolder,
      local_file_count: localFiles.length,
      local_gps_file_count: gpsFileCount,
      pinned_count: pinnedCount,
      matched_by_filename_count: matchedByFilenameCount,
      matched_by_capture_time_count: matchedByCaptureTimeCount,
      ambiguous_match_count: ambiguousCount,
      unmatched_local_gps_count: Math.max(0, gpsFileCount - pinnedCount),
      unmatched_album_asset_count: Math.max(0, album.assets.length - pinnedCount),
      matched_samples: matchedSamples,
      unmatched_samples: unmatchedSamples,
    });
  } finally {
    if (pgClient) {
      try {
        await pgClient.end();
      } catch {
        // ignore close errors
      }
    }
  }
}
