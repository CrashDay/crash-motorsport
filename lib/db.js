const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

let dbInstance = null;
let dbPathCache = null;

function resolveDbPath() {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  if (process.env.VERCEL) return path.join("/tmp", "app.db");
  return path.join(process.cwd(), "data", "app.db");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function initSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS photo_assets (
      asset_id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      capture_time TEXT,
      alt_text_snapshot TEXT,
      thumb_url TEXT,
      full_url TEXT,
      last_synced_at TEXT,
      catalog_id TEXT
    );

    CREATE TABLE IF NOT EXISTS photo_pins (
      pin_id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      region_id TEXT,
      anchor_x REAL,
      anchor_y REAL,
      pin_type TEXT NOT NULL,
      title TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_pins_track_region
      ON photo_pins(track_id, region_id);

    CREATE TABLE IF NOT EXISTS pin_assets (
      pin_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      sort_order INTEGER,
      added_at TEXT,
      PRIMARY KEY (pin_id, asset_id)
    );

    CREATE TABLE IF NOT EXISTS adobe_tokens (
      user_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

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
    );
  `);

  ensureColumn(db, "photo_assets", "catalog_id", "TEXT");
  ensureColumn(db, "photo_area_assets", "year", "INTEGER");
  ensureColumn(db, "photo_area_assets", "race", "TEXT");
}

function ensureColumn(db, table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
}

function createDb(dbPath) {
  ensureDir(path.dirname(dbPath));
  const db = new Database(dbPath);
  initSchema(db);
  return db;
}

function getDb() {
  if (!dbInstance) {
    const dbPath = resolveDbPath();
    dbPathCache = dbPath;
    dbInstance = createDb(dbPath);
  }
  return dbInstance;
}

function getDbPath() {
  if (dbPathCache) return dbPathCache;
  return resolveDbPath();
}

function upsertPhotoAsset(db, asset) {
  const stmt = db.prepare(`
    INSERT INTO photo_assets (asset_id, track_id, capture_time, alt_text_snapshot, thumb_url, full_url, last_synced_at, catalog_id)
    VALUES (@asset_id, @track_id, @capture_time, @alt_text_snapshot, @thumb_url, @full_url, @last_synced_at, @catalog_id)
    ON CONFLICT(asset_id) DO UPDATE SET
      track_id = excluded.track_id,
      capture_time = excluded.capture_time,
      alt_text_snapshot = excluded.alt_text_snapshot,
      thumb_url = excluded.thumb_url,
      full_url = excluded.full_url,
      last_synced_at = excluded.last_synced_at,
      catalog_id = excluded.catalog_id
  `);
  stmt.run(asset);
}

function upsertRegionPin(db, { track_id, region_id, anchor_x, anchor_y, title }) {
  const existing = db
    .prepare("SELECT pin_id FROM photo_pins WHERE track_id = ? AND region_id = ?")
    .get(track_id, region_id);

  if (existing?.pin_id) {
    db.prepare(
      "UPDATE photo_pins SET anchor_x = ?, anchor_y = ?, title = ? WHERE pin_id = ?"
    ).run(anchor_x, anchor_y, title, existing.pin_id);
    return existing.pin_id;
  }

  const pin_id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO photo_pins (pin_id, track_id, region_id, anchor_x, anchor_y, pin_type, title) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(pin_id, track_id, region_id, anchor_x, anchor_y, "region", title);

  return pin_id;
}

function upsertPinAsset(db, { pin_id, asset_id, sort_order, added_at }) {
  db.prepare(
    `INSERT INTO pin_assets (pin_id, asset_id, sort_order, added_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(pin_id, asset_id) DO UPDATE SET
       sort_order = excluded.sort_order,
       added_at = excluded.added_at`
  ).run(pin_id, asset_id, sort_order, added_at);
}

function detachMissingPinAssets(db, pin_id, keepAssetIds) {
  if (!keepAssetIds.length) {
    db.prepare("DELETE FROM pin_assets WHERE pin_id = ?").run(pin_id);
    return;
  }
  const placeholders = keepAssetIds.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM pin_assets WHERE pin_id = ? AND asset_id NOT IN (${placeholders})`
  ).run(pin_id, ...keepAssetIds);
}

function getPinsByTrack(db, track_id) {
  const rows = db.prepare(`
    SELECT
      p.pin_id,
      p.track_id,
      p.region_id,
      p.anchor_x,
      p.anchor_y,
      p.pin_type,
      p.title,
      COUNT(pa.asset_id) AS photo_count,
      (
        SELECT a.thumb_url
        FROM pin_assets pa2
        JOIN photo_assets a ON a.asset_id = pa2.asset_id
        WHERE pa2.pin_id = p.pin_id
        ORDER BY a.capture_time DESC
        LIMIT 1
      ) AS cover_thumb_url
    FROM photo_pins p
    LEFT JOIN pin_assets pa ON pa.pin_id = p.pin_id
    WHERE p.track_id = ?
    GROUP BY p.pin_id
    ORDER BY p.title ASC
  `).all(track_id);

  return rows.map((r) => ({
    pin_id: r.pin_id,
    track_id: r.track_id,
    region_id: r.region_id,
    title: r.title,
    anchor_x: r.anchor_x,
    anchor_y: r.anchor_y,
    pin_type: r.pin_type,
    photo_count: r.photo_count || 0,
    cover_thumb_url: r.cover_thumb_url || null,
  }));
}

function getAssetsByPin(db, pin_id) {
  return db.prepare(`
    SELECT a.asset_id, a.capture_time, a.thumb_url, a.full_url, a.alt_text_snapshot
    FROM pin_assets pa
    JOIN photo_assets a ON a.asset_id = pa.asset_id
    WHERE pa.pin_id = ?
    ORDER BY a.capture_time ASC
  `).all(pin_id);
}

function upsertGpsPin(db, { pin_id, track_id, anchor_x, anchor_y, title }) {
  db.prepare(
    `INSERT INTO photo_pins (pin_id, track_id, region_id, anchor_x, anchor_y, pin_type, title)
     VALUES (?, ?, NULL, ?, ?, ?, ?)
     ON CONFLICT(pin_id) DO UPDATE SET
       anchor_x = excluded.anchor_x,
       anchor_y = excluded.anchor_y,
       title = excluded.title`
  ).run(pin_id, track_id, anchor_x, anchor_y, "gps", title);

  return pin_id;
}

function getPhotoAsset(db, asset_id) {
  return db.prepare(`
    SELECT asset_id, track_id, capture_time, alt_text_snapshot, thumb_url, full_url, last_synced_at, catalog_id
    FROM photo_assets
    WHERE asset_id = ?
  `).get(asset_id);
}

function upsertAdobeToken(db, { user_id, access_token, refresh_token, expires_at, created_at, updated_at }) {
  db.prepare(`
    INSERT INTO adobe_tokens (user_id, access_token, refresh_token, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).run(user_id, access_token, refresh_token, expires_at, created_at, updated_at);
}

function getAdobeToken(db, user_id) {
  return db.prepare(`
    SELECT user_id, access_token, refresh_token, expires_at, created_at, updated_at
    FROM adobe_tokens
    WHERE user_id = ?
  `).get(user_id);
}

function deleteAdobeToken(db, user_id) {
  db.prepare("DELETE FROM adobe_tokens WHERE user_id = ?").run(user_id);
}

function assignAreaAsset(db, { track_id, area_id, asset_id, asset_name, thumb_url, full_url, year, race, assigned_at }) {
  db.prepare(`
    INSERT INTO photo_area_assets (track_id, area_id, asset_id, asset_name, thumb_url, full_url, year, race, assigned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(track_id, area_id, asset_id) DO UPDATE SET
      asset_name = excluded.asset_name,
      thumb_url = excluded.thumb_url,
      full_url = excluded.full_url,
      year = excluded.year,
      race = excluded.race,
      assigned_at = excluded.assigned_at
  `).run(track_id, area_id, asset_id, asset_name, thumb_url, full_url, year ?? null, race ?? null, assigned_at);
}

function getAreaAssetsByTrack(db, track_id) {
  const rows = db.prepare(`
    SELECT track_id, area_id, asset_id, asset_name, thumb_url, full_url, year, race, assigned_at
    FROM photo_area_assets
    WHERE track_id = ?
    ORDER BY assigned_at DESC
  `).all(track_id);
  const byArea = {};
  for (const r of rows) {
    if (!byArea[r.area_id]) byArea[r.area_id] = [];
    byArea[r.area_id].push({
      id: r.asset_id,
      name: r.asset_name,
      thumbUrl: r.thumb_url,
      fullUrl: r.full_url,
      year: Number.isFinite(Number(r.year)) ? Number(r.year) : null,
      race: r.race || null,
      assignedAt: r.assigned_at,
    });
  }
  return byArea;
}

function removeAreaAsset(db, { track_id, area_id, asset_id }) {
  db.prepare(`
    DELETE FROM photo_area_assets
    WHERE track_id = ? AND area_id = ? AND asset_id = ?
  `).run(track_id, area_id, asset_id);
}

module.exports = {
  createDb,
  getDb,
  getDbPath,
  upsertPhotoAsset,
  upsertRegionPin,
  upsertPinAsset,
  detachMissingPinAssets,
  getPinsByTrack,
  getAssetsByPin,
  getPhotoAsset,
  upsertGpsPin,
  upsertAdobeToken,
  getAdobeToken,
  deleteAdobeToken,
  assignAreaAsset,
  getAreaAssetsByTrack,
  removeAreaAsset,
};
