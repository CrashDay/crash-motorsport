import { Client } from "pg";
import {
  getDb,
  getPhotoAsset,
  getSharedAlbumAssetsByAlbumKey,
  getSharedAlbumBySlug,
  upsertGpsPin,
  upsertPinAsset,
} from "@/lib/db";
import { getProjectorForTrack } from "@/lib/geo-projector";

const TRACK_ID = "sebring";
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

async function storeGpsPinAssignment({ assetId, lat, lng, anchorX, anchorY, title, sortOrder, addedAt }) {
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
    });
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

export function normalizeLocalGpsFiles(localFiles) {
  return (Array.isArray(localFiles) ? localFiles : [])
    .map((file) => ({
      fileName: String(file?.fileName || "").trim(),
      captureTime: String(file?.captureTime || "").trim(),
      gps:
        Number.isFinite(Number(file?.gps?.lat)) && Number.isFinite(Number(file?.gps?.lon))
          ? { lat: Number(file.gps.lat), lon: Number(file.gps.lon) }
          : null,
    }))
    .filter((file) => file.fileName);
}

export async function runLocalGpsImport({ series, slug, localFiles, dryRun = false, metadataSource = "browser" }) {
  const normalizedSeries = String(series || "").trim().toLowerCase();
  const normalizedSlug = String(slug || "").trim();
  if (!VALID_SERIES.has(normalizedSeries) || !normalizedSlug) {
    throw new Error("series and slug are required");
  }

  const validLocalFiles = normalizeLocalGpsFiles(localFiles);
  if (!validLocalFiles.length) {
    throw new Error("No local files were provided");
  }

  const projector = getProjectorForTrack(TRACK_ID);
  if (!projector) {
    throw new Error(`Track projector is not configured for ${TRACK_ID}`);
  }

  const album = await loadAlbumAssets(normalizedSeries, normalizedSlug);
  if (!album) {
    throw new Error(`Shared album not found for ${normalizedSeries}/${normalizedSlug}`);
  }
  if (!album.assets.length) {
    throw new Error(`Shared album ${normalizedSeries}/${normalizedSlug} has no imported assets.`);
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

  for (const file of validLocalFiles) {
    if (!file.gps) continue;
    gpsFileCount += 1;

    const exactName = normalizeName(file.fileName);
    const stem = normalizeStem(file.fileName);
    const epochSecond = toEpochSecond(file.captureTime);

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
          fileName: file.fileName,
          captureTime: file.captureTime,
          reason: hasAmbiguousCandidates ? "ambiguous_match" : "no_match",
        });
      }
      continue;
    }

    matchedAssetIds.add(matched.assetId);
    if (matchMethod === "capture_time") matchedByCaptureTimeCount += 1;
    else matchedByFilenameCount += 1;

    if (!dryRun) {
      const pos = projector(file.gps.lon, file.gps.lat);
      await storeGpsPinAssignment({
        assetId: matched.assetId,
        lat: file.gps.lat,
        lng: file.gps.lon,
        anchorX: pos.x,
        anchorY: pos.y,
        title: album.title || "GPS",
        sortOrder: Date.parse(matched.captureTime || file.captureTime || new Date().toISOString()) || Date.now(),
        addedAt: new Date().toISOString(),
      });
    }

    pinnedCount += 1;
    if (matchedSamples.length < 10) {
      matchedSamples.push({
        assetId: matched.assetId,
        assetName: matched.assetName,
        fileName: file.fileName,
        matchMethod,
        captureTime: file.captureTime,
      });
    }
  }

  return {
    mode: dryRun ? "dry-run" : "write",
    database: hasPostgresConfig() ? "postgres" : "sqlite",
    databaseSource: getPostgresConfig().source || null,
    metadataSource,
    album: `${normalizedSeries}/${normalizedSlug}`,
    albumAssetCount: album.assets.length,
    localFileCount: validLocalFiles.length,
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
}
