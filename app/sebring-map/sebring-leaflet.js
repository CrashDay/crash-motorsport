"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export default function SebringLeaflet() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

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
    <div style={{ height: "100vh", width: "100%" }}>
      {err ? (
        <div style={{ position: "absolute", zIndex: 9999, background: "white", padding: 12 }}>
          GeoJSON load failed: {err}
        </div>
      ) : null}

      <MapContainer center={[27.4564, -81.3483]} zoom={14} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {data ? <GeoJSON data={data} style={geoStyle} /> : null}
      </MapContainer>
    </div>
  );
}