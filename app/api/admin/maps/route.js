import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getMapPageConfig, getMapPageConfigs } from "@/lib/map-page-configs";

export const dynamic = "force-dynamic";

const LOCAL_MAP_PAGES_PATH = "data/map-pages.json";

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

function normalizeStoredMap(row) {
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
    builtin: false,
  };
}

function builtinMaps() {
  return getMapPageConfigs().map((config) => ({
    id: config.id,
    title: config.title,
    center: config.center,
    zoom: config.zoom,
    loadPins: config.loadPins,
    builtin: true,
  }));
}

async function loadLocalMaps() {
  const fs = await import("fs");
  const path = await import("path");
  const filePath = path.join(process.cwd(), LOCAL_MAP_PAGES_PATH);
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return (Array.isArray(raw) ? raw : []).map((page) => ({
    ...page,
    builtin: false,
  }));
}

async function saveLocalMap(input, now) {
  const fs = await import("fs");
  const path = await import("path");
  const filePath = path.join(process.cwd(), LOCAL_MAP_PAGES_PATH);
  const maps = await loadLocalMaps();
  const nextMap = {
    id: input.trackId,
    title: input.title,
    center: [input.centerLat, input.centerLng],
    zoom: input.zoom,
    geoJson: input.geoJsonText ? JSON.parse(input.geoJsonText) : null,
    loadPins: input.loadPins,
    createdAt: maps.find((map) => map.id === input.trackId)?.createdAt || now,
    updatedAt: now,
  };
  const nextMaps = maps.filter((map) => map.id !== input.trackId).concat(nextMap);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(nextMaps, null, 2)}\n`);
}

async function loadMaps() {
  const builtins = builtinMaps();
  let stored = [];

  if (hasPostgresConfig()) {
    await ensurePostgresSchema();
    stored = await withPgClient(async (client) => {
      const rows = await client.query(`
        SELECT track_id, title, center_lat, center_lng, zoom, geo_json, load_pins, created_at, updated_at
        FROM map_pages
        ORDER BY title ASC
      `);
      return rows.rows.map(normalizeStoredMap);
    });
  } else {
    stored = await loadLocalMaps();
  }

  return [...builtins, ...stored].sort((a, b) => a.title.localeCompare(b.title));
}

function normalizeTrackId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeInput(body) {
  const title = String(body?.title || "").trim();
  const trackId = normalizeTrackId(body?.trackId) || normalizeTrackId(title);
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

async function saveMap(input) {
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

  await saveLocalMap(input, now);
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ maps: await loadMaps() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const input = normalizeInput(body);
    await saveMap(input);
    return NextResponse.json({
      ok: true,
      map: {
        id: input.trackId,
        title: input.title,
        href: `/maps/${input.trackId}`,
        adminHref: `/admin/maps`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 400 });
  }
}
