"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Rectangle, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import { geoJSON } from "leaflet";
import "leaflet/dist/leaflet.css";

function FitToBounds({ bounds }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !bounds) return;

    const fit = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [8, 8], maxZoom: 18 });
    };

    if (map._loaded) {
      fit();
    } else {
      map.whenReady(fit);
    }

    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [map, bounds]);

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

export default function SebringLeaflet() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [pickMode, setPickMode] = useState(false);
  const [bounds, setBounds] = useState(null);
  const [viewBounds, setViewBounds] = useState({
    north: 27.457711,
    south: 27.448115,
    east: -81.345778,
    west: -81.35951,
  });

  const corner3Bounds = {
    north: 27.45436,
    south: 27.45317,
    east: -81.3489,
    west: -81.349479,
  };

  const corner3Rect = [
    [corner3Bounds.south, corner3Bounds.west],
    [corner3Bounds.north, corner3Bounds.east],
  ];

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

  useEffect(() => {
    let cancelled = false;

    fetch("/maps/sebring.geojson")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((geo) => {
        if (cancelled) return;

        // If we have any line features, prefer rendering ONLY the lines (circuit loop),
        // otherwise fall back to rendering whatever we got (but outline-only styling below prevents fills).
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

  // Style function: always disable polygon fill; give lines some stroke weight.
  // (No explicit colors specified.)
  const geoStyle = useMemo(() => {
    return (feature) => {
      const t = feature?.geometry?.type;

      if (t === "Polygon" || t === "MultiPolygon") {
        return {
          fillOpacity: 0, // <- kills the big shaded block
          weight: 3,
        };
      }

      // Lines
      return {
        weight: 4,
      };
    };
  }, []);

  return (
    <div style={{ height: "100vh", width: "100%", position: "relative" }}>
      {err ? (
        <div style={{ position: "absolute", zIndex: 9999, background: "white", padding: 12 }}>
          GeoJSON load failed: {err}
        </div>
      ) : null}

        <div
          style={{
            position: "absolute",
            zIndex: 9999,
            top: 12,
          left: 12,
          background: "rgba(0,0,0,0.75)",
          color: "#fff",
          padding: "10px 12px",
          borderRadius: 10,
          fontSize: 12,
          maxWidth: 280,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Bounds Picker</div>
        <div style={{ color: "#bbb" }}>
          {pickMode
            ? "Click and drag to draw a rectangle. The bounds will appear below."
            : "Picker is off."}
        </div>
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setPickMode((v) => !v)}
            style={{
              background: "#111",
              border: "1px solid #333",
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
                background: "#1b1b1b",
                border: "1px solid #333",
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
      </div>

      <MapContainer
        center={[27.4564, -81.3483]}
        zoom={14}
        bounds={viewLatLngBounds || undefined}
        boundsOptions={{ padding: [8, 8], maxZoom: 18 }}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {data ? <GeoJSON data={data} style={geoStyle} /> : null}
        {viewLatLngBounds ? (
          <FitToBounds bounds={viewLatLngBounds} />
        ) : data ? (
          <FitToGeoJSON data={data} />
        ) : null}
        <BoundsPicker enabled={pickMode} onChange={setBounds} />

        <Rectangle bounds={corner3Rect} pathOptions={{ color: "#ff8c00", weight: 2 }} />
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
    </div>
  );
}
