import crypto from "crypto";
import { NextResponse } from "next/server";
import { Client } from "pg";
import sebringAreas from "@/data/sebring-photo-areas.json";
import { assignAreaAsset, getDb, upsertGpsPin, upsertPhotoAsset, upsertPinAsset } from "@/lib/db";
import { getProjectorForTrack } from "@/lib/geo-projector";

const TRACK_ID = "sebring";
const STATIC_AREA_IDS = new Set(sebringAreas.map((a) => a.id));
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
    await client.query(`
      ALTER TABLE photo_area_assets
      ADD COLUMN IF NOT EXISTS year INTEGER
    `);
    await client.query(`
      ALTER TABLE photo_area_assets
      ADD COLUMN IF NOT EXISTS race TEXT
    `);
  });
  postgresReady = true;
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeCaptureTime(value, fallbackIso) {
  const raw = String(value || "").trim();
  if (!raw) return fallbackIso;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function isValidAreaId(areaId) {
  if (!areaId) return false;
  if (STATIC_AREA_IDS.has(areaId)) return true;
  return areaId.startsWith("area-");
}

function normalizeYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (n < 1900 || n > 2100) return null;
  return n;
}

function normalizeRace(value) {
  const raw = String(value || "").trim();
  return raw || "12 Hours of Sebring";
}

function withinGeoRange(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function tryParseLocationFromHtml(html) {
  const metaLat = html.match(/<meta\s+property=["']place:location:latitude["']\s+content=["']([^"']+)["']/i)
    || html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']place:location:latitude["']/i);
  const metaLng = html.match(/<meta\s+property=["']place:location:longitude["']\s+content=["']([^"']+)["']/i)
    || html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']place:location:longitude["']/i);
  const latFromMeta = toNumber(metaLat?.[1]);
  const lngFromMeta = toNumber(metaLng?.[1]);
  if (withinGeoRange(latFromMeta, lngFromMeta)) {
    return { lat: latFromMeta, lng: lngFromMeta };
  }

  const geoPosition = html.match(/<meta\s+name=["']geo\.position["']\s+content=["']([^"']+)["']/i)
    || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']geo\.position["']/i);
  if (geoPosition?.[1]) {
    const parts = String(geoPosition[1]).split(/[;,]/).map((p) => p.trim());
    const lat = toNumber(parts[0]);
    const lng = toNumber(parts[1]);
    if (withinGeoRange(lat, lng)) {
      return { lat, lng };
    }
  }

  const latLngPairs = [
    /"latitude"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"longitude"\s*:\s*(-?\d+(?:\.\d+)?)/i,
    /"longitude"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"latitude"\s*:\s*(-?\d+(?:\.\d+)?)/i,
    /"lat"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"lng"\s*:\s*(-?\d+(?:\.\d+)?)/i,
    /"lng"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"lat"\s*:\s*(-?\d+(?:\.\d+)?)/i,
  ];
  for (const pattern of latLngPairs) {
    const match = html.match(pattern);
    if (!match) continue;
    const a = toNumber(match[1]);
    const b = toNumber(match[2]);
    if (pattern.source.includes("\"longitude\"\\s*:") || pattern.source.includes("\"lng\"\\s*:")) {
      if (withinGeoRange(b, a)) return { lat: b, lng: a };
    } else if (withinGeoRange(a, b)) {
      return { lat: a, lng: b };
    }
  }

  return null;
}

async function scrapeLocationFromShareLink(shortLink) {
  try {
    const res = await fetch(shortLink, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CrashDayPics/1.0; +https://crashdaypics.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html")) return null;
    const html = await res.text();
    return tryParseLocationFromHtml(html);
  } catch {
    return null;
  }
}

export async function POST(request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shortLink = normalizeUrl(body?.shortLink);
  const areaId = String(body?.areaId || "").trim();
  const year = normalizeYear(body?.year);
  const race = normalizeRace(body?.race);
  const nowIso = new Date().toISOString();
  const captureTime = normalizeCaptureTime(body?.captureTime, nowIso);
  const lat = parseOptionalNumber(body?.lat);
  const lng = parseOptionalNumber(body?.lng);
  const latInvalid = Number.isNaN(lat);
  const lngInvalid = Number.isNaN(lng);
  const hasLat = Number.isFinite(lat);
  const hasLng = Number.isFinite(lng);
  const hasProvidedLocation = hasLat && hasLng;

  if (!shortLink) {
    return NextResponse.json({ error: "A valid Lightroom shared short link is required" }, { status: 400 });
  }
  if (captureTime === null) {
    return NextResponse.json({ error: "captureTime must be a valid date/time" }, { status: 400 });
  }
  if (latInvalid || lngInvalid) {
    return NextResponse.json({ error: "lat/lng must be numeric values" }, { status: 400 });
  }
  if ((hasLat && !hasLng) || (hasLng && !hasLat)) {
    return NextResponse.json({ error: "Both lat and lng are required when location is provided" }, { status: 400 });
  }
  if (hasProvidedLocation) {
    if (lat < -90 || lat > 90) {
      return NextResponse.json({ error: "lat must be between -90 and 90" }, { status: 400 });
    }
    if (lng < -180 || lng > 180) {
      return NextResponse.json({ error: "lng must be between -180 and 180" }, { status: 400 });
    }
  }
  if (areaId && !isValidAreaId(areaId)) {
    return NextResponse.json({ error: "Invalid areaId" }, { status: 400 });
  }
  if (body?.year !== undefined && body?.year !== null && body?.year !== "" && year === null) {
    return NextResponse.json({ error: "year must be a 4-digit number" }, { status: 400 });
  }

  let effectiveLat = hasProvidedLocation ? lat : null;
  let effectiveLng = hasProvidedLocation ? lng : null;
  let locationSource = hasProvidedLocation ? "provided" : "none";
  if (!hasProvidedLocation) {
    const scraped = await scrapeLocationFromShareLink(shortLink);
    if (withinGeoRange(scraped?.lat, scraped?.lng)) {
      effectiveLat = scraped.lat;
      effectiveLng = scraped.lng;
      locationSource = "scraped";
    }
  }
  const hasLocation = withinGeoRange(effectiveLat, effectiveLng);
  if (!hasLocation && !areaId) {
    return NextResponse.json(
      { error: "areaId is required when no location is provided or found in shared link metadata" },
      { status: 400 }
    );
  }

  const db = getDb();
  const assetHash = crypto.createHash("sha1").update(shortLink).digest("hex").slice(0, 20);
  const assetId = `shared:${assetHash}`;
  const canonicalAreaAssetId = `${assetId}::${shortLink}`;

  upsertPhotoAsset(db, {
    asset_id: assetId,
    track_id: TRACK_ID,
    capture_time: captureTime,
    alt_text_snapshot: "Shared via Lightroom link",
    thumb_url: shortLink,
    full_url: shortLink,
    last_synced_at: nowIso,
    catalog_id: null,
  });

  let pinId = null;
  if (hasLocation) {
    const projector = getProjectorForTrack(TRACK_ID);
    if (!projector) {
      return NextResponse.json({ error: "Track projector unavailable" }, { status: 500 });
    }
    const pos = projector(effectiveLng, effectiveLat);
    pinId = `gps:${assetId}`;
    upsertGpsPin(db, {
      pin_id: pinId,
      track_id: TRACK_ID,
      anchor_x: pos.x,
      anchor_y: pos.y,
      lat: effectiveLat,
      lng: effectiveLng,
      title: "Shared Photo",
    });
    upsertPinAsset(db, {
      pin_id: pinId,
      asset_id: assetId,
      sort_order: Date.parse(captureTime) || Date.now(),
      added_at: nowIso,
    });
  }

  if (areaId) {
    try {
      if (hasPostgresConfig()) {
        await ensurePostgresSchema();
        await withPgClient(async (client) => {
          await client.query("BEGIN");
          try {
            await client.query(
              `
                DELETE FROM photo_area_assets
                WHERE track_id = $1 AND asset_id = $2
              `,
              [TRACK_ID, canonicalAreaAssetId]
            );
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
              [TRACK_ID, areaId, canonicalAreaAssetId, "Shared Lightroom Photo", shortLink, shortLink, year, race, nowIso]
            );
            await client.query("COMMIT");
          } catch (txError) {
            await client.query("ROLLBACK");
            throw txError;
          }
        });
      } else if (!isVercelRuntime()) {
        db.prepare(
          `
            DELETE FROM photo_area_assets
            WHERE track_id = ? AND asset_id = ?
          `
        ).run(TRACK_ID, canonicalAreaAssetId);
        assignAreaAsset(db, {
          track_id: TRACK_ID,
          area_id: areaId,
          asset_id: canonicalAreaAssetId,
          asset_name: "Shared Lightroom Photo",
          thumb_url: shortLink,
          full_url: shortLink,
          year,
          race,
          assigned_at: nowIso,
        });
      } else {
        return NextResponse.json(
          { error: "Durable storage is not configured. Set a Postgres connection in Vercel env vars." },
          { status: 503 }
        );
      }
    } catch (error) {
      console.error("[share-photo:POST] area assignment storage error", error);
      return NextResponse.json(
        { error: "Area assignment storage unavailable. Configure Vercel Postgres for durable persistence." },
        { status: 503 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    assetId,
    pinId,
    hasLocation,
    locationSource,
    location: hasLocation ? { lat: effectiveLat, lng: effectiveLng } : null,
    year,
    race,
    assignedAreaId: areaId || null,
  });
}
