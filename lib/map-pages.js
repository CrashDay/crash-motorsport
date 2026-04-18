import danielsPhotoMarkers from "@/data/daniels-photo-markers.json";
import sebringGeoJson from "@/data/map-geojson/sebring.json";
import danielsParkGeoJson from "@/data/map-geojson/daniels-park.json";
import daytonaRoadCourseGeoJson from "@/data/map-geojson/daytona-road-course.json";
import { getMapPageConfig, getMapPageConfigs } from "@/lib/map-page-configs";

const STATIC_MAP_DATA = {
  sebring: {
    mapGeoJson: sebringGeoJson,
    photoMarkers: [],
  },
  "daniels-park": {
    mapGeoJson: danielsParkGeoJson,
    photoMarkers: danielsPhotoMarkers,
  },
  "daytona-road-course": {
    mapGeoJson: daytonaRoadCourseGeoJson,
    photoMarkers: [],
  },
};

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
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: getPostgresConnectionString(),
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
  if (!hasPostgresConfig()) return;
  await withPgClient(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS map_pages (
        track_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        center_lat DOUBLE PRECISION NOT NULL,
        center_lng DOUBLE PRECISION NOT NULL,
        zoom INTEGER NOT NULL,
        geo_json TEXT,
        load_pins INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await client.query(`ALTER TABLE map_pages ADD COLUMN IF NOT EXISTS geo_json TEXT`);
    await client.query(`ALTER TABLE map_pages ADD COLUMN IF NOT EXISTS load_pins INTEGER NOT NULL DEFAULT 1`);
  });
}

function normalizeStoredMapPage(row) {
  if (!row) return null;
  return {
    id: row.track_id,
    title: row.title,
    center: [Number(row.center_lat), Number(row.center_lng)],
    zoom: Number(row.zoom) || 15,
    geoJson: row.geo_json ? JSON.parse(row.geo_json) : null,
    loadPins: Boolean(Number(row.load_pins)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadStoredMapPage(trackId) {
  if (!hasPostgresConfig()) return null;
  await ensurePostgresSchema();
  return withPgClient(async (client) => {
    const rows = await client.query(
      `
        SELECT track_id, title, center_lat, center_lng, zoom, geo_json, load_pins, created_at, updated_at
        FROM map_pages
        WHERE track_id = $1
        LIMIT 1
      `,
      [trackId]
    );
    return normalizeStoredMapPage(rows.rows[0]);
  });
}

function hydrateStaticMapPage(config) {
  if (!config) return null;
  const staticData = STATIC_MAP_DATA[config.id] || {};
  return {
    ...config,
    mapGeoJson: staticData.mapGeoJson || null,
    photoMarkers: staticData.photoMarkers || [],
    builtin: true,
  };
}

function hydrateStoredMapPage(config) {
  if (!config) return null;
  return {
    ...config,
    mapGeoJson: config.geoJson || null,
    photoMarkers: [],
    builtin: false,
  };
}

export async function loadMapPage(trackId) {
  const normalized = String(trackId || "").trim().toLowerCase();
  const staticConfig = getMapPageConfig(normalized);
  if (staticConfig) return hydrateStaticMapPage(staticConfig);

  return hydrateStoredMapPage(await loadStoredMapPage(normalized));
}

export function loadBuiltinMapSummaries() {
  return getMapPageConfigs().map((config) => ({
    id: config.id,
    title: config.title,
    center: config.center,
    zoom: config.zoom,
    loadPins: config.loadPins,
    builtin: true,
  }));
}
