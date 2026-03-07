"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from "react-leaflet";
import { divIcon, geoJSON, latLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";

function FitToData({ mapGeoJson, photoMarkers }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    let bounds = null;
    let markerBounds = null;

    for (const marker of photoMarkers || []) {
      if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) continue;
      if (!markerBounds) {
        markerBounds = latLngBounds([marker.lat, marker.lng], [marker.lat, marker.lng]);
      } else {
        markerBounds.extend([marker.lat, marker.lng]);
      }
    }

    if (markerBounds?.isValid()) {
      bounds = markerBounds;
    } else if (mapGeoJson) {
      try {
        const geoBounds = geoJSON(mapGeoJson).getBounds();
        if (geoBounds.isValid()) {
          bounds = geoBounds;
        }
      } catch {
        // ignore invalid geojson
      }
    }

    if (!bounds || !bounds.isValid()) return;

    const fit = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 18 });
    };

    if (map._loaded) {
      fit();
    } else {
      map.whenReady(fit);
    }
  }, [map, mapGeoJson, photoMarkers]);

  return null;
}

function makeMarkerIcon(photoCount) {
  return divIcon({
    className: "daniels-photo-marker",
    html: `<div style="background:#ff8c00;color:#111;border:2px solid #111;border-radius:999px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;">${photoCount}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

function ViewerBody({ viewer, onNext, onPrev, setViewer }) {
  const active = viewer.photos[viewer.index];

  return (
    <div style={{ maxWidth: "92vw", maxHeight: "88vh", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
      <div style={{ position: "relative" }}>
        <img
          src={active.fullUrl}
          alt={active.name}
          style={{ maxWidth: "92vw", maxHeight: "72vh", borderRadius: 12, border: "1px solid #222", display: "block" }}
          draggable={false}
        />

        {viewer.photos.length > 1 ? (
          <>
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
          </>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, maxWidth: "92vw" }}>
        {viewer.photos.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setViewer((v) => ({ ...v, index: i }))}
            style={{ border: i === viewer.index ? "2px solid #ff8c00" : "1px solid #333", padding: 0, borderRadius: 8, background: "transparent", cursor: "pointer" }}
          >
            <img
              src={photo.thumbUrl}
              alt={photo.name}
              style={{ width: 110, height: 70, objectFit: "cover", borderRadius: 6, display: "block" }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DanielsParkClient({ mapGeoJson, photoMarkers = [] }) {
  const [viewer, setViewer] = useState({ open: false, markerId: null, photos: [], index: 0 });

  const markerIcons = useMemo(() => {
    const m = {};
    for (const marker of photoMarkers) {
      m[marker.id] = makeMarkerIcon(marker.photos.length);
    }
    return m;
  }, [photoMarkers]);

  const closeViewer = () => setViewer({ open: false, markerId: null, photos: [], index: 0 });
  const openViewer = (marker) => setViewer({ open: true, markerId: marker.id, photos: marker.photos, index: 0 });

  const next = () =>
    setViewer((v) => {
      if (!v.photos.length) return v;
      return { ...v, index: (v.index + 1) % v.photos.length };
    });

  const prev = () =>
    setViewer((v) => {
      if (!v.photos.length) return v;
      return { ...v, index: (v.index - 1 + v.photos.length) % v.photos.length };
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

  return (
    <div style={{ height: "100vh", width: "100%", position: "relative", background: "#070b12", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          zIndex: 9999,
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(7,11,18,0.82)",
          color: "#f2f6ff",
          border: "1px solid rgba(153, 181, 255, 0.2)",
          borderRadius: 10,
          padding: "clamp(6px, 1.4vw, 10px) clamp(10px, 2.4vw, 16px)",
          fontSize: "clamp(17px, 4.8vw, 28px)",
          fontWeight: 700,
          letterSpacing: "clamp(0.2px, 0.1vw, 0.6px)",
          lineHeight: 1.15,
          textAlign: "center",
          whiteSpace: "normal",
          maxWidth: "calc(100vw - 16px)",
        }}
      >
        Daniels Park - Douglas County
      </div>

      <MapContainer
        center={[39.4923, -104.9171]}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {mapGeoJson ? (
          <GeoJSON
            data={mapGeoJson}
            style={{
              color: "#2563eb",
              weight: 3,
              fillOpacity: 0.12,
            }}
          />
        ) : null}

        {photoMarkers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={markerIcons[marker.id]}
          >
            <Popup closeOnClick={false} autoClose={false}>
              <div style={{ minWidth: 200 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  {marker.photos.length} photo{marker.photos.length === 1 ? "" : "s"}
                </div>
                <img
                  src={marker.photos[0].thumbUrl}
                  alt={marker.photos[0].name}
                  style={{ width: 180, height: 110, objectFit: "cover", borderRadius: 8, border: "1px solid #333" }}
                />
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openViewer(marker);
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openViewer(marker);
                    }}
                    style={{
                      background: "#111",
                      border: "1px solid #222",
                      color: "#fff",
                      padding: "8px 10px",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    Open viewer
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        <FitToData mapGeoJson={mapGeoJson} photoMarkers={photoMarkers} />
      </MapContainer>

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
            zIndex: 20000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", justifyContent: "space-between", color: "#bbb", fontSize: 12 }}>
            <div>Daniels Park Photos</div>
            <button
              type="button"
              onClick={closeViewer}
              style={{ background: "#111", border: "1px solid #222", color: "#fff", padding: "8px 10px", borderRadius: 10, cursor: "pointer" }}
            >
              Close
            </button>
          </div>

          {viewer.photos.length ? (
            <ViewerBody viewer={viewer} onNext={next} onPrev={prev} setViewer={setViewer} />
          ) : (
            <div style={{ color: "#bbb" }}>No photos for this marker.</div>
          )}
        </div>
      ) : null}

      <style jsx global>{`
        .leaflet-popup-content-wrapper,
        .leaflet-popup-tip {
          background: #0f1724;
          color: #eef3ff;
          border: 1px solid rgba(153, 181, 255, 0.25);
        }
      `}</style>
    </div>
  );
}
