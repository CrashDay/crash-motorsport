import fs from "fs";
import path from "path";
import { Client } from "pg";
import { getMapPageConfig, getMapPageConfigs } from "@/lib/map-page-configs";

const LOCAL_MAP_PAGES_PATH = path.join(process.cwd(), "data", "map-pages.json");

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

function normalizePgMapPage(row) {
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

async function loadDatabaseMapPages() {
  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    return withPgClient(async (client) => {
      const rows = await client.query(`
        SELECT track_id, title, center_lat, center_lng, zoom, geo_json, load_pins, created_at, updated_at
        FROM map_pages
        ORDER BY title ASC
      `);
      return rows.rows.map(normalizePgMapPage);
    });
  }

  return loadLocalMapPages();
}

async function loadDatabaseMapPage(trackId) {
  if (hasPostgresConfig()) {
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
      return normalizePgMapPage(rows.rows[0]);
    });
  }

  return loadLocalMapPages().find((page) => page.id === trackId) || null;
}

function loadLocalMapPages() {
  if (!fs.existsSync(LOCAL_MAP_PAGES_PATH)) return [];
  const raw = JSON.parse(fs.readFileSync(LOCAL_MAP_PAGES_PATH, "utf8"));
  return (Array.isArray(raw) ? raw : []).map((page) => ({
    id: page.id,
    title: page.title,
    center: Array.isArray(page.center) ? [Number(page.center[0]), Number(page.center[1])] : [Number(page.centerLat), Number(page.centerLng)],
    zoom: Number(page.zoom) || 15,
    geoJson: page.geoJson || null,
    loadPins: page.loadPins !== false,
    createdAt: page.createdAt || null,
    updatedAt: page.updatedAt || null,
  }));
}

function saveLocalMapPage(input, now) {
  const pages = loadLocalMapPages();
  const nextPage = {
    id: input.trackId,
    title: input.title,
    center: [input.centerLat, input.centerLng],
    zoom: input.zoom,
    geoJson: input.geoJsonText ? JSON.parse(input.geoJsonText) : null,
    loadPins: input.loadPins,
    createdAt: pages.find((page) => page.id === input.trackId)?.createdAt || now,
    updatedAt: now,
  };
  const nextPages = pages.filter((page) => page.id !== input.trackId).concat(nextPage).sort((a, b) => a.title.localeCompare(b.title));
  fs.mkdirSync(path.dirname(LOCAL_MAP_PAGES_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_MAP_PAGES_PATH, `${JSON.stringify(nextPages, null, 2)}\n`);
}

function readJson(relativePath) {
  if (!relativePath) return null;
  const filePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hydrateStaticMapPage(config) {
  if (!config) return null;
  return {
    ...config,
    mapGeoJson: readJson(config.geoJsonPath),
    photoMarkers: readJson(config.photoMarkersPath) || [],
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

  return hydrateStoredMapPage(await loadDatabaseMapPage(normalized));
}

export async function loadMapPages() {
  const builtinPages = getMapPageConfigs().map((config) => ({
    id: config.id,
    title: config.title,
    center: config.center,
    zoom: config.zoom,
    loadPins: config.loadPins,
    builtin: true,
  }));
  const storedPages = (await loadDatabaseMapPages()).map((page) => ({
    ...page,
    builtin: false,
  }));
  return [...builtinPages, ...storedPages].sort((a, b) => a.title.localeCompare(b.title));
}

export function normalizeTrackId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeMapPageInput(body) {
  const title = String(body?.title || "").trim();
  const explicitTrackId = normalizeTrackId(body?.trackId);
  const trackId = explicitTrackId || normalizeTrackId(title);
  const centerLat = Number(body?.centerLat);
  const centerLng = Number(body?.centerLng);
  const zoom = Number(body?.zoom || 15);
  const loadPins = body?.loadPins !== false && body?.loadPins !== "false";
  const geoJsonText = String(body?.geoJson || "").trim();
  let geoJson = null;

  if (geoJsonText) {
    geoJson = JSON.parse(geoJsonText);
    if (!geoJson || typeof geoJson !== "object") {
      throw new Error("GeoJSON must be a JSON object.");
    }
  }

  if (!trackId) throw new Error("Map URL slug is required.");
  if (!title) throw new Error("Map title is required.");
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
    throw new Error("Center latitude and longitude are required.");
  }
  if (!Number.isFinite(zoom) || zoom < 1 || zoom > 22) {
    throw new Error("Zoom must be between 1 and 22.");
  }
  if (getMapPageConfig(trackId)) {
    throw new Error("That map slug is reserved for a built-in map.");
  }

  return {
    trackId,
    title,
    centerLat,
    centerLng,
    zoom: Math.round(zoom),
    loadPins,
    geoJsonText: geoJson ? JSON.stringify(geoJson) : "",
  };
}

export async function saveMapPage(input) {
  const now = new Date().toISOString();

  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    await withPgClient(async (client) => {
      await client.query(
        `
          INSERT INTO map_pages (track_id, title, center_lat, center_lng, zoom, geo_json, load_pins, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
          ON CONFLICT (track_id) DO UPDATE SET
            title = EXCLUDED.title,
            center_lat = EXCLUDED.center_lat,
            center_lng = EXCLUDED.center_lng,
            zoom = EXCLUDED.zoom,
            geo_json = EXCLUDED.geo_json,
            load_pins = EXCLUDED.load_pins,
            updated_at = EXCLUDED.updated_at
        `,
        [input.trackId, input.title, input.centerLat, input.centerLng, input.zoom, input.geoJsonText || null, input.loadPins ? 1 : 0, now]
      );
    });
    return;
  }

  saveLocalMapPage(input, now);
}
