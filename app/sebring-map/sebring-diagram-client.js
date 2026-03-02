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
  const [pins, setPins] = useState([]);
  const [pinsError, setPinsError] = useState("");
  const [pinsLoading, setPinsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [viewer, setViewer] = useState({ open: false, pin: null, assets: [], index: 0, loading: false, error: "" });
  const [auth, setAuth] = useState({ loading: true, connected: false, error: "" });
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK_LIGHTROOM === "true";
  const useLocalExports = process.env.NEXT_PUBLIC_USE_LOCAL_EXPORTS === "true";

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

  const loadPins = async () => {
    setPinsLoading(true);
    setPinsError("");
    try {
      const res = await fetch("/api/tracks/sebring/pins");
      if (!res.ok) throw new Error(`Pins HTTP ${res.status}`);
      const data = await res.json();
      setPins(data.pins || []);
    } catch (e) {
      setPinsError(String(e?.message || e));
    } finally {
      setPinsLoading(false);
    }
  };

  useEffect(() => {
    loadPins();
  }, []);

  const loadAuthStatus = async () => {
    if (useMock) {
      setAuth({ loading: false, connected: false, error: "" });
      return;
    }
    try {
      const res = await fetch("/api/auth/adobe/status");
      if (!res.ok) throw new Error(`Auth HTTP ${res.status}`);
      const data = await res.json();
      setAuth({ loading: false, connected: !!data.connected, error: "" });
    } catch (e) {
      setAuth({ loading: false, connected: false, error: String(e?.message || e) });
    }
  };

  useEffect(() => {
    loadAuthStatus();
  }, []);

  const syncMock = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/mock-lightroom?trackId=sebring", { method: "POST" });
      if (!res.ok) throw new Error(`Sync HTTP ${res.status}`);
      await loadPins();
    } catch (e) {
      setPinsError(String(e?.message || e));
    } finally {
      setSyncing(false);
    }
  };

  const syncLocalExports = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/local-exports?trackId=sebring", { method: "POST" });
      if (!res.ok) throw new Error(`Sync HTTP ${res.status}`);
      await loadPins();
    } catch (e) {
      setPinsError(String(e?.message || e));
    } finally {
      setSyncing(false);
    }
  };

  const syncLightroom = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/lightroom?trackId=sebring", { method: "POST" });
      if (!res.ok) throw new Error(`Sync HTTP ${res.status}`);
      await loadPins();
    } catch (e) {
      setPinsError(String(e?.message || e));
    } finally {
      setSyncing(false);
    }
  };

  const startConnect = () => {
    window.location.href = "/api/auth/adobe/start?redirect=/sebring-map";
  };

  const openPin = async (pin) => {
    setViewer({ open: true, pin, assets: [], index: 0, loading: true, error: "" });
    try {
      const res = await fetch(`/api/pins/${encodeURIComponent(pin.pin_id)}/assets`);
      if (!res.ok) throw new Error(`Assets HTTP ${res.status}`);
      const data = await res.json();
      const assets = data.assets || [];
      setViewer({ open: true, pin, assets, index: 0, loading: false, error: "" });
    } catch (e) {
      setViewer({ open: true, pin, assets: [], index: 0, loading: false, error: String(e?.message || e) });
    }
  };

  const closeViewer = () => setViewer({ open: false, pin: null, assets: [], index: 0, loading: false, error: "" });

  const next = () => setViewer((v) => {
    if (!v.assets.length) return v;
    return { ...v, index: (v.index + 1) % v.assets.length };
  });

  const prev = () => setViewer((v) => {
    if (!v.assets.length) return v;
    return { ...v, index: (v.index - 1 + v.assets.length) % v.assets.length };
  });

  useEffect(() => {
    if (!viewer.open) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeViewer();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer.open]);

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
          Wheel = zoom * Drag = pan
        </div>

        <button
          onClick={useLocalExports ? syncLocalExports : useMock ? syncMock : syncLightroom}
          disabled={syncing || (!useMock && !useLocalExports && !auth.connected)}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: `1px solid ${PANEL_BORDER}`,
            background: syncing ? "rgba(0,0,0,0.03)" : PANEL_BG,
            color: TEXT,
            cursor: syncing ? "default" : "pointer",
          }}
        >
          {syncing
            ? "Syncing..."
            : useLocalExports
              ? "Sync local exports"
              : useMock
                ? "Sync mock Lightroom"
                : "Sync Lightroom"}
        </button>

        {!useMock && !useLocalExports ? (
          <button
            onClick={startConnect}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: `1px solid ${PANEL_BORDER}`,
              background: PANEL_BG,
              color: TEXT,
              cursor: "pointer",
            }}
          >
            {auth.connected ? "Reconnect Lightroom" : "Connect Lightroom"}
          </button>
        ) : null}

        <div style={{ padding: "8px 10px", borderRadius: 10, background: PANEL_BG, border: `1px solid ${PANEL_BORDER}` }}>
          {pinsLoading ? "Loading pins..." : `Pins: ${pins.length}`}
        </div>

        {!useMock && !useLocalExports ? (
          <div style={{ padding: "8px 10px", borderRadius: 10, background: PANEL_BG, border: `1px solid ${PANEL_BORDER}` }}>
            {auth.loading ? "Lightroom: checking..." : auth.connected ? "Lightroom: connected" : "Lightroom: disconnected"}
          </div>
        ) : null}
      </div>

      {err ? (
        <div style={{ position: "absolute", zIndex: 10, top: 60, left: 12, background: "white", color: "black", padding: 12, borderRadius: 10, border: `1px solid ${PANEL_BORDER}` }}>
          GeoJSON load failed: {err}
        </div>
      ) : null}

      {!err && geo && !boundsOk ? (
        <div style={{ position: "absolute", zIndex: 10, top: 60, left: 12, background: "white", color: "black", padding: 12, borderRadius: 10, border: `1px solid ${PANEL_BORDER}` }}>
          Loaded GeoJSON, but could not extract linework (LineString/MultiLineString).
        </div>
      ) : null}

      {pinsError ? (
        <div style={{ position: "absolute", zIndex: 10, top: 60, right: 12, background: "white", color: "black", padding: 12, borderRadius: 10, border: `1px solid ${PANEL_BORDER}` }}>
          Pins error: {pinsError}
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
        <rect x="0" y="0" width={W} height={H} fill={BG} />

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

          {pins.map((pin) => {
            const isStack = pin.photo_count > 1;
            const x = pin.anchor_x ?? 0;
            const y = pin.anchor_y ?? 0;
            const clipId = `flag-clip-${pin.pin_id}`;
            return (
              <g
                key={pin.pin_id}
                transform={`translate(${x} ${y})`}
                onClick={() => openPin(pin)}
                style={{ cursor: "pointer" }}
              >
                {isStack ? (
                  <circle r={10} cx={3} cy={-3} fill="#1b1b1b" opacity="0.7" />
                ) : null}
                <circle r={9} fill="#ff8c00" stroke="#111" strokeWidth="2" />
                <g transform="translate(-2,-14)">
                  <defs>
                    <clipPath id={clipId}>
                      <path d="M -6 0 C -1 -3 3 4 6 2 L 6 8 C 2 11 -2 5 -6 8 Z" />
                    </clipPath>
                  </defs>
                  <path
                    d="M -6 0 C -1 -3 3 4 6 2 L 6 8 C 2 11 -2 5 -6 8 Z"
                    fill="#111"
                    stroke="#111"
                    strokeWidth="1"
                  />
                  <g clipPath={`url(#${clipId})`}>
                    {Array.from({ length: 24 }).map((_, idx) => {
                      const col = idx % 6;
                      const row = Math.floor(idx / 6);
                      const isWhite = (row + col) % 2 === 0;
                      return (
                        <rect
                          key={idx}
                          x={-6 + col * 2}
                          y={row * 2}
                          width="2"
                          height="2"
                          fill={isWhite ? "#fff" : "#111"}
                        />
                      );
                    })}
                  </g>
                  <line x1="-8" y1="0" x2="-8" y2="10" stroke="#111" strokeWidth="2" />
                </g>
                <text x="0" y="3" textAnchor="middle" fontSize="8" fontWeight="700" fill="#111">
                  {pin.photo_count > 0 ? pin.photo_count : ""}
                </text>
                <title>{pin.title || pin.region_id}</title>
              </g>
            );
          })}
        </g>
      </svg>

      {viewer.open ? (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeViewer();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", justifyContent: "space-between", color: "#bbb", fontSize: 12 }}>
            <div>{viewer.pin?.title || viewer.pin?.region_id}</div>
            <button
              type="button"
              onClick={closeViewer}
              style={{ background: "#111", border: "1px solid #222", color: "#fff", padding: "8px 10px", borderRadius: 10, cursor: "pointer" }}
            >
              Close
            </button>
          </div>

          {viewer.loading ? (
            <div style={{ color: "#bbb" }}>Loading photos...</div>
          ) : viewer.error ? (
            <div style={{ color: "#f5a" }}>{viewer.error}</div>
          ) : viewer.assets.length ? (
            <ViewerBody viewer={viewer} onNext={next} onPrev={prev} setViewer={setViewer} />
          ) : (
            <div style={{ color: "#bbb" }}>No photos for this pin.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ViewerBody({ viewer, onNext, onPrev, setViewer }) {
  const touchRef = useRef({ startX: 0, startY: 0, active: false });

  const onTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    touchRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, active: true };
  };

  const onTouchEnd = (e) => {
    if (!touchRef.current.active) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.startX;
    const dy = e.changedTouches[0].clientY - touchRef.current.startY;
    touchRef.current.active = false;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
      if (dx < 0) onNext();
      else onPrev();
    }
  };

  return (
    <div style={{ maxWidth: "92vw", maxHeight: "88vh", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
      <div style={{ position: "relative" }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img
          src={viewer.assets[viewer.index].full_url}
          alt={viewer.assets[viewer.index].alt_text_snapshot || "Selected photo"}
          style={{ maxWidth: "92vw", maxHeight: "72vh", borderRadius: 12, border: "1px solid #222", display: "block" }}
          draggable={false}
        />
        <button
          type="button"
          onClick={onPrev}
          style={{ position: "absolute", left: -50, top: "50%", transform: "translateY(-50%)", background: "#111", border: "1px solid #222", color: "#fff", padding: "10px 12px", borderRadius: 10, cursor: "pointer" }}
        >
          Prev
        </button>
        <button
          type="button"
          onClick={onNext}
          style={{ position: "absolute", right: -50, top: "50%", transform: "translateY(-50%)", background: "#111", border: "1px solid #222", color: "#fff", padding: "10px 12px", borderRadius: 10, cursor: "pointer" }}
        >
          Next
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, maxWidth: "92vw" }}>
        {viewer.assets.map((asset, i) => (
          <button
            key={asset.asset_id}
            type="button"
            onClick={() => setViewer((v) => ({ ...v, index: i }))}
            style={{ border: i === viewer.index ? "2px solid #ff8c00" : "1px solid #333", padding: 0, borderRadius: 8, background: "transparent", cursor: "pointer" }}
          >
            <img
              src={asset.thumb_url}
              alt={asset.alt_text_snapshot || "Thumbnail"}
              style={{ width: 110, height: 70, objectFit: "cover", borderRadius: 6, display: "block" }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
