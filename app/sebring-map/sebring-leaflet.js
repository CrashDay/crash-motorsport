"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Rectangle, CircleMarker, Popup, Marker, useMap, useMapEvents } from "react-leaflet";
import { geoJSON, icon } from "leaflet";
import "leaflet/dist/leaflet.css";

const CORNER_ORDER = [
  { short: "T1", name: "Turn 1" },
  { short: "T2", name: "Turn 2" },
  { short: "T3", name: "Turn 3" },
  { short: "T4", name: "Turn 4" },
  { short: "T5", name: "Turn 5" },
  { short: "T6", name: "Turn 6" },
  { short: "T7", name: "Turn 7" },
  { short: "T8", name: "Turn 8" },
  { short: "T9", name: "Turn 9" },
  { short: "T10", name: "Turn 10" },
  { short: "T11", name: "Turn 11" },
  { short: "T12", name: "Turn 12" },
  { short: "T13", name: "Turn 13" },
  { short: "T14", name: "Turn 14" },
  { short: "T15", name: "Turn 15" },
  { short: "T16", name: "Turn 16" },
  { short: "T17", name: "Turn 17" },
];
const CORNER_STORAGE_KEY = "sebring_corner_coords_v1";

function cornerIcon(short) {
  return icon({
    iconUrl: `/markers/corners/${short}.svg`,
    iconSize: [28, 18],
    iconAnchor: [14, 9],
    popupAnchor: [0, -10],
  });
}

function FitToBounds({ bounds, lockZoom }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !bounds) return;

    const fit = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [0, 0], maxZoom: 18 });
      if (lockZoom) {
        const z = map.getZoom();
        map.setMinZoom(z);
      }
    };

    if (map._loaded) {
      fit();
    } else {
      map.whenReady(fit);
    }

    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [map, bounds, lockZoom]);

  return null;
}

function FitToGeoJSON({ data }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !data) return;
    try {
      const layer = geoJSON(data);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [8, 8], maxZoom: 18 });
      }
    } catch {
      // ignore fit errors
    }
  }, [map, data]);

  return null;
}

function MapDebug({ viewLatLngBounds }) {
  const map = useMap();
  const [info, setInfo] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!map) return;

    const format = () => {
      const b = map.getBounds();
      const z = map.getZoom();
      const view = viewLatLngBounds
        ? `viewBounds: [${viewLatLngBounds[0][0].toFixed(6)}, ${viewLatLngBounds[0][1].toFixed(6)}] to [${viewLatLngBounds[1][0].toFixed(6)}, ${viewLatLngBounds[1][1].toFixed(6)}]`
        : "viewBounds: null";
      return `zoom: ${z}\nmapBounds: N ${b.getNorth().toFixed(6)} S ${b.getSouth().toFixed(6)} E ${b.getEast().toFixed(6)} W ${b.getWest().toFixed(6)}\n${view}`;
    };

    const update = () => setInfo(format());
    update();
    map.on("moveend zoomend", update);
    return () => {
      map.off("moveend zoomend", update);
    };
  }, [map, viewLatLngBounds]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 9999,
        top: 12,
        right: 12,
        background: "rgba(7,11,18,0.86)",
        color: "#fff",
        padding: "8px 10px",
        borderRadius: 8,
        fontSize: 11,
        whiteSpace: "pre-line",
        border: "1px solid rgba(153, 181, 255, 0.2)",
        maxWidth: 280,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>Debug</div>
        <button
          type="button"
          onClick={copy}
          style={{
            background: "#101827",
            border: "1px solid #2a3a57",
            color: "#fff",
            padding: "4px 6px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 11,
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {info}
    </div>
  );
}

function BoundsPicker({ enabled, onChange }) {
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [dragging, setDragging] = useState(false);
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (enabled) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
    return () => {
      map.dragging.enable();
    };
  }, [map, enabled]);

  useMapEvents({
    mousedown(e) {
      if (!enabled) return;
      setStart(e.latlng);
      setEnd(e.latlng);
      setDragging(true);
    },
    mousemove(e) {
      if (!enabled || !dragging) return;
      setEnd(e.latlng);
    },
    mouseup() {
      if (!enabled || !dragging) return;
      setDragging(false);
    },
  });

  useEffect(() => {
    if (!start || !end) return;
    const north = Math.max(start.lat, end.lat);
    const south = Math.min(start.lat, end.lat);
    const east = Math.max(start.lng, end.lng);
    const west = Math.min(start.lng, end.lng);
    onChange({ north, south, east, west });
  }, [start, end, onChange]);

  if (!start || !end) return null;

  const bounds = [
    [Math.min(start.lat, end.lat), Math.min(start.lng, end.lng)],
    [Math.max(start.lat, end.lat), Math.max(start.lng, end.lng)],
  ];

  return <Rectangle bounds={bounds} pathOptions={{ color: "#00e5ff", weight: 2 }} />;
}

function CornerPicker({ enabled, activeCorner, onPick }) {
  useMapEvents({
    click(e) {
      if (!enabled || !activeCorner) return;
      onPick(activeCorner, e.latlng);
    },
  });
  return null;
}

export default function SebringLeaflet() {
  const showCornerPickerTools = true;
  const showDebugWindow = false;
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK_LIGHTROOM === "true";
  const useLocalExports = process.env.NEXT_PUBLIC_USE_LOCAL_EXPORTS === "true";
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [pickMode, setPickMode] = useState(false);
  const [cornerPickMode, setCornerPickMode] = useState(false);
  const [activeCorner, setActiveCorner] = useState(CORNER_ORDER[0].short);
  const [corners, setCorners] = useState(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(CORNER_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  const [cornerCopied, setCornerCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [pinsCount, setPinsCount] = useState(0);
  const [auth, setAuth] = useState({
    loading: !useMock && !useLocalExports,
    connected: false,
    error: "",
  });
  const [bounds, setBounds] = useState(null);
  const [viewBounds, setViewBounds] = useState({
    north: 27.457426,
    south: 27.448115,
    east: -81.345928,
    west: -81.359682,
  });

  const corner3Bounds = {
    north: 27.45436,
    south: 27.45317,
    east: -81.3489,
    west: -81.349479,
  };

  const corner3Center = [
    (corner3Bounds.north + corner3Bounds.south) / 2,
    (corner3Bounds.east + corner3Bounds.west) / 2,
  ];

  const viewLatLngBounds = viewBounds
    ? [
        [viewBounds.south, viewBounds.west],
        [viewBounds.north, viewBounds.east],
      ]
    : null;

  const cornerMarkers = useMemo(() => {
    return CORNER_ORDER.map((c) => {
      const pos = corners[c.short];
      if (!pos) return null;
      return { ...c, ...pos };
    }).filter(Boolean);
  }, [corners]);
  const cornerIcons = useMemo(() => {
    const map = {};
    for (const c of CORNER_ORDER) {
      map[c.short] = cornerIcon(c.short);
    }
    return map;
  }, []);

  const onCornerPick = (cornerId, latlng) => {
    setCorners((prev) => ({
      ...prev,
      [cornerId]: {
        lat: Number(latlng.lat.toFixed(6)),
        lng: Number(latlng.lng.toFixed(6)),
      },
    }));
  };

  const copyCorners = async () => {
    try {
      const payload = CORNER_ORDER.map((c) => {
        const pos = corners[c.short];
        return {
          name: c.name,
          short: c.short,
          coords: pos ? [pos.lat, pos.lng] : null,
        };
      });
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCornerCopied(true);
      setTimeout(() => setCornerCopied(false), 1200);
    } catch {
      setCornerCopied(false);
    }
  };

  const importCorners = () => {
    try {
      const parsed = JSON.parse(importText);
      const next = {};

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const short = item?.short;
          const coords = item?.coords;
          if (!short || !Array.isArray(coords) || coords.length < 2) continue;
          const lat = Number(coords[0]);
          const lng = Number(coords[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          next[short] = { lat, lng };
        }
      } else if (parsed && typeof parsed === "object") {
        for (const short of Object.keys(parsed)) {
          const v = parsed[short];
          const lat = Number(v?.lat);
          const lng = Number(v?.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          next[short] = { lat, lng };
        }
      } else {
        throw new Error("Unsupported JSON format");
      }

      if (Object.keys(next).length === 0) {
        throw new Error("No valid corner coordinates found");
      }

      setCorners(next);
      setImportMsg(`Imported ${Object.keys(next).length} corners`);
      setShowImport(false);
    } catch (e) {
      setImportMsg(`Import failed: ${String(e?.message || e)}`);
    }
  };

  const loadPinsCount = async () => {
    try {
      const res = await fetch("/api/tracks/sebring/pins");
      if (!res.ok) throw new Error(`Pins HTTP ${res.status}`);
      const payload = await res.json();
      setPinsCount(Array.isArray(payload?.pins) ? payload.pins.length : 0);
    } catch {
      // ignore pins count failures in tools panel
    }
  };

  const loadAuthStatus = async () => {
    if (useMock || useLocalExports) {
      setAuth({ loading: false, connected: false, error: "" });
      return;
    }
    try {
      const res = await fetch("/api/auth/adobe/status");
      if (!res.ok) throw new Error(`Auth HTTP ${res.status}`);
      const payload = await res.json();
      setAuth({ loading: false, connected: !!payload?.connected, error: "" });
    } catch (e) {
      setAuth({ loading: false, connected: false, error: String(e?.message || e) });
    }
  };

  const syncMock = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/sync/mock-lightroom?trackId=sebring", { method: "POST" });
      if (!res.ok) throw new Error(`Sync HTTP ${res.status}`);
      await loadPinsCount();
      setSyncMsg("Mock sync complete");
    } catch (e) {
      setSyncMsg(`Sync failed: ${String(e?.message || e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const syncLocalExports = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/sync/local-exports?trackId=sebring", { method: "POST" });
      if (!res.ok) throw new Error(`Sync HTTP ${res.status}`);
      await loadPinsCount();
      setSyncMsg("Local export sync complete");
    } catch (e) {
      setSyncMsg(`Sync failed: ${String(e?.message || e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const syncLightroom = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/sync/lightroom?trackId=sebring", { method: "POST" });
      if (!res.ok) throw new Error(`Sync HTTP ${res.status}`);
      await loadPinsCount();
      setSyncMsg("Lightroom sync complete");
    } catch (e) {
      setSyncMsg(`Sync failed: ${String(e?.message || e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const startConnect = () => {
    window.location.href = "/api/auth/adobe/start?redirect=/sebring-map";
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(CORNER_STORAGE_KEY, JSON.stringify(corners));
    } catch {
      // ignore storage write failures
    }
  }, [corners]);

  useEffect(() => {
    let cancelled = false;

    fetch("/maps/sebring.geojson")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((geo) => {
        if (cancelled) return;

        if (geo?.type === "FeatureCollection" && Array.isArray(geo.features)) {
          const lineFeatures = geo.features.filter((f) => {
            const t = f?.geometry?.type;
            return t === "LineString" || t === "MultiLineString";
          });

          if (lineFeatures.length > 0) {
            setData({ ...geo, features: lineFeatures });
            return;
          }
        }

        setData(geo);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(String(e?.message || e));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadPinsCount();
    loadAuthStatus();
  }, []);

  const geoStyle = useMemo(() => {
    return (feature) => {
      const t = feature?.geometry?.type;

      if (t === "Polygon" || t === "MultiPolygon") {
        return {
          fillOpacity: 0,
          color: "#f2f5ff",
          opacity: 0.95,
          weight: 3,
        };
      }

      return {
        color: "#f2f5ff",
        opacity: 0.95,
        weight: 4,
      };
    };
  }, []);

  return (
    <div style={{ height: "100vh", width: "100%", position: "relative", background: "#070b12", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          zIndex: 9999,
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(7,11,18,0.82)",
          color: "#f2f6ff",
          border: "1px solid rgba(153, 181, 255, 0.2)",
          borderRadius: 10,
          padding: "8px 14px",
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: 0.6,
          lineHeight: 1.1,
          whiteSpace: "nowrap",
          maxWidth: "calc(100vw - 24px)",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        Sebring International Raceway
      </div>

      <div style={{ position: "relative", height: "100%", width: "100%" }}>
      {err ? (
        <div style={{ position: "absolute", zIndex: 9999, background: "#101827", color: "#fff", padding: 12, borderRadius: 8, border: "1px solid #2a3a57" }}>
          GeoJSON load failed: {err}
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          zIndex: 9999,
          top: 12,
          left: 12,
          background: "rgba(7,11,18,0.86)",
          color: "#fff",
          padding: "10px 12px",
          borderRadius: 10,
          fontSize: 12,
          border: "1px solid rgba(153, 181, 255, 0.2)",
          maxWidth: 280,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Tools</div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Lightroom</div>
        <div style={{ color: "#b8c4d8" }}>
          {useLocalExports
            ? "Mode: local exports"
            : useMock
              ? "Mode: mock Lightroom"
              : auth.loading
                ? "Lightroom: checking..."
                : auth.connected
                  ? "Lightroom: connected"
                  : "Lightroom: disconnected"}
        </div>
        {auth.error && !useMock && !useLocalExports ? (
          <div style={{ marginTop: 6, color: "#ffb0b0" }}>{auth.error}</div>
        ) : null}
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={useLocalExports ? syncLocalExports : useMock ? syncMock : syncLightroom}
            disabled={syncing || (!useMock && !useLocalExports && !auth.connected)}
            style={{
              background: syncing ? "#0f1726" : "#101827",
              border: "1px solid #2a3a57",
              color: "#fff",
              padding: "6px 8px",
              borderRadius: 8,
              cursor: syncing ? "default" : "pointer",
              fontSize: 12,
              opacity: syncing || (!useMock && !useLocalExports && !auth.connected) ? 0.65 : 1,
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
              type="button"
              onClick={startConnect}
              style={{
                background: "#101827",
                border: "1px solid #2a3a57",
                color: "#fff",
                padding: "6px 8px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {auth.connected ? "Reconnect" : "Connect"}
            </button>
          ) : null}
        </div>
        <div style={{ marginTop: 6, color: "#b8c4d8" }}>Pins: {pinsCount}</div>
        {syncMsg ? (
          <div style={{ marginTop: 6, color: syncMsg.startsWith("Sync failed") ? "#ff9a9a" : "#9dd8a3" }}>
            {syncMsg}
          </div>
        ) : null}

        <div style={{ height: 1, background: "rgba(255,255,255,0.12)", marginTop: 10, marginBottom: 8 }} />
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Bounds Picker</div>
        <div style={{ color: "#b8c4d8" }}>
          {pickMode ? "Click and drag to draw a rectangle. The bounds will appear below." : "Picker is off."}
        </div>
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => {
              setPickMode((v) => {
                const next = !v;
                if (next) setCornerPickMode(false);
                return next;
              });
            }}
            style={{
              background: "#101827",
              border: "1px solid #2a3a57",
              color: "#fff",
              padding: "6px 8px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {pickMode ? "Disable picker" : "Enable picker"}
          </button>
        </div>
        {bounds ? (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setViewBounds(bounds)}
              style={{
                background: "#101827",
                border: "1px solid #2a3a57",
                color: "#fff",
                padding: "6px 8px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Use bounds for view
            </button>
          </div>
        ) : null}
        {bounds ? (
          <div style={{ marginTop: 8, lineHeight: 1.4 }}>
            <div>North: {bounds.north.toFixed(6)}</div>
            <div>South: {bounds.south.toFixed(6)}</div>
            <div>East: {bounds.east.toFixed(6)}</div>
            <div>West: {bounds.west.toFixed(6)}</div>
          </div>
        ) : null}

        {showCornerPickerTools ? (
          <>
            <div style={{ height: 1, background: "rgba(255,255,255,0.12)", marginTop: 10, marginBottom: 8 }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Corner Picker</div>
            <div style={{ color: "#b8c4d8" }}>{cornerPickMode ? `Click map to set ${activeCorner}` : "Corner picker is off."}</div>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => {
                  setCornerPickMode((v) => {
                    const next = !v;
                    if (next) setPickMode(false);
                    return next;
                  });
                }}
                style={{
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  padding: "6px 8px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {cornerPickMode ? "Disable corner picker" : "Enable corner picker"}
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              <select
                value={activeCorner}
                onChange={(e) => setActiveCorner(e.target.value)}
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "6px 8px",
                  fontSize: 12,
                }}
              >
                {CORNER_ORDER.map((c) => (
                  <option key={c.short} value={c.short}>
                    {c.short} - {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 8, maxHeight: 140, overflowY: "auto", lineHeight: 1.35 }}>
              {CORNER_ORDER.map((c) => {
                const pos = corners[c.short];
                return (
                  <div key={c.short} style={{ marginBottom: 2 }}>
                    {c.short}: {pos ? `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}` : "unset"}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={copyCorners}
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  padding: "6px 8px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {cornerCopied ? "Copied" : "Copy corner JSON"}
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setShowImport((v) => !v)}
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  padding: "6px 8px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {showImport ? "Hide import" : "Import corner JSON"}
              </button>
            </div>
            {showImport ? (
              <div style={{ marginTop: 8 }}>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='Paste JSON from "Copy corner JSON"'
                  style={{
                    width: "100%",
                    minHeight: 90,
                    background: "#0b1422",
                    border: "1px solid #2a3a57",
                    color: "#dfe9ff",
                    borderRadius: 8,
                    padding: 8,
                    fontSize: 11,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    resize: "vertical",
                  }}
                />
                <button
                  type="button"
                  onClick={importCorners}
                  style={{
                    marginTop: 6,
                    width: "100%",
                    background: "#15233a",
                    border: "1px solid #325080",
                    color: "#fff",
                    padding: "6px 8px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Import now
                </button>
              </div>
            ) : null}
            {importMsg ? (
              <div style={{ marginTop: 8, color: importMsg.startsWith("Import failed") ? "#ff9a9a" : "#9dd8a3" }}>
                {importMsg}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <MapContainer
        center={[27.4564, -81.3483]}
        zoom={14}
        bounds={viewLatLngBounds || undefined}
        boundsOptions={{ padding: [0, 0], maxZoom: 18 }}
        maxBounds={viewLatLngBounds || undefined}
        maxBoundsViscosity={0.9}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />
        {data ? <GeoJSON data={data} style={geoStyle} /> : null}
        {viewLatLngBounds ? <FitToBounds bounds={viewLatLngBounds} lockZoom /> : data ? <FitToGeoJSON data={data} /> : null}
        <BoundsPicker enabled={pickMode} onChange={setBounds} />
        <CornerPicker enabled={cornerPickMode} activeCorner={activeCorner} onPick={onCornerPick} />
        {showDebugWindow ? <MapDebug viewLatLngBounds={viewLatLngBounds} /> : null}

        {cornerMarkers.map((corner) => (
          <Marker
            key={corner.short}
            position={[corner.lat, corner.lng]}
            icon={cornerIcons[corner.short]}
          >
            <Popup>
              <div style={{ minWidth: 120 }}>
                <div style={{ fontWeight: 700 }}>{corner.short} - {corner.name}</div>
                <div style={{ fontSize: 12, color: "#9fb2d6" }}>
                  {corner.lat.toFixed(6)}, {corner.lng.toFixed(6)}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        <CircleMarker center={corner3Center} radius={7} pathOptions={{ color: "#ff8c00", fillColor: "#ff8c00", fillOpacity: 0.9 }}>
          <Popup maxWidth={720} minWidth={220}>
            <div style={{ width: "min(600px, 90vw)", overflow: "hidden", borderRadius: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Corner 3 - Inside</div>
              <img
                src="/photos/imsa/sebring1.jpg"
                alt="Corner 3 - Inside"
                style={{ width: "100%", height: "auto", maxHeight: "55vh", objectFit: "cover", display: "block" }}
              />
            </div>
          </Popup>
        </CircleMarker>
      </MapContainer>

      <style jsx global>{`
        .leaflet-popup-content-wrapper,
        .leaflet-popup-tip {
          background: #0f1724;
          color: #eef3ff;
          border: 1px solid rgba(153, 181, 255, 0.25);
        }
      `}</style>
      </div>
    </div>
  );
}
