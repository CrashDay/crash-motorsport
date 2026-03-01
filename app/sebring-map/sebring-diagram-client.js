"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const W = 1200; // SVG viewBox width
const H = 800;  // SVG viewBox height
const PAD = 40; // padding in SVG units

function isFiniteNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function flattenCoords(geom) {
  // Returns an array of LineStrings, each is an array of [lon,lat] coords
  if (!geom) return [];
  const t = geom.type;

  if (t === "LineString") return [geom.coordinates];
  if (t === "MultiLineString") return geom.coordinates;

  // Fallback: if export is Polygon/MultiPolygon (facility boundary), use outer rings as lines
  if (t === "Polygon") {
    const rings = geom.coordinates || [];
    return rings.length ? [rings[0]] : [];
  }
  if (t === "MultiPolygon") {
    const polys = geom.coordinates || [];
    const lines = [];
    for (const poly of polys) {
      if (poly?.[0]?.length) lines.push(poly[0]); // outer ring
    }
    return lines;
  }

  return [];
}

function extractLineWork(geo) {
  // Prefer line geometries; if none exist, fall back to polygon outer rings.
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
  for (const g of chosen) {
    lines.push(...flattenCoords(g));
  }

  // Remove junk/empty lines
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

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) {
    return null;
  }

  return { minLon, maxLon, minLat, maxLat };
}

function makeProjector(bounds) {
  // Simple equirectangular projection fit to SVG viewBox
  const lonSpan = bounds.maxLon - bounds.minLon;
  const latSpan = bounds.maxLat - bounds.minLat;

  // Avoid divide-by-zero
  const safeLonSpan = lonSpan === 0 ? 1 : lonSpan;
  const safeLatSpan = latSpan === 0 ? 1 : latSpan;

  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  // Uniform scaling to preserve aspect ratio
  const sx = innerW / safeLonSpan;
  const sy = innerH / safeLatSpan;
  const s = Math.min(sx, sy);

  // Center within viewBox
  const scaledW = safeLonSpan * s;
  const scaledH = safeLatSpan * s;
  const offsetX = (W - scaledW) / 2;
  const offsetY = (H - scaledH) / 2;

  return function project(lonLat) {
    const lon = lonLat[0];
    const lat = lonLat[1];
    const x = offsetX + (lon - bounds.minLon) * s;
    // Flip Y so north is up
    const y = offsetY + (bounds.maxLat - lat) * s;
    return [x, y];
  };
}

function lineToPathD(line, project) {
  let d = "";
  for (let i = 0; i < line.length; i++) {
    const pt = line[i];
    if (!pt || !isFiniteNum(pt[0]) || !isFiniteNum(pt[1])) continue;
    const [x, y] = project(pt);
    d += (d ? " L " : "M ") + x.toFixed(2) + " " + y.toFixed(2);
  }
  return d;
}

export default function SebringDiagramClient() {
  const [geo, setGeo] = useState(null);
  const [err, setErr] = useState("");

  // Simple pan/zoom state
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  useEffect(() => {
    let cancelled = false;

    fetch("/maps/sebring.geojson")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (cancelled) return;
        setGeo(j);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(String(e?.message || e));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const { paths, boundsOk } = useMemo(() => {
    if (!geo) return { paths: [], boundsOk: false };

    const lines = extractLineWork(geo);
    const bounds = computeBounds(lines);
    if (!bounds) return { paths: [], boundsOk: false };

    const project = makeProjector(bounds);
    const ds = lines
      .map((line) => lineToPathD(line, project))
      .filter((d) => d && d.length > 10);

    return { paths: ds, boundsOk: ds.length > 0 };
  }, [geo]);

  function onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setScale((s) => Math.max(0.2, Math.min(10, s * factor)));
  }

  function onMouseDown(e) {
    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.origX = pan.x;
    dragRef.current.origY = pan.y;
  }

  function onMouseMove(e) {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }

  function onMouseUp() {
    dragRef.current.dragging = false;
  }

  function resetView() {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }

  // Light theme styling
  const BG = "#ffffff";
  const TRACK = "#111111";
  const PANEL_BG = "rgba(0,0,0,0.06)";
  const PANEL_BORDER = "rgba(0,0,0,0.12)";
  const TEXT = "#111111";

  return (
    <div style={{ height: "100vh", width: "100%", background: BG, color: TEXT }}>
      <div style={{ position: "absolute", zIndex: 10, top: 12, left: 12, display: "flex", gap: 8 }}>
        <button
          onClick={resetView}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: `1px solid ${PANEL_BORDER}`,
            background: PANEL_BG,
            color: TEXT,
            cursor: "pointer",
          }}
        >
          Reset view
        </button>

        <div style={{ padding: "8px 10px", borderRadius: 10, background: PANEL_BG, border: `1px solid ${PANEL_BORDER}` }}>
          Wheel = zoom • Drag = pan
        </div>
      </div>

      {err ? (
        <div style={{ position: "absolute", zIndex: 10, top: 60, left: 12, background: "white", color: "black", padding: 12, borderRadius: 10, border: `1px solid ${PANEL_BORDER}` }}>
          GeoJSON load failed: {err}
        </div>
      ) : null}

      {!err && geo && !boundsOk ? (
        <div style={{ position: "absolute", zIndex: 10, top: 60, left: 12, background: "white", color: "black", padding: 12, borderRadius: 10, border: `1px solid ${PANEL_BORDER}` }}>
          Loaded GeoJSON, but couldn’t extract linework (LineString/MultiLineString). If your export is only a Polygon boundary, we can re-export the circuit loop relation.
        </div>
      ) : null}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        style={{ display: "block" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* background */}
        <rect x="0" y="0" width={W} height={H} fill={BG} />

        {/* pan/zoom group */}
        <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
          {paths.map((d, idx) => (
            <path
              key={idx}
              d={d}
              fill="none"
              stroke={TRACK}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.95"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}