const fs = require("fs");
const path = require("path");

const W = 1200;
const H = 800;
const PAD = 40;

let projectorCache = null;

function isFiniteNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function flattenCoords(geom) {
  if (!geom) return [];
  const t = geom.type;
  if (t === "LineString") return [geom.coordinates];
  if (t === "MultiLineString") return geom.coordinates;
  if (t === "Polygon") {
    const rings = geom.coordinates || [];
    return rings.length ? [rings[0]] : [];
  }
  if (t === "MultiPolygon") {
    const polys = geom.coordinates || [];
    const lines = [];
    for (const poly of polys) {
      if (poly?.[0]?.length) lines.push(poly[0]);
    }
    return lines;
  }
  return [];
}

function extractLineWork(geo) {
  if (!geo) return [];
  const features =
    geo.type === "FeatureCollection"
      ? geo.features || []
      : geo.type === "Feature"
        ? [geo]
        : [];
  const lineGeoms = [];
  const polyGeoms = [];
  for (const f of features) {
    const g = f?.geometry;
    if (!g) continue;
    if (g.type === "LineString" || g.type === "MultiLineString") {
      lineGeoms.push(g);
    } else if (g.type === "Polygon" || g.type === "MultiPolygon") {
      polyGeoms.push(g);
    }
  }
  const chosen = lineGeoms.length ? lineGeoms : polyGeoms;
  const lines = [];
  for (const g of chosen) lines.push(...flattenCoords(g));
  return lines.filter((ls) => Array.isArray(ls) && ls.length >= 2);
}

function computeBounds(lines) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const line of lines) {
    for (const pt of line) {
      const lon = pt?.[0];
      const lat = pt?.[1];
      if (!isFiniteNum(lon) || !isFiniteNum(lat)) continue;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;
  return { minLon, maxLon, minLat, maxLat };
}

function makeProjector(bounds) {
  const lonSpan = bounds.maxLon - bounds.minLon;
  const latSpan = bounds.maxLat - bounds.minLat;
  const safeLonSpan = lonSpan === 0 ? 1 : lonSpan;
  const safeLatSpan = latSpan === 0 ? 1 : latSpan;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const sx = innerW / safeLonSpan;
  const sy = innerH / safeLatSpan;
  const s = Math.min(sx, sy);
  const scaledW = safeLonSpan * s;
  const scaledH = safeLatSpan * s;
  const offsetX = (W - scaledW) / 2;
  const offsetY = (H - scaledH) / 2;

  return function project(lon, lat) {
    const x = offsetX + (lon - bounds.minLon) * s;
    const y = offsetY + (bounds.maxLat - lat) * s;
    return { x, y };
  };
}

function getProjectorForTrack(trackId) {
  if (projectorCache) return projectorCache;
  if (trackId !== "sebring") return null;
  const filePath = path.join(process.cwd(), "public", "maps", "sebring.geojson");
  const raw = fs.readFileSync(filePath, "utf8");
  const geo = JSON.parse(raw);
  const lines = extractLineWork(geo);
  const bounds = computeBounds(lines);
  if (!bounds) return null;
  projectorCache = makeProjector(bounds);
  return projectorCache;
}

module.exports = {
  getProjectorForTrack,
};
