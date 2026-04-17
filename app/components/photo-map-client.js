"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from "react-leaflet";
import { divIcon, geoJSON, latLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";

function isFiniteCoord(value) {
  return Number.isFinite(Number(value));
}

function toPhoto(asset) {
  return {
    id: asset.asset_id || asset.id,
    name: asset.alt_text_snapshot || asset.name || asset.asset_id || asset.id || "Photo",
    thumbUrl: asset.thumb_url || asset.thumbUrl || asset.full_url || asset.fullUrl,
    fullUrl: asset.full_url || asset.fullUrl || asset.thumb_url || asset.thumbUrl,
  };
}

function FitToData({ mapGeoJson, markers }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    let bounds = null;
    for (const marker of markers || []) {
      if (!isFiniteCoord(marker.lat) || !isFiniteCoord(marker.lng)) continue;
      const point = [Number(marker.lat), Number(marker.lng)];
      if (!bounds) bounds = latLngBounds(point, point);
      else bounds.extend(point);
    }

    if ((!bounds || !bounds.isValid()) && mapGeoJson) {
      try {
        const geoBounds = geoJSON(mapGeoJson).getBounds();
        if (geoBounds.isValid()) bounds = geoBounds;
      } catch {
        // Ignore invalid GeoJSON; the configured center still gives a usable map.
      }
    }

    if (!bounds || !bounds.isValid()) return;

    const fit = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18 });
    };

    if (map._loaded) fit();
    else map.whenReady(fit);
  }, [map, mapGeoJson, markers]);

  return null;
}

function makeMarkerIcon(photoCount, variant) {
  const bg = variant === "pin" ? "#ffd84d" : "#ff8c00";
  const border = variant === "pin" ? "#101827" : "#111";
  return divIcon({
    className: "photo-map-marker",
    html: `<div style="background:${bg};color:#111;border:2px solid ${border};border-radius:999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;">${photoCount}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

function ViewerBody({ viewer, onNext, onPrev, setViewer }) {
  const active = viewer.photos[viewer.index];

  if (!active) {
    return <div style={{ color: "#d7deea" }}>{viewer.loading ? "Loading photos..." : "No photos for this marker."}</div>;
  }

  return (
    <div style={{ maxWidth: "92vw", maxHeight: "88vh", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
      <div style={{ position: "relative" }}>
        <img
          src={active.fullUrl}
          alt={active.name}
          style={{ maxWidth: "92vw", maxHeight: "72vh", borderRadius: 8, border: "1px solid #222", display: "block" }}
          draggable={false}
        />

        {viewer.photos.length > 1 ? (
          <>
            <button type="button" onClick={onPrev} className="photoMapViewerButton photoMapViewerButtonPrev">
              Prev
            </button>
            <button type="button" onClick={onNext} className="photoMapViewerButton photoMapViewerButtonNext">
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
            style={{ border: i === viewer.index ? "2px solid #ffbf3d" : "1px solid #333", padding: 0, borderRadius: 8, background: "transparent", cursor: "pointer" }}
          >
            <img src={photo.thumbUrl} alt={photo.name} style={{ width: 110, height: 70, objectFit: "cover", borderRadius: 6, display: "block" }} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PhotoMapClient({
  title,
  trackId,
  center = [0, 0],
  zoom = 15,
  mapGeoJson = null,
  photoMarkers = [],
  loadPins = false,
}) {
  const [pins, setPins] = useState([]);
  const [pinsError, setPinsError] = useState("");
  const [viewer, setViewer] = useState({ open: false, markerId: null, photos: [], index: 0, loading: false });

  useEffect(() => {
    if (!loadPins || !trackId) return;
    let cancelled = false;
    fetch(`/api/tracks/${encodeURIComponent(trackId)}/pins`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((payload) => {
        if (cancelled) return;
        setPins(Array.isArray(payload?.pins) ? payload.pins : []);
        setPinsError("");
      })
      .catch((error) => {
        if (cancelled) return;
        setPins([]);
        setPinsError(String(error?.message || error));
      });
    return () => {
      cancelled = true;
    };
  }, [loadPins, trackId]);

  const markers = useMemo(() => {
    const staticMarkers = (Array.isArray(photoMarkers) ? photoMarkers : [])
      .filter((marker) => isFiniteCoord(marker.lat) && isFiniteCoord(marker.lng))
      .map((marker) => ({
        id: marker.id,
        lat: Number(marker.lat),
        lng: Number(marker.lng),
        title: marker.title || "Photo spot",
        photoCount: Array.isArray(marker.photos) ? marker.photos.length : 0,
        photos: Array.isArray(marker.photos) ? marker.photos : [],
        variant: "static",
      }));

    const pinMarkers = (Array.isArray(pins) ? pins : [])
      .filter((pin) => isFiniteCoord(pin.lat) && isFiniteCoord(pin.lng) && Number(pin.photo_count || 0) > 0)
      .map((pin) => ({
        id: pin.pin_id,
        lat: Number(pin.lat),
        lng: Number(pin.lng),
        title: pin.title || pin.race || "GPS photos",
        photoCount: Number(pin.photo_count || 0),
        coverThumbUrl: pin.cover_thumb_url,
        year: pin.year,
        race: pin.race,
        variant: "pin",
      }));

    return [...staticMarkers, ...pinMarkers];
  }, [photoMarkers, pins]);

  const markerIcons = useMemo(() => {
    const icons = {};
    for (const marker of markers) {
      icons[marker.id] = makeMarkerIcon(marker.photoCount, marker.variant);
    }
    return icons;
  }, [markers]);

  const closeViewer = () => setViewer({ open: false, markerId: null, photos: [], index: 0, loading: false });
  const next = () => setViewer((v) => (v.photos.length ? { ...v, index: (v.index + 1) % v.photos.length } : v));
  const prev = () => setViewer((v) => (v.photos.length ? { ...v, index: (v.index - 1 + v.photos.length) % v.photos.length } : v));

  useEffect(() => {
    if (!viewer.open) return;
    const onKey = (event) => {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowLeft") prev();
      if (event.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer.open]);

  async function openViewer(marker) {
    if (Array.isArray(marker.photos) && marker.photos.length) {
      setViewer({ open: true, markerId: marker.id, photos: marker.photos, index: 0, loading: false });
      return;
    }

    setViewer({ open: true, markerId: marker.id, photos: [], index: 0, loading: true });
    try {
      const res = await fetch(`/api/pins/${encodeURIComponent(marker.id)}/assets`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const photos = (Array.isArray(payload?.assets) ? payload.assets : []).map(toPhoto).filter((photo) => photo.thumbUrl || photo.fullUrl);
      setViewer({ open: true, markerId: marker.id, photos, index: 0, loading: false });
    } catch {
      setViewer({ open: true, markerId: marker.id, photos: [], index: 0, loading: false });
    }
  }

  return (
    <div style={{ height: "100vh", width: "100%", position: "relative", background: "#07100c", overflow: "hidden" }}>
      <div className="photoMapTitle">{title}</div>

      {pinsError ? <div className="photoMapNotice">Pins could not load: {pinsError}</div> : null}

      <MapContainer center={center} zoom={zoom} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {mapGeoJson ? <GeoJSON data={mapGeoJson} style={{ color: "#1f7a5c", weight: 3, fillOpacity: 0.12 }} /> : null}

        {markers.map((marker) => (
          <Marker key={marker.id} position={[marker.lat, marker.lng]} icon={markerIcons[marker.id]}>
            <Popup closeOnClick={false} autoClose={false}>
              <div style={{ minWidth: 210 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>{marker.title}</div>
                <div style={{ color: "#c8d2e0", fontSize: 12, marginBottom: 8 }}>
                  {marker.photoCount} photo{marker.photoCount === 1 ? "" : "s"}
                  {marker.year ? ` - ${marker.year}` : ""}
                </div>
                {marker.coverThumbUrl ? (
                  <img src={marker.coverThumbUrl} alt="" style={{ width: 180, height: 110, objectFit: "cover", borderRadius: 8, border: "1px solid #333", display: "block", marginBottom: 8 }} />
                ) : marker.photos?.[0]?.thumbUrl ? (
                  <img src={marker.photos[0].thumbUrl} alt="" style={{ width: 180, height: 110, objectFit: "cover", borderRadius: 8, border: "1px solid #333", display: "block", marginBottom: 8 }} />
                ) : null}
                <button type="button" onClick={() => openViewer(marker)} className="photoMapButton">
                  Open viewer
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        <FitToData mapGeoJson={mapGeoJson} markers={markers} />
      </MapContainer>

      {viewer.open ? (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeViewer();
          }}
          className="photoMapViewer"
        >
          <div className="photoMapViewerHeader">
            <div>{title}</div>
            <button type="button" onClick={closeViewer} className="photoMapButton">
              Close
            </button>
          </div>
          <ViewerBody viewer={viewer} onNext={next} onPrev={prev} setViewer={setViewer} />
        </div>
      ) : null}

      <style jsx global>{`
        .photoMapTitle {
          position: absolute;
          z-index: 9999;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(7, 16, 12, 0.84);
          color: #f4fbf7;
          border: 1px solid rgba(140, 205, 170, 0.34);
          border-radius: 8px;
          padding: clamp(6px, 1.4vw, 10px) clamp(10px, 2.4vw, 16px);
          font-size: clamp(17px, 4.8vw, 28px);
          font-weight: 800;
          letter-spacing: 0;
          line-height: 1.15;
          text-align: center;
          max-width: calc(100vw - 16px);
        }
        .photoMapNotice {
          position: absolute;
          z-index: 9999;
          left: 10px;
          bottom: 10px;
          max-width: min(420px, calc(100vw - 20px));
          background: rgba(20, 12, 12, 0.88);
          color: #ffd7d7;
          border: 1px solid rgba(255, 160, 160, 0.32);
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
        }
        .photoMapButton,
        .photoMapViewerButton {
          background: #111;
          border: 1px solid #2b3340;
          color: #fff;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
        }
        .photoMapViewer {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.92);
          z-index: 20000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .photoMapViewerHeader {
          position: absolute;
          top: 12px;
          left: 12px;
          right: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          color: #cfd8e6;
          font-size: 12px;
        }
        .photoMapViewerButtonPrev {
          position: absolute;
          left: -50px;
          top: 50%;
          transform: translateY(-50%);
        }
        .photoMapViewerButtonNext {
          position: absolute;
          right: -50px;
          top: 50%;
          transform: translateY(-50%);
        }
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
