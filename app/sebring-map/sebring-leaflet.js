"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Rectangle, Circle, Polyline, CircleMarker, Popup, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { geoJSON, icon } from "leaflet";
import "leaflet/dist/leaflet.css";
import lightroomImageUrl from "@/lib/lightroom-image-url";
import { readBrowserPhotoMetadata } from "@/lib/browser-exif-gps";
import { SHARED_ALBUM_SERIES } from "@/lib/shared-album-constants";

const { normalizeLightroomImageUrl } = lightroomImageUrl;

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
const PHOTO_AREA_STORAGE_KEY = "sebring_photo_areas_v1";
const AREA_STYLE_STORAGE_KEY = "sebring_area_style_v1";
const DEFAULT_PHOTO_AREAS = [
  {
    id: "area-1772982986829-6a537i",
    title: "Turn 3 Outside North",
    bounds: {
      north: 27.454798,
      south: 27.454617,
      east: -81.349061,
      west: -81.34964,
    },
    center: [27.454707, -81.34935],
    photos: [],
  },
  {
    id: "area-1772984280521-draft",
    title: "Turn 3 Outside East",
    bounds: {
      north: 27.454494,
      south: 27.453894,
      east: -81.348685,
      west: -81.348835,
    },
    center: [27.454194, -81.34876],
    photos: [],
  },
  {
    id: "area-1772984574066-draft",
    title: "Turn 1 Outside East",
    bounds: {
      north: 27.451856,
      south: 27.450447,
      east: -81.348256,
      west: -81.348395,
    },
    center: [27.451152, -81.348326],
    photos: [],
  },
  {
    id: "area-1772984895437-draft",
    title: "Turn 1 Outside South",
    bounds: {
      north: 27.450057,
      south: 27.449914,
      east: -81.348771,
      west: -81.349908,
    },
    center: [27.449986, -81.349339],
    photos: [],
  },
  {
    id: "area-1772985408146-draft",
    title: "Turn 7 (Hairpin) Inside",
    bounds: {
      north: 27.453018,
      south: 27.452675,
      east: -81.357579,
      west: -81.358126,
    },
    center: [27.452846, -81.357853],
    photos: [],
  },
];
const DEFAULT_CORNERS = {
  T1: { lat: 27.450638, lng: -81.348975 },
  T2: { lat: 27.453151, lng: -81.349018 },
  T3: { lat: 27.45437, lng: -81.349146 },
  T4: { lat: 27.454741, lng: -81.349608 },
  T5: { lat: 27.454789, lng: -81.350616 },
  T6: { lat: 27.45376, lng: -81.351957 },
  T7: { lat: 27.452818, lng: -81.358545 },
  T8: { lat: 27.454617, lng: -81.357279 },
  T9: { lat: 27.455427, lng: -81.355058 },
  T10: { lat: 27.456988, lng: -81.35258 },
  T11: { lat: 27.456579, lng: -81.351013 },
  T12: { lat: 27.456693, lng: -81.349522 },
  T13: { lat: 27.456655, lng: -81.34817 },
  T14: { lat: 27.45298, lng: -81.347634 },
  T15: { lat: 27.450343, lng: -81.346282 },
  T16: { lat: 27.448276, lng: -81.346689 },
  T17: { lat: 27.4492, lng: -81.357783 },
};
const TURN3_INSIDE_AREA = {
  id: "builtin-turn3-inside",
  title: "Turn 3 Inside",
  bounds: {
    north: 27.45436,
    south: 27.45317,
    east: -81.3489,
    west: -81.349479,
  },
};

const AREA_VISUAL_MODES = [
  { id: "soft_fill", label: "Soft Fill" },
  { id: "dashed_glow", label: "Dashed Glow" },
  { id: "corner_brackets", label: "Corner Brackets" },
  { id: "heat_blur", label: "Heat Blur" },
  { id: "photo_heatmap", label: "Photo Heatmap" },
];
const AREA_OVERLAY_COLOR = "#5da2ff";
const AREA_MARKER_COLOR = "rgb(210, 40, 40)";

function isSharedLinkPhoto(photo) {
  const id = String(photo?.id || "").trim().toLowerCase();
  const rawUrl = String(photo?.fullUrl || photo?.src || photo?.thumbUrl || "").trim().toLowerCase();
  return id.startsWith("shared:") || rawUrl.includes("adobe.ly/") || rawUrl.includes("lightroom.adobe.com/shares/");
}

function extractSharedLink(photo) {
  const direct = String(photo?.fullUrl || photo?.src || photo?.thumbUrl || "").trim();
  const directLower = direct.toLowerCase();
  if (directLower.includes("adobe.ly/") || directLower.includes("lightroom.adobe.com/shares/")) {
    return direct;
  }

  const id = String(photo?.id || "");
  const marker = "::http";
  const idx = id.indexOf(marker);
  if (idx >= 0) return id.slice(idx + 2);

  const alt = String(photo?.alt || photo?.name || "");
  const match = alt.match(/https?:\/\/\S+/i);
  return String(match?.[0] || "").trim();
}

function getRenderablePhotoUrl(photo) {
  if (!photo) return "";
  if (isSharedLinkPhoto(photo)) {
    const link = extractSharedLink(photo);
    if (!link) return "";
    return `/api/share-photo/preview?url=${encodeURIComponent(link)}`;
  }
  return normalizeLightroomImageUrl(photo.fullUrl || photo.src || photo.thumbUrl || "");
}

function inferPhotoYear(photo) {
  const explicit = Number(photo?.year);
  if (Number.isInteger(explicit) && explicit >= 1900 && explicit <= 2100) return explicit;
  const source = [photo?.id, photo?.name, photo?.fullUrl, photo?.thumbUrl, photo?.src]
    .map((v) => String(v || ""))
    .join(" ")
    .toLowerCase();
  if (source.includes("wec-sebring-2023") || source.includes("/photos/wec_1000/")) return 2023;
  if (source.includes("sebring_2022") || source.includes("sebring-2022")) return 2022;
  if (source.includes("sebring2023") || source.includes("sebring_2023") || source.includes("sebring-2023")) return 2023;
  const match = source.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const n = Number(match[0]);
  return n >= 1900 && n <= 2100 ? n : null;
}

function inferPhotoRace(photo) {
  const explicit = String(photo?.race || "").trim();
  if (explicit) return explicit;
  const source = [photo?.id, photo?.name, photo?.fullUrl, photo?.thumbUrl, photo?.src]
    .map((v) => String(v || ""))
    .join(" ")
    .toLowerCase();
  if (source.includes("wec-sebring-2023") || source.includes("/photos/wec_1000/")) {
    return "1000 Miles of Sebring";
  }
  return "12 Hours of Sebring";
}

function toLatLngBounds(bounds) {
  return [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ];
}

function bracketLines(bounds) {
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  const latCut = latSpan * 0.22;
  const lngCut = lngSpan * 0.22;
  return [
    [[bounds.north, bounds.west], [bounds.north - latCut, bounds.west]],
    [[bounds.north, bounds.west], [bounds.north, bounds.west + lngCut]],
    [[bounds.north, bounds.east], [bounds.north - latCut, bounds.east]],
    [[bounds.north, bounds.east], [bounds.north, bounds.east - lngCut]],
    [[bounds.south, bounds.west], [bounds.south + latCut, bounds.west]],
    [[bounds.south, bounds.west], [bounds.south, bounds.west + lngCut]],
    [[bounds.south, bounds.east], [bounds.south + latCut, bounds.east]],
    [[bounds.south, bounds.east], [bounds.south, bounds.east - lngCut]],
  ];
}

function heatRadiusMeters(bounds) {
  const centerLat = (bounds.north + bounds.south) / 2;
  const latMeters = Math.abs(bounds.north - bounds.south) * 111320;
  const lngMeters = Math.abs(bounds.east - bounds.west) * 111320 * Math.cos((centerLat * Math.PI) / 180);
  return Math.max(10, Math.hypot(latMeters, lngMeters) * 0.28);
}

function areaPhotoHeatRadiusMeters(bounds, ratio) {
  const geometryRadius = heatRadiusMeters(bounds);
  const countRadius = 46 + Math.max(0, Math.min(1, ratio)) * 72;
  return Math.max(countRadius, Math.min(geometryRadius, 112));
}

function normalizeCornerMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [cornerIdRaw, value] of Object.entries(raw)) {
    const cornerId = String(cornerIdRaw || "").trim();
    if (!cornerId) continue;
    const lat = Number(value?.lat);
    const lng = Number(value?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out[cornerId] = {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    };
  }
  return out;
}

function hasCornerData(cornerMap) {
  return Object.keys(normalizeCornerMap(cornerMap)).length > 0;
}

function normalizePhotoArea(area) {
  if (!area || typeof area !== "object") return null;
  const id = String(area.id || "").trim();
  if (!id || id === TURN3_INSIDE_AREA.id) return null;
  const title = String(area.title || id).trim();
  const north = Number(area?.bounds?.north);
  const south = Number(area?.bounds?.south);
  const east = Number(area?.bounds?.east);
  const west = Number(area?.bounds?.west);
  if (![north, south, east, west].every(Number.isFinite)) return null;
  const bounds = {
    north: Number(Math.max(north, south).toFixed(6)),
    south: Number(Math.min(north, south).toFixed(6)),
    east: Number(Math.max(east, west).toFixed(6)),
    west: Number(Math.min(east, west).toFixed(6)),
  };
  let centerLat = Number(area?.center?.[0]);
  let centerLng = Number(area?.center?.[1]);
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
    centerLat = (bounds.north + bounds.south) / 2;
    centerLng = (bounds.east + bounds.west) / 2;
  }
  return {
    id,
    title,
    bounds,
    center: [Number(centerLat.toFixed(6)), Number(centerLng.toFixed(6))],
    photos: Array.isArray(area.photos) ? area.photos : [],
  };
}

function AreaOverlay({ bounds, title, mode, photoCount = 0, maxPhotoCount = 1 }) {
  const center = [(bounds.north + bounds.south) / 2, (bounds.east + bounds.west) / 2];
  const rect = toLatLngBounds(bounds);
  const safeMax = Math.max(1, Number(maxPhotoCount) || 1);
  const ratio = Math.max(0, Math.min(1, (Number(photoCount) || 0) / safeMax));
  const heatColor = `rgb(${Math.round(120 + ratio * 135)}, ${Math.round(10 + ratio * 40)}, ${Math.round(10 + ratio * 35)})`;
  const photoHeatRadius = areaPhotoHeatRadiusMeters(bounds, ratio);

  return (
    <Fragment>
      {mode === "soft_fill" ? (
        <Rectangle
          bounds={rect}
          interactive={false}
          pathOptions={{ stroke: false, fillColor: AREA_OVERLAY_COLOR, fillOpacity: 0.16 }}
        />
      ) : null}

      {mode === "dashed_glow" ? (
        <Fragment>
          <Rectangle
            bounds={rect}
            interactive={false}
            pathOptions={{ color: AREA_OVERLAY_COLOR, weight: 6, opacity: 0.22, fillOpacity: 0 }}
          />
          <Rectangle
            bounds={rect}
            interactive={false}
            pathOptions={{ color: AREA_OVERLAY_COLOR, weight: 2, dashArray: "4 4", fillOpacity: 0.04 }}
          />
        </Fragment>
      ) : null}

      {mode === "corner_brackets" ? (
        <Fragment>
          {bracketLines(bounds).map((line, i) => (
            <Polyline key={`${title}-br-${i}`} positions={line} interactive={false} pathOptions={{ color: AREA_OVERLAY_COLOR, weight: 3 }} />
          ))}
        </Fragment>
      ) : null}

      {mode === "heat_blur" ? (
        <Fragment>
          <Circle
            center={center}
            radius={heatRadiusMeters(bounds)}
            interactive={false}
            pathOptions={{ stroke: false, fillColor: AREA_OVERLAY_COLOR, fillOpacity: 0.13 }}
          />
          <Circle
            center={center}
            radius={heatRadiusMeters(bounds) * 0.55}
            interactive={false}
            pathOptions={{ stroke: false, fillColor: AREA_OVERLAY_COLOR, fillOpacity: 0.2 }}
          />
        </Fragment>
      ) : null}

      {mode === "photo_heatmap" ? (
        <Fragment>
          <Rectangle
            bounds={rect}
            interactive={false}
            pathOptions={{
              color: AREA_OVERLAY_COLOR,
              weight: 2,
              opacity: 0.9,
              fillOpacity: 0.12 + ratio * 0.2,
              fillColor: heatColor,
            }}
          />
          <Circle
            center={center}
            radius={photoHeatRadius}
            interactive={false}
            pathOptions={{ stroke: false, fillColor: heatColor, fillOpacity: 0.12 + ratio * 0.22 }}
          />
          <Circle
            center={center}
            radius={photoHeatRadius * (0.48 + ratio * 0.22)}
            interactive={false}
            pathOptions={{ stroke: false, fillColor: heatColor, fillOpacity: 0.12 + ratio * 0.3 }}
          />
        </Fragment>
      ) : null}

      <Rectangle bounds={rect} interactive pathOptions={{ color: AREA_OVERLAY_COLOR, weight: 0, fillOpacity: 0, opacity: 0 }}>
        <Tooltip sticky direction="top" opacity={0.95}>
          {mode === "photo_heatmap" ? `${title} - ${photoCount} photo${photoCount === 1 ? "" : "s"}` : title}
        </Tooltip>
      </Rectangle>
    </Fragment>
  );
}

function gpsClusterHeatColor(ratio) {
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
  return `rgb(${Math.round(214 + clamped * 41)}, ${Math.round(170 + clamped * 46)}, ${Math.round(36 + clamped * 41)})`;
}

function cornerIcon(short) {
  return icon({
    iconUrl: `/markers/corners/${short}.svg`,
    iconSize: [28, 18],
    iconAnchor: [14, 9],
    popupAnchor: [0, -10],
  });
}

function FitToBounds({ bounds, lockZoom, version = 0 }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !bounds) return;

    const fit = () => {
      map.setMaxBounds(bounds);
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
  }, [map, bounds, lockZoom, version]);

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

  return <Rectangle bounds={bounds} interactive={false} pathOptions={{ color: "#00e5ff", weight: 2 }} />;
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
  const showDebugWindow = false;
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK_LIGHTROOM === "true";
  const useLocalExports = process.env.NEXT_PUBLIC_USE_LOCAL_EXPORTS === "true";
  const [toolPanels, setToolPanels] = useState({
    lightroom: true,
    bounds: false,
    areaStyle: false,
    areas: false,
    corner: false,
  });
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [pickMode, setPickMode] = useState(false);
  const [cornerPickMode, setCornerPickMode] = useState(false);
  const [activeCorner, setActiveCorner] = useState(CORNER_ORDER[0].short);
  const [corners, setCorners] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_CORNERS;
    try {
      const raw = window.localStorage.getItem(CORNER_STORAGE_KEY);
      if (!raw) return DEFAULT_CORNERS;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? { ...DEFAULT_CORNERS, ...parsed } : DEFAULT_CORNERS;
    } catch {
      return DEFAULT_CORNERS;
    }
  });
  const initialCornersRef = useRef(corners);
  const didRunCornerPersistRef = useRef(false);
  const [cornerCopied, setCornerCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [pins, setPins] = useState([]);
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
  const [viewBoundsVersion, setViewBoundsVersion] = useState(0);
  const [areaVisualMode, setAreaVisualMode] = useState(() => {
    if (typeof window === "undefined") return "photo_heatmap";
    try {
      const raw = window.localStorage.getItem(AREA_STYLE_STORAGE_KEY);
      if (raw && AREA_VISUAL_MODES.some((m) => m.id === raw)) return raw;
    } catch {
      // ignore localStorage read errors
    }
    return "photo_heatmap";
  });
  const [areaStyleDraft, setAreaStyleDraft] = useState("photo_heatmap");
  const [areaStyleMsg, setAreaStyleMsg] = useState("");
  const [areaViewer, setAreaViewer] = useState({ open: false, areaId: "", title: "", photos: [], index: 0 });
  const [gpsViewer, setGpsViewer] = useState({ open: false, title: "", photos: [], index: 0, loading: false, error: "" });
  const [areaViewerMsg, setAreaViewerMsg] = useState("");
  const [removingAreaPhoto, setRemovingAreaPhoto] = useState(false);
  const [photoAreaName, setPhotoAreaName] = useState("New photo area");
  const [editingAreaId, setEditingAreaId] = useState("");
  const [photoAreaMsg, setPhotoAreaMsg] = useState("");
  const [photoAreaCopied, setPhotoAreaCopied] = useState(false);
  const [shareShortLink, setShareShortLink] = useState("");
  const [shareYear, setShareYear] = useState("2023");
  const [shareRace, setShareRace] = useState("12 Hours of Sebring");
  const [shareDateTime, setShareDateTime] = useState("");
  const [shareLat, setShareLat] = useState("");
  const [shareLng, setShareLng] = useState("");
  const [shareAreaId, setShareAreaId] = useState("");
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareAlbumShortLink, setShareAlbumShortLink] = useState("");
  const [shareAlbumSeries, setShareAlbumSeries] = useState("imsa");
  const [shareAlbumExistingSlug, setShareAlbumExistingSlug] = useState("");
  const [shareAlbumSlug, setShareAlbumSlug] = useState("");
  const [shareAlbumYear, setShareAlbumYear] = useState("2023");
  const [shareAlbumRace, setShareAlbumRace] = useState("12 Hours of Sebring");
  const [shareAlbumAreaId, setShareAlbumAreaId] = useState("");
  const [shareAlbumLocalFiles, setShareAlbumLocalFiles] = useState([]);
  const [shareAlbumLocalImportEnabled, setShareAlbumLocalImportEnabled] = useState(false);
  const [shareAlbumSubmitting, setShareAlbumSubmitting] = useState(false);
  const [shareAlbumMsg, setShareAlbumMsg] = useState("");
  const [shareAlbumDiagnostics, setShareAlbumDiagnostics] = useState(null);
  const [shareAlbumOpen, setShareAlbumOpen] = useState(false);
  const [shareAlbumChoices, setShareAlbumChoices] = useState([]);
  const [shareAlbumChoicesLoading, setShareAlbumChoicesLoading] = useState(false);
  const [staleGpsPhotosLoading, setStaleGpsPhotosLoading] = useState(false);
  const [staleGpsPhotosRemoving, setStaleGpsPhotosRemoving] = useState(false);
  const [staleGpsPhotosMsg, setStaleGpsPhotosMsg] = useState("");
  const [staleGpsPhotosReport, setStaleGpsPhotosReport] = useState(null);
  const [staleAreaPhotosLoading, setStaleAreaPhotosLoading] = useState(false);
  const [staleAreaPhotosRemoving, setStaleAreaPhotosRemoving] = useState(false);
  const [staleAreaPhotosMsg, setStaleAreaPhotosMsg] = useState("");
  const [staleAreaPhotosReport, setStaleAreaPhotosReport] = useState(null);
  const [yearFilter, setYearFilter] = useState("all");
  const [raceFilter, setRaceFilter] = useState("all");
  const [isMobileToolsHidden, setIsMobileToolsHidden] = useState(false);
  const [toolsVisible, setToolsVisible] = useState(false);
  const [assignedAreaPhotos, setAssignedAreaPhotos] = useState({});
  const [photoAreas, setPhotoAreas] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PHOTO_AREAS;
    try {
      const raw = window.localStorage.getItem(PHOTO_AREA_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const localAreas = Array.isArray(parsed) ? parsed : [];
      const mergedMap = new Map(DEFAULT_PHOTO_AREAS.map((area) => [area.id, area]));
      for (const area of localAreas) {
        if (!area || typeof area !== "object") continue;
        if (!area.id) continue;
        // Local entries should override default definitions by id (bounds/title edits).
        if (mergedMap.has(area.id)) {
          const base = mergedMap.get(area.id) || {};
          mergedMap.set(area.id, {
            ...base,
            ...area,
            bounds: area.bounds || base.bounds,
            center: area.center || base.center,
          });
          continue;
        }
        mergedMap.set(area.id, area);
      }
      return Array.from(mergedMap.values());
    } catch {
      return DEFAULT_PHOTO_AREAS;
    }
  });
  const initialPhotoAreasRef = useRef(photoAreas);
  const didRunPhotoAreaPersistRef = useRef(false);

  useEffect(() => {
    if (!toolPanels.bounds) setPickMode(false);
  }, [toolPanels.bounds]);

  useEffect(() => {
    if (!toolPanels.corner) setCornerPickMode(false);
  }, [toolPanels.corner]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsMobileToolsHidden(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!isMobileToolsHidden) return;
    if (areaVisualMode !== "photo_heatmap") {
      setAreaVisualMode("photo_heatmap");
      setAreaStyleDraft("photo_heatmap");
    }
  }, [isMobileToolsHidden, areaVisualMode]);

  useEffect(() => {
    setAreaStyleDraft(areaVisualMode);
  }, [areaVisualMode]);

  const allAreaRowsBase = [
    {
      ...TURN3_INSIDE_AREA,
      photos: [{ id: "builtin-photo-turn3", src: "/photos/imsa/sebring1.jpg", alt: "Turn 3 Inside" }],
      locked: true,
    },
    ...photoAreas,
  ].map((area) => ({
    ...area,
    photos: (
      Array.isArray(assignedAreaPhotos[area.id]) && assignedAreaPhotos[area.id].length
        ? assignedAreaPhotos[area.id]
        : Array.isArray(area.photos)
          ? area.photos
          : []
    ).map((p) => ({
      ...p,
      year: inferPhotoYear(p) || 2023,
      race: inferPhotoRace(p),
    })),
  }));
  const availableYears = useMemo(() => {
    const years = new Set([2022, 2023]);
    allAreaRowsBase.forEach((area) => {
      area.photos.forEach((photo) => {
        const year = Number(photo?.year);
        if (Number.isInteger(year)) years.add(year);
      });
    });
    pins.forEach((pin) => {
      const year = Number(pin?.year);
      if (Number.isInteger(year)) years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [allAreaRowsBase, pins]);
  const availableRaces = useMemo(() => {
    const races = new Set(["12 Hours of Sebring", "1000 Miles of Sebring"]);
    allAreaRowsBase.forEach((area) => {
      area.photos.forEach((photo) => {
        const race = String(photo?.race || "").trim();
        if (race) races.add(race);
      });
    });
    pins.forEach((pin) => {
      const race = String(pin?.race || "").trim();
      if (race) races.add(race);
    });
    return Array.from(races).sort((a, b) => a.localeCompare(b));
  }, [allAreaRowsBase, pins]);
  const allAreaRows = allAreaRowsBase
    .map((area) => ({
      ...area,
      photos: area.photos
      .filter((p) => {
        const yearOk = yearFilter === "all" ? true : Number(p.year) === Number(yearFilter);
        const raceOk = raceFilter === "all" ? true : String(p.race || "") === raceFilter;
        return yearOk && raceOk;
      }),
    }));
  const maxAreaPhotoCount = useMemo(
    () => Math.max(1, ...allAreaRows.map((area) => (Array.isArray(area.photos) ? area.photos.length : 0))),
    [allAreaRows]
  );
  const visibleGpsPins = useMemo(() => {
    const grouped = new Map();
    for (const pin of pins) {
      if (!Number.isFinite(pin?.lat) || !Number.isFinite(pin?.lng)) continue;
      const yearOk = yearFilter === "all" ? true : Number(pin?.year) === Number(yearFilter);
      const raceOk = raceFilter === "all" ? true : String(pin?.race || "") === raceFilter;
      if (!yearOk || !raceOk) continue;
      const key = `${Number(pin.lat).toFixed(6)}:${Number(pin.lng).toFixed(6)}`;
      const existing = grouped.get(key);
      const photoCount = Number(pin?.photo_count || 0);
      if (existing) {
        existing.photo_count += photoCount;
        if (!existing.cover_thumb_url && pin?.cover_thumb_url) {
          existing.cover_thumb_url = pin.cover_thumb_url;
        }
        existing.pin_ids.push(pin.pin_id);
        continue;
      }
      grouped.set(key, {
        pin_id: `cluster:${key}`,
        pin_ids: [pin.pin_id],
        lat: Number(pin.lat),
        lng: Number(pin.lng),
        title: pin.title || "GPS Photos",
        photo_count: photoCount,
        year: pin?.year ?? null,
        race: pin?.race || null,
        cover_thumb_url: pin.cover_thumb_url || null,
      });
    }
    return Array.from(grouped.values());
  }, [pins, yearFilter, raceFilter]);
  const maxGpsClusterPhotoCount = useMemo(
    () => Math.max(1, ...visibleGpsPins.map((pin) => Number(pin?.photo_count || 0))),
    [visibleGpsPins]
  );

  const closeAreaViewer = () => {
    setAreaViewer({ open: false, areaId: "", title: "", photos: [], index: 0 });
    setAreaViewerMsg("");
  };
  const closeGpsViewer = () => {
    setGpsViewer({ open: false, title: "", photos: [], index: 0, loading: false, error: "" });
  };
  const openAreaViewer = (area) => {
    const photos = (Array.isArray(area.photos) ? area.photos : [])
      .map((p, i) => ({
        id: p.id || `${area.id}:${i}`,
        name: p.name || area.title,
        fullUrl: p.fullUrl || p.src,
        thumbUrl: p.thumbUrl || p.fullUrl || p.src,
        alt: p.alt || p.name || area.title,
      }))
      .filter((p) => !!p.fullUrl);
    if (!photos.length) return;
    setAreaViewer({ open: true, areaId: area.id, title: area.title, photos, index: 0 });
    setAreaViewerMsg("");
  };
  const openGpsViewer = async (pin) => {
    setGpsViewer({
      open: true,
      title: Number(pin?.photo_count || 0) > 1 ? "GPS Photo Cluster" : pin?.title || "GPS Photo",
      photos: [],
      index: 0,
      loading: true,
      error: "",
    });
    try {
      const pinIds = Array.isArray(pin?.pin_ids) && pin.pin_ids.length ? pin.pin_ids : [pin?.pin_id].filter(Boolean);
      const responses = await Promise.all(
        pinIds.map(async (pinId) => {
          const res = await fetch(`/api/pins/${encodeURIComponent(pinId)}/assets`, { cache: "no-store" });
          if (!res.ok) throw new Error(`Assets HTTP ${res.status}`);
          const payload = await res.json();
          return Array.isArray(payload?.assets) ? payload.assets : [];
        })
      );
      const photos = responses
        .flat()
        .map((asset, i) => ({
          id: asset.asset_id || `${pin.pin_id}:${i}`,
          name: asset.alt_text_snapshot || pin?.title || "GPS Photo",
          fullUrl: asset.full_url,
          thumbUrl: asset.thumb_url || asset.full_url,
          alt: asset.alt_text_snapshot || pin?.title || "GPS Photo",
          captureTime: asset.capture_time || "",
        }))
        .filter((photo) => !!photo.fullUrl)
        .sort((a, b) => String(a.captureTime || "").localeCompare(String(b.captureTime || "")));
      setGpsViewer({
        open: true,
        title: Number(pin?.photo_count || 0) > 1 ? "GPS Photo Cluster" : pin?.title || "GPS Photo",
        photos,
        index: 0,
        loading: false,
        error: "",
      });
    } catch (error) {
      setGpsViewer({
        open: true,
        title: Number(pin?.photo_count || 0) > 1 ? "GPS Photo Cluster" : pin?.title || "GPS Photo",
        photos: [],
        index: 0,
        loading: false,
        error: String(error?.message || error),
      });
    }
  };
  const nextAreaPhoto = () =>
    setAreaViewer((v) => ({
      ...v,
      index: v.photos.length ? (v.index + 1) % v.photos.length : 0,
    }));
  const prevAreaPhoto = () =>
    setAreaViewer((v) => ({
      ...v,
      index: v.photos.length ? (v.index - 1 + v.photos.length) % v.photos.length : 0,
    }));
  const nextGpsPhoto = () =>
    setGpsViewer((v) => ({
      ...v,
      index: v.photos.length ? (v.index + 1) % v.photos.length : 0,
    }));
  const prevGpsPhoto = () =>
    setGpsViewer((v) => ({
      ...v,
      index: v.photos.length ? (v.index - 1 + v.photos.length) % v.photos.length : 0,
    }));
  const removeCurrentAreaPhoto = async () => {
    const current = areaViewer.photos[areaViewer.index];
    if (!current || String(current.id || "").startsWith("builtin-")) return;
    setRemovingAreaPhoto(true);
    setAreaViewerMsg("");
    try {
      const res = await fetch("/api/photo-area-assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: "sebring",
          areaId: areaViewer.areaId,
          assetId: current.id,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);

      setAssignedAreaPhotos((prev) => {
        const next = { ...prev };
        next[areaViewer.areaId] = (next[areaViewer.areaId] || []).filter((p) => p.id !== current.id);
        return next;
      });
      setAreaViewer((v) => {
        const photos = v.photos.filter((p) => p.id !== current.id);
        if (!photos.length) return { open: false, areaId: "", title: "", photos: [], index: 0 };
        return { ...v, photos, index: Math.min(v.index, photos.length - 1) };
      });
      setAreaViewerMsg("Removed");
    } catch (e) {
      setAreaViewerMsg(`Remove failed: ${String(e?.message || e)}`);
    } finally {
      setRemovingAreaPhoto(false);
    }
  };

  const createPhotoAreaFromBounds = () => {
    if (!bounds) return;
    const title = (photoAreaName || "").trim() || `Photo area ${photoAreas.length + 1}`;
    const north = Number(bounds.north.toFixed(6));
    const south = Number(bounds.south.toFixed(6));
    const east = Number(bounds.east.toFixed(6));
    const west = Number(bounds.west.toFixed(6));
    const center = [
      Number(((north + south) / 2).toFixed(6)),
      Number(((east + west) / 2).toFixed(6)),
    ];
    const next = {
      id: `area-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      bounds: { north, south, east, west },
      center,
      photos: [],
    };
    setPhotoAreas((prev) => [...prev, next]);
    setEditingAreaId(next.id);
    setPhotoAreaMsg(`Created: ${title}`);
  };

  const deletePhotoArea = (id) => {
    setPhotoAreas((prev) => prev.filter((a) => a.id !== id));
    if (editingAreaId === id) setEditingAreaId("");
    setPhotoAreaMsg("Area deleted");
  };

  const loadAreaForEditing = (id) => {
    const area = photoAreas.find((a) => a.id === id);
    if (!area?.bounds) {
      setPhotoAreaMsg("Selected area not found");
      return;
    }
    setEditingAreaId(id);
    setPhotoAreaName(area.title || "Photo area");
    setBounds({
      north: Number(area.bounds.north),
      south: Number(area.bounds.south),
      east: Number(area.bounds.east),
      west: Number(area.bounds.west),
    });
    setPickMode(true);
    setPhotoAreaMsg(`Loaded: ${area.title}`);
  };

  const updatePhotoAreaFromBounds = () => {
    if (!bounds || !editingAreaId) {
      setPhotoAreaMsg("Select an area and draw or load bounds first");
      return;
    }
    const north = Number(bounds.north.toFixed(6));
    const south = Number(bounds.south.toFixed(6));
    const east = Number(bounds.east.toFixed(6));
    const west = Number(bounds.west.toFixed(6));
    const center = [
      Number(((north + south) / 2).toFixed(6)),
      Number(((east + west) / 2).toFixed(6)),
    ];
    const nextTitle = (photoAreaName || "").trim();
    let updated = false;
    setPhotoAreas((prev) =>
      prev.map((a) => {
        if (a.id !== editingAreaId) return a;
        updated = true;
        return {
          ...a,
          title: nextTitle || a.title,
          bounds: { north, south, east, west },
          center,
        };
      })
    );
    setPhotoAreaMsg(updated ? "Area bounds updated" : "Selected area not found");
  };

  const copyPhotoAreaJson = async () => {
    if (!bounds) {
      setPhotoAreaMsg("Draw bounds first to copy current area JSON");
      return;
    }
    const title = (photoAreaName || "").trim() || "New photo area";
    const north = Number(bounds.north.toFixed(6));
    const south = Number(bounds.south.toFixed(6));
    const east = Number(bounds.east.toFixed(6));
    const west = Number(bounds.west.toFixed(6));
    const center = [
      Number(((north + south) / 2).toFixed(6)),
      Number(((east + west) / 2).toFixed(6)),
    ];
    const payload = [
      {
        id: `area-${Date.now()}-draft`,
        title,
        bounds: { north, south, east, west },
        center,
        photos: [],
      },
    ];
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setPhotoAreaCopied(true);
      setTimeout(() => setPhotoAreaCopied(false), 1200);
    } catch {
      setPhotoAreaCopied(false);
    }
  };

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
      const res = await fetch("/api/tracks/sebring/pins", { cache: "no-store" });
      if (!res.ok) throw new Error(`Pins HTTP ${res.status}`);
      const payload = await res.json();
      setPinsCount(Array.isArray(payload?.pins) ? payload.pins.length : 0);
    } catch {
      // ignore pins count failures in tools panel
    }
  };

  const loadPins = async () => {
    try {
      const res = await fetch("/api/tracks/sebring/pins", { cache: "no-store" });
      if (!res.ok) throw new Error(`Pins HTTP ${res.status}`);
      const payload = await res.json();
      const nextPins = Array.isArray(payload?.pins) ? payload.pins : [];
      setPins(nextPins);
      setPinsCount(nextPins.length);
    } catch {
      setPins([]);
    }
  };

  const loadAssignedAreaPhotos = async () => {
    try {
      const res = await fetch("/api/photo-areas?trackId=sebring", { cache: "no-store" });
      if (!res.ok) throw new Error(`Areas HTTP ${res.status}`);
      const payload = await res.json();
      const list = Array.isArray(payload?.areas) ? payload.areas : [];
      const byArea = {};
      for (const area of list) {
        byArea[area.id] = Array.isArray(area.photos) ? area.photos : [];
      }
      setAssignedAreaPhotos(byArea);
    } catch {
      setAssignedAreaPhotos({});
    }
  };

  const checkStaleAreaPhotos = async () => {
    setStaleAreaPhotosLoading(true);
    setStaleAreaPhotosMsg("");
    try {
      const res = await fetch("/api/photo-areas/stale?trackId=sebring", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      const staleRows = Array.isArray(payload?.staleRows) ? payload.staleRows : [];
      setStaleAreaPhotosReport({
        staleCount: Number(payload?.staleCount || staleRows.length || 0),
        staleRows,
      });
      setStaleAreaPhotosMsg(
        staleRows.length
          ? `Found ${staleRows.length} stale area photo${staleRows.length === 1 ? "" : "s"}.`
          : "No stale area photos found."
      );
    } catch (e) {
      setStaleAreaPhotosMsg(`Stale check failed: ${String(e?.message || e)}`);
      setStaleAreaPhotosReport(null);
    } finally {
      setStaleAreaPhotosLoading(false);
    }
  };

  const checkStaleGpsPhotos = async () => {
    setStaleGpsPhotosLoading(true);
    setStaleGpsPhotosMsg("");
    try {
      const res = await fetch("/api/tracks/sebring/pins/stale", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      const staleRows = Array.isArray(payload?.staleRows) ? payload.staleRows : [];
      setStaleGpsPhotosReport({
        staleAssetCount: Number(payload?.staleAssetCount || staleRows.length || 0),
        stalePinCount: Number(payload?.stalePinCount || 0),
        staleRows,
      });
      setStaleGpsPhotosMsg(
        staleRows.length
          ? `Found ${staleRows.length} stale GPS photo${staleRows.length === 1 ? "" : "s"} across ${Number(payload?.stalePinCount || 0)} pin${Number(payload?.stalePinCount || 0) === 1 ? "" : "s"}.`
          : "No stale GPS photos found."
      );
    } catch (e) {
      setStaleGpsPhotosMsg(`GPS stale check failed: ${String(e?.message || e)}`);
      setStaleGpsPhotosReport(null);
    } finally {
      setStaleGpsPhotosLoading(false);
    }
  };

  const removeStaleGpsPhotos = async () => {
    setStaleGpsPhotosRemoving(true);
    setStaleGpsPhotosMsg("");
    try {
      const res = await fetch("/api/tracks/sebring/pins/stale", {
        method: "DELETE",
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      await loadPins();
      setStaleGpsPhotosReport({
        staleAssetCount: 0,
        stalePinCount: 0,
        staleRows: [],
      });
      setStaleGpsPhotosMsg(
        `Removed ${Number(payload?.removedAssetCount || 0)} stale GPS photo${Number(payload?.removedAssetCount || 0) === 1 ? "" : "s"} and ${Number(payload?.removedPinCount || 0)} empty pin${Number(payload?.removedPinCount || 0) === 1 ? "" : "s"}.`
      );
    } catch (e) {
      setStaleGpsPhotosMsg(`GPS stale cleanup failed: ${String(e?.message || e)}`);
    } finally {
      setStaleGpsPhotosRemoving(false);
    }
  };

  const removeStaleAreaPhotos = async () => {
    setStaleAreaPhotosRemoving(true);
    setStaleAreaPhotosMsg("");
    try {
      const res = await fetch("/api/photo-areas/stale", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: "sebring" }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      await loadAssignedAreaPhotos();
      const removedCount = Number(payload?.removedCount || 0);
      setStaleAreaPhotosReport({
        staleCount: 0,
        staleRows: [],
      });
      setStaleAreaPhotosMsg(`Removed ${removedCount} stale area photo${removedCount === 1 ? "" : "s"}.`);
    } catch (e) {
      setStaleAreaPhotosMsg(`Stale cleanup failed: ${String(e?.message || e)}`);
    } finally {
      setStaleAreaPhotosRemoving(false);
    }
  };

  const saveCornersToCloud = async (cornersToSave) => {
    const cleaned = normalizeCornerMap(cornersToSave);
    if (!Object.keys(cleaned).length) return;
    const res = await fetch("/api/track-corners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: "sebring", corners: cleaned }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload?.error || `HTTP ${res.status}`);
    }
  };

  const loadCornersFromCloud = async () => {
    const res = await fetch("/api/track-corners?trackId=sebring", { cache: "no-store" });
    if (!res.ok) throw new Error(`Corners HTTP ${res.status}`);
    const payload = await res.json();
    return normalizeCornerMap(payload?.corners);
  };

  const savePhotoAreasToCloud = async (areasToSave) => {
    const cleaned = (Array.isArray(areasToSave) ? areasToSave : [])
      .map((a) => normalizePhotoArea(a))
      .filter(Boolean);
    if (!cleaned.length) return;
    const res = await fetch("/api/photo-areas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: "sebring", areas: cleaned }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload?.error || `HTTP ${res.status}`);
    }
  };

  const loadPhotoAreasFromCloud = async () => {
    const res = await fetch("/api/photo-areas?trackId=sebring", { cache: "no-store" });
    if (!res.ok) throw new Error(`Areas HTTP ${res.status}`);
    const payload = await res.json();
    return (Array.isArray(payload?.areas) ? payload.areas : [])
      .map((a) => normalizePhotoArea(a))
      .filter(Boolean);
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
      await loadPins();
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
      await loadPins();
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
      await loadPins();
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
    try {
      window.localStorage.setItem(PHOTO_AREA_STORAGE_KEY, JSON.stringify(photoAreas));
    } catch {
      // ignore storage write failures
    }
  }, [photoAreas]);

  useEffect(() => {
    if (!editingAreaId) return;
    if (!photoAreas.some((a) => a.id === editingAreaId)) {
      setEditingAreaId("");
    }
  }, [photoAreas, editingAreaId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AREA_STYLE_STORAGE_KEY, areaVisualMode);
    } catch {
      // ignore storage write failures
    }
  }, [areaVisualMode]);

  useEffect(() => {
    if (!areaViewer.open) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeAreaViewer();
      if (e.key === "ArrowLeft") prevAreaPhoto();
      if (e.key === "ArrowRight") nextAreaPhoto();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [areaViewer.open]);

  useEffect(() => {
    loadAssignedAreaPhotos();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncCorners = async () => {
      try {
        const remoteCorners = await loadCornersFromCloud();
        if (cancelled) return;

        const localRaw = window.localStorage.getItem(CORNER_STORAGE_KEY);
        const hasLocalSnapshot = !!localRaw;
        const localCorners = normalizeCornerMap(initialCornersRef.current);

        if (hasCornerData(remoteCorners)) {
          if (!cancelled) setCorners((prev) => ({ ...prev, ...remoteCorners }));
          return;
        }

        if (hasLocalSnapshot && hasCornerData(localCorners)) {
          await saveCornersToCloud(localCorners);
        }
      } catch {
        // keep local/default fallback
      }
    };

    syncCorners();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!didRunCornerPersistRef.current) {
      didRunCornerPersistRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      saveCornersToCloud(corners).catch(() => {
        // keep local storage fallback if cloud persistence fails
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [corners]);

  useEffect(() => {
    let cancelled = false;

    const syncPhotoAreas = async () => {
      try {
        const remoteAreas = await loadPhotoAreasFromCloud();
        if (cancelled || !remoteAreas.length) return;

        const localRaw = window.localStorage.getItem(PHOTO_AREA_STORAGE_KEY);
        const hasLocalSnapshot = !!localRaw;
        const localAreas = (Array.isArray(initialPhotoAreasRef.current) ? initialPhotoAreasRef.current : [])
          .map((a) => normalizePhotoArea(a))
          .filter(Boolean);
        const remoteIds = new Set(remoteAreas.map((a) => a.id));
        const localHasExtraIds = localAreas.some((a) => !remoteIds.has(a.id));

        if (hasLocalSnapshot && localHasExtraIds) {
          await savePhotoAreasToCloud(localAreas);
          if (!cancelled) setPhotoAreaMsg("Synced local area definitions");
          return;
        }

        if (!cancelled) setPhotoAreas(remoteAreas);
      } catch {
        // ignore area sync failures and keep local/default fallback
      }
    };

    syncPhotoAreas();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!didRunPhotoAreaPersistRef.current) {
      didRunPhotoAreaPersistRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      savePhotoAreasToCloud(photoAreas).catch(() => {
        // keep local storage fallback if cloud persistence fails
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [photoAreas]);

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
    loadPins();
    loadAuthStatus();
  }, []);

  useEffect(() => {
    if (!shareAlbumOpen || !shareAlbumSeries) return;
    let cancelled = false;
    setShareAlbumChoicesLoading(true);
    fetch(`/api/shared-albums/${encodeURIComponent(shareAlbumSeries)}?t=${Date.now()}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((payload) => {
        if (cancelled) return;
        setShareAlbumChoices(Array.isArray(payload?.albums) ? payload.albums : []);
      })
      .catch(() => {
        if (cancelled) return;
        setShareAlbumChoices([]);
      })
      .finally(() => {
        if (!cancelled) setShareAlbumChoicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareAlbumOpen, shareAlbumSeries]);

  const submitSharePhoto = async () => {
    const trimmedShortLink = (shareShortLink || "").trim();
    const trimmedAreaId = (shareAreaId || "").trim();
    const trimmedLat = (shareLat || "").trim();
    const trimmedLng = (shareLng || "").trim();
    const hasLat = trimmedLat.length > 0;
    const hasLng = trimmedLng.length > 0;

    if (!trimmedShortLink) {
      setShareMsg("Lightroom shared short link is required.");
      return;
    }
    if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
      setShareMsg("Provide both Latitude and Longitude, or leave both blank.");
      return;
    }
    if (!hasLat && !hasLng && !trimmedAreaId) {
      setShareMsg("Photo area is required when no location is provided.");
      return;
    }

    setShareSubmitting(true);
    setShareMsg("");
    try {
      const res = await fetch("/api/share-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortLink: trimmedShortLink,
          year: shareYear ? Number(shareYear) : undefined,
          race: shareRace || undefined,
          captureTime: shareDateTime || undefined,
          lat: hasLat ? Number(trimmedLat) : undefined,
          lng: hasLng ? Number(trimmedLng) : undefined,
          areaId: trimmedAreaId || undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);

      await Promise.all([loadPins(), loadAssignedAreaPhotos()]);
      setShareMsg("Shared photo added.");
      setShareShortLink("");
      setShareYear("2023");
      setShareRace("12 Hours of Sebring");
      setShareDateTime("");
      setShareLat("");
      setShareLng("");
      setShareOpen(false);
    } catch (e) {
      setShareMsg(`Share failed: ${String(e?.message || e)}`);
    } finally {
      setShareSubmitting(false);
    }
  };

  const submitShareAlbum = async () => {
    const trimmedShortLink = (shareAlbumShortLink || "").trim();
    const trimmedAreaId = (shareAlbumAreaId || "").trim();
    const trimmedSeries = (shareAlbumSeries || "").trim();
    const trimmedSlug = (shareAlbumSlug || "").trim();
    const trimmedRace = (shareAlbumRace || "").trim();
    const trimmedYear = (shareAlbumYear || "").trim();
    const selectedLocalFiles = Array.isArray(shareAlbumLocalFiles) ? shareAlbumLocalFiles : [];

    if (!trimmedShortLink) {
      setShareAlbumMsg("Lightroom shared album short link is required.");
      return;
    }
    if (!trimmedSeries) {
      setShareAlbumMsg("Series is required.");
      return;
    }
    if (!trimmedSlug) {
      setShareAlbumMsg("Album slug is required. Pick an existing album or enter a slug for a new one.");
      return;
    }
    if (trimmedSlug === "shared-album") {
      setShareAlbumMsg("Album slug cannot be shared-album. Enter a real slug for the album.");
      return;
    }
    if (!trimmedYear || !/^\d{4}$/.test(trimmedYear)) {
      setShareAlbumMsg("Year must be a 4-digit number.");
      return;
    }
    if (!trimmedRace) {
      setShareAlbumMsg("Race is required.");
      return;
    }

    setShareAlbumSubmitting(true);
    setShareAlbumMsg("");
    setShareAlbumDiagnostics(null);
    try {
      const res = await fetch("/api/share-album", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortLink: trimmedShortLink,
          series: trimmedSeries,
          slug: trimmedSlug || undefined,
          year: Number(trimmedYear),
          race: trimmedRace,
          areaId: trimmedAreaId,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);

      let localGpsSummary = null;
      let localGpsPrep = null;
      if (shareAlbumLocalImportEnabled && selectedLocalFiles.length) {
        const localMetadata = [];
        let unsupportedCount = 0;
        let missingGpsCount = 0;
        for (const file of selectedLocalFiles) {
          const metadata = await readBrowserPhotoMetadata(file);
          if (metadata?.unsupported) {
            unsupportedCount += 1;
            continue;
          }
          if (!metadata?.gps) {
            missingGpsCount += 1;
          }
          localMetadata.push(metadata);
        }
        localGpsPrep = {
          selectedFileCount: selectedLocalFiles.length,
          supportedFileCount: localMetadata.length,
          unsupportedFileCount: unsupportedCount,
          gpsReadableFileCount: localMetadata.filter((item) => item?.gps).length,
          missingGpsFileCount: missingGpsCount,
        };
        if (!localMetadata.length) {
          throw new Error("No supported JPG files were found in the selected export folder.");
        }
        if (Number(localGpsPrep.gpsReadableFileCount || 0) > 0) {
          const gpsRes = await fetch("/api/share-album/local-gps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              series: trimmedSeries,
              slug: payload?.album_slug || trimmedSlug,
              localFiles: localMetadata,
              dryRun: false,
            }),
          });
          localGpsSummary = await gpsRes.json();
          if (!gpsRes.ok) throw new Error(localGpsSummary?.error || `Local GPS import failed: HTTP ${gpsRes.status}`);
        } else {
          const uploadBody = new FormData();
          uploadBody.set("series", trimmedSeries);
          uploadBody.set("slug", payload?.album_slug || trimmedSlug);
          uploadBody.set("dryRun", "false");
          for (const file of selectedLocalFiles) {
            uploadBody.append("files", file, file.name);
          }
          const gpsRes = await fetch("/api/share-album/local-gps-upload", {
            method: "POST",
            body: uploadBody,
          });
          localGpsSummary = await gpsRes.json();
          if (!gpsRes.ok) throw new Error(localGpsSummary?.error || `Local GPS upload import failed: HTTP ${gpsRes.status}`);
        }
      }

      await Promise.all([loadPins(), loadAssignedAreaPhotos()]);
      const importedCount = Number(payload?.imported_count || 0);
      const pinnedCount = Number(payload?.pinned_count || 0);
      const gpsFeedCount = Number(payload?.gps_found_in_feed_count || 0);
      const gpsDetailCount = Number(payload?.gps_found_in_detail_count || 0);
      const gpsMissingCount = Number(payload?.gps_missing_count || 0);
      const missingSamples = Array.isArray(payload?.gps_missing_samples) ? payload.gps_missing_samples : [];
      const missingDiagnostics = Array.isArray(payload?.gps_missing_diagnostics) ? payload.gps_missing_diagnostics : [];
      const sampleText = missingSamples.length
        ? ` Missing GPS sample: ${missingSamples
            .slice(0, 3)
            .map((item) => item?.file_name || item?.asset_id || "unknown")
            .filter(Boolean)
            .join(", ")}.`
        : "";
      const diagnosticText = missingDiagnostics.length ? " GPS diagnostics captured for sample assets." : "";
      const localGpsPrepText = localGpsPrep
        ? ` Browser scan found GPS in ${Number(localGpsPrep?.gpsReadableFileCount || 0)} of ${Number(localGpsPrep?.selectedFileCount || 0)} selected files; skipped ${Number(localGpsPrep?.unsupportedFileCount || 0)} unsupported and ${Number(localGpsPrep?.missingGpsFileCount || 0)} without readable GPS.`
        : "";
      const localGpsText = localGpsSummary
        ? ` Local GPS import pinned ${Number(localGpsSummary?.pinnedCount || 0)} of ${Number(localGpsSummary?.localGpsFileCount || 0)} GPS-tagged local JPGs via ${localGpsSummary?.metadataSource || "browser"}.`
        : "";
      setShareAlbumMsg(
        `Imported ${importedCount} album photos. Pinned ${pinnedCount}. GPS in feed ${gpsFeedCount}, GPS in detail ${gpsDetailCount}, missing GPS ${gpsMissingCount}.${sampleText}${diagnosticText}${localGpsPrepText}${localGpsText}`
      );
      setShareAlbumDiagnostics({
        feedResourceCount: Number(payload?.feed_resource_count || 0),
        normalizedAssetCount: Number(payload?.normalized_asset_count || 0),
        uniqueAssetIdCount: Number(payload?.unique_asset_id_count || 0),
        duplicateAssetIdCount: Number(payload?.duplicate_asset_id_count || 0),
        duplicateAssetSamples: Array.isArray(payload?.duplicate_asset_samples) ? payload.duplicate_asset_samples : [],
        storedAssetCount: Number(payload?.stored_asset_count || 0),
        attemptedStoredAssetCount: Number(payload?.attempted_stored_asset_count || 0),
        committedStoredAssetCount: Number(payload?.committed_stored_asset_count || 0),
        committedAlbumCreatedAt: payload?.committed_album_created_at || null,
        committedAlbumUpdatedAt: payload?.committed_album_updated_at || null,
        committedAlbumRows: Array.isArray(payload?.committed_album_rows) ? payload.committed_album_rows : [],
        albumSlug: payload?.album_slug || null,
        matchedExistingAlbumKey: payload?.matched_existing_album_key || null,
        sourceAlbumId: payload?.source_album_id || null,
        staleAlbumRowCountRemoved: Number(payload?.stale_album_row_count_removed || 0),
        dbSource: payload?.db_source || null,
        dbHost: payload?.db_host || null,
        dbName: payload?.db_name || null,
        dbUser: payload?.db_user || null,
        dbFingerprint: payload?.db_fingerprint || null,
        missingRenditionsCount: Number(payload?.missing_renditions_count || 0),
        missingRenditionSamples: Array.isArray(payload?.missing_rendition_samples) ? payload.missing_rendition_samples : [],
        gpsMissingDiagnostics: missingDiagnostics,
        localGpsPrep,
        localGpsImport: localGpsSummary,
      });
      setShareAlbumShortLink("");
      setShareAlbumExistingSlug("");
      setShareAlbumSlug("");
      setShareAlbumYear("2023");
      setShareAlbumRace("12 Hours of Sebring");
      setShareAlbumAreaId("");
      setShareAlbumLocalFiles([]);
      setShareAlbumLocalImportEnabled(false);
    } catch (e) {
      setShareAlbumMsg(`Share failed: ${String(e?.message || e)}`);
      setShareAlbumDiagnostics(null);
    } finally {
      setShareAlbumSubmitting(false);
    }
  };


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

  const currentAreaViewerPhoto =
    areaViewer.open && areaViewer.photos.length ? areaViewer.photos[areaViewer.index] : null;

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        position: "relative",
        background:
          "radial-gradient(1200px 700px at 8% 8%, rgba(54,109,255,0.2), transparent 55%), radial-gradient(900px 600px at 88% 10%, rgba(0,200,210,0.14), transparent 55%), linear-gradient(160deg, #04070e 0%, #091322 45%, #05080f 100%)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to right, rgba(127,167,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(127,167,255,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          opacity: 0.18,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          zIndex: 10000,
          top: 12,
          left: 64,
          background: "linear-gradient(145deg, rgba(9,18,32,0.92), rgba(8,14,26,0.78))",
          border: "1px solid rgba(137, 179, 255, 0.35)",
          borderRadius: 12,
          boxShadow: "0 14px 32px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.04)",
          backdropFilter: "blur(8px)",
          padding: "8px 10px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          maxWidth: "calc(100vw - 24px)",
        }}
      >
        <Link href="/" style={{ color: "#ecf3ff", textDecoration: "none", fontSize: 12, fontWeight: 700, letterSpacing: 0.4 }}>
          Home
        </Link>
        <a href="/imsa" style={{ color: "#c9d7ef", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>
          IMSA
        </a>
        <a href="/f1" style={{ color: "#c9d7ef", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>
          F1
        </a>
        <details style={{ position: "relative" }}>
          <summary style={{ cursor: "pointer", color: "#c9d7ef", listStyle: "none", fontSize: 12, fontWeight: 600 }}>
            Maps
          </summary>
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              minWidth: 240,
              background: "#0f1724",
              border: "1px solid #22304a",
              borderRadius: 10,
              padding: "8px 0",
              boxShadow: "0 12px 28px rgba(0,0,0,0.5)",
            }}
          >
            <a
              style={{ display: "block", color: "#dfe8ff", textDecoration: "none", padding: "10px 12px", letterSpacing: 0.3, fontSize: 13 }}
              href="/sebring-map"
            >
              Sebring International Raceway
            </a>
            <a
              style={{ display: "block", color: "#dfe8ff", textDecoration: "none", padding: "10px 12px", letterSpacing: 0.3, fontSize: 13 }}
              href="/daniels-park"
            >
              Daniels Park
            </a>
          </div>
        </details>
      </div>
      <div
        className="sebringTitleCard"
        style={{
          position: "absolute",
          zIndex: 9999,
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          background: "linear-gradient(145deg, rgba(9,18,32,0.92), rgba(8,14,26,0.78))",
          color: "#ecf3ff",
          border: "1px solid rgba(137, 179, 255, 0.35)",
          borderRadius: 14,
          boxShadow: "0 14px 38px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.04)",
          backdropFilter: "blur(8px)",
          padding: "clamp(6px, 1vw, 9px) clamp(12px, 2vw, 16px)",
          fontSize: "clamp(15px, 3.2vw, 22px)",
          fontWeight: 800,
          letterSpacing: "clamp(0.15px, 0.08vw, 0.45px)",
          lineHeight: 1.05,
          textAlign: "center",
          whiteSpace: "normal",
          maxWidth: "calc(100vw - 24px)",
        }}
      >
        <div>Sebring International Raceway</div>
      </div>
      <div
        style={{
          position: "absolute",
          zIndex: 10000,
          top: 112,
          left: 12,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 8,
          maxWidth: "min(220px, calc(100vw - 24px))",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            background: "rgba(8,14,26,0.86)",
            border: "1px solid rgba(137, 179, 255, 0.32)",
            borderRadius: 12,
            padding: "6px 10px",
          }}
        >
          <span style={{ color: "#c7d6ef", fontSize: 11, fontWeight: 700, letterSpacing: 0.2, flexShrink: 0 }}>Year</span>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            style={{
              background: "#101827",
              border: "1px solid #2a3a57",
              color: "#fff",
              borderRadius: 999,
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 700,
              minWidth: 0,
              width: 112,
            }}
          >
            <option value="all">All</option>
            {availableYears.map((year) => (
              <option key={`filter-year-${year}`} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            background: "rgba(8,14,26,0.86)",
            border: "1px solid rgba(137, 179, 255, 0.32)",
            borderRadius: 12,
            padding: "6px 10px",
          }}
        >
          <span style={{ color: "#c7d6ef", fontSize: 11, fontWeight: 700, letterSpacing: 0.2, flexShrink: 0 }}>Race</span>
          <select
            value={raceFilter}
            onChange={(e) => setRaceFilter(e.target.value)}
            style={{
              background: "#101827",
              border: "1px solid #2a3a57",
              color: "#fff",
              borderRadius: 999,
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 700,
              minWidth: 0,
              width: 112,
            }}
          >
            <option value="all">All</option>
            {availableRaces.map((race) => (
              <option key={`filter-race-${race}`} value={race}>
                {race}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          zIndex: 10000,
          top: 12,
          right: 12,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          justifyContent: "flex-end",
          background: "rgba(8,14,26,0.86)",
          border: "1px solid rgba(137, 179, 255, 0.32)",
          borderRadius: 999,
          padding: "6px 12px",
          maxWidth: "min(360px, calc(100vw - 24px))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#dfe8ff", fontSize: 11, fontWeight: 700 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: "rgb(210, 40, 40)",
              boxShadow: "0 0 0 6px rgba(210, 40, 40, 0.18)",
              display: "inline-block",
            }}
          />
          Photo Areas
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#dfe8ff", fontSize: 11, fontWeight: 700 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: "#ffd84d",
              boxShadow: "0 0 0 6px rgba(255, 216, 77, 0.2)",
              display: "inline-block",
            }}
          />
          Geo Located
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          zIndex: 10000,
          top: 60,
          right: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "flex-end",
          maxWidth: "min(360px, calc(100vw - 24px))",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setShareOpen(true);
            setShareMsg("");
          }}
          style={{
            background: "linear-gradient(150deg, #ff6a2e, #ff3d00)",
            border: "1px solid #ffb18f",
            color: "#fff",
            padding: "7px 10px",
            borderRadius: 999,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.25,
            boxShadow: "0 8px 18px rgba(255, 77, 20, 0.35), inset 0 0 0 1px rgba(255,255,255,0.16)",
            textTransform: "uppercase",
          }}
        >
          Share Photo
        </button>
        <button
          type="button"
          onClick={() => {
            setShareAlbumOpen(true);
            setShareAlbumMsg("");
            setShareAlbumDiagnostics(null);
          }}
          style={{
            background: "linear-gradient(150deg, #ff6a2e, #ff3d00)",
            border: "1px solid #ffb18f",
            color: "#fff",
            padding: "7px 10px",
            borderRadius: 999,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.25,
            boxShadow: "0 8px 18px rgba(255, 77, 20, 0.35), inset 0 0 0 1px rgba(255,255,255,0.16)",
            textTransform: "uppercase",
          }}
        >
          Share Album
        </button>
      </div>

      <div style={{ position: "relative", height: "100%", width: "100%" }}>
      {err ? (
        <div style={{ position: "absolute", zIndex: 9999, background: "#101827", color: "#fff", padding: 12, borderRadius: 8, border: "1px solid #2a3a57" }}>
          GeoJSON load failed: {err}
        </div>
      ) : null}

      {!isMobileToolsHidden ? (
        <>
          <div
            style={{
              position: "absolute",
              zIndex: 10000,
              bottom: 34,
              right: 12,
            }}
          >
            <button
              type="button"
              onClick={() => setToolsVisible((v) => !v)}
              style={{
                background: "linear-gradient(150deg, #17335e, #123058)",
                border: "1px solid #75b7ff",
                color: "#fff",
                padding: "8px 10px",
                borderRadius: 10,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.2,
              }}
            >
              Track Tools: {toolsVisible ? "On" : "Off"}
            </button>
          </div>
          {toolsVisible ? (
            <div
              style={{
                position: "absolute",
                zIndex: 9999,
                bottom: 78,
                right: 12,
                background: "linear-gradient(165deg, rgba(8,15,27,0.95), rgba(7,12,21,0.88))",
                color: "#f4f8ff",
                padding: "12px 12px",
                borderRadius: 14,
                fontSize: 12,
                border: "1px solid rgba(120, 170, 255, 0.36)",
                boxShadow: "0 18px 36px rgba(0,0,0,0.42), inset 0 0 0 1px rgba(255,255,255,0.04)",
                backdropFilter: "blur(10px)",
                width: "min(340px, calc(100vw - 24px))",
                maxHeight: "calc(100vh - 136px)",
                overflowY: "auto",
              }}
            >
        <div style={{ fontWeight: 800, marginBottom: 2, letterSpacing: 0.4 }}>Track Tools</div>
        <div style={{ color: "#91a6cb", fontSize: 11, marginBottom: 8 }}>Toggle sections on demand</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {[
            ["lightroom", "Lightroom"],
            ["bounds", "Bounds"],
            ["areaStyle", "Area Style"],
            ["areas", "Areas"],
            ["corner", "Corner"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setToolPanels((prev) => ({ ...prev, [key]: !prev[key] }))}
              style={{
                background: toolPanels[key] ? "linear-gradient(150deg, #17335e, #123058)" : "rgba(11,20,34,0.9)",
                border: toolPanels[key] ? "1px solid #75b7ff" : "1px solid #2d476e",
                color: "#fff",
                padding: "5px 8px",
                borderRadius: 999,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.25,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {toolPanels.lightroom ? (
          <>
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
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={checkStaleGpsPhotos}
                disabled={staleGpsPhotosLoading || staleGpsPhotosRemoving}
                style={{
                  flex: 1,
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  padding: "6px 8px",
                  borderRadius: 8,
                  cursor: staleGpsPhotosLoading || staleGpsPhotosRemoving ? "default" : "pointer",
                  fontSize: 12,
                  opacity: staleGpsPhotosLoading || staleGpsPhotosRemoving ? 0.65 : 1,
                }}
              >
                {staleGpsPhotosLoading ? "Checking..." : "Check stale GPS photos"}
              </button>
              <button
                type="button"
                onClick={removeStaleGpsPhotos}
                disabled={staleGpsPhotosRemoving || !Number(staleGpsPhotosReport?.staleAssetCount || 0)}
                style={{
                  flex: 1,
                  background: "#15233a",
                  border: "1px solid #325080",
                  color: "#fff",
                  padding: "6px 8px",
                  borderRadius: 8,
                  cursor: staleGpsPhotosRemoving || !Number(staleGpsPhotosReport?.staleAssetCount || 0) ? "default" : "pointer",
                  fontSize: 12,
                  opacity: staleGpsPhotosRemoving || !Number(staleGpsPhotosReport?.staleAssetCount || 0) ? 0.65 : 1,
                }}
              >
                {staleGpsPhotosRemoving ? "Removing..." : "Remove stale GPS"}
              </button>
            </div>
            {staleGpsPhotosMsg ? (
              <div style={{ marginTop: 6, color: staleGpsPhotosMsg.startsWith("GPS stale") ? "#ff9a9a" : "#9dd8a3", fontSize: 11 }}>
                {staleGpsPhotosMsg}
              </div>
            ) : null}
            {Array.isArray(staleGpsPhotosReport?.staleRows) && staleGpsPhotosReport.staleRows.length ? (
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {staleGpsPhotosReport.staleRows.slice(0, 8).map((row) => (
                  <div
                    key={`${row.pinId}:${row.assetId}`}
                    style={{
                      background: "rgba(9, 17, 30, 0.88)",
                      border: "1px solid rgba(120, 170, 255, 0.18)",
                      borderRadius: 8,
                      padding: "6px 8px",
                      fontSize: 11,
                      lineHeight: 1.4,
                    }}
                  >
                    <div style={{ color: "#eef6ff", fontWeight: 600 }}>{row.assetName || row.assetId}</div>
                    <div style={{ color: "#9fb2d6" }}>{row.pinTitle}</div>
                    <div style={{ color: "#91a6cb" }}>{row.reason}</div>
                  </div>
                ))}
                {staleGpsPhotosReport.staleRows.length > 8 ? (
                  <div style={{ color: "#91a6cb", fontSize: 11 }}>
                    Showing 8 of {staleGpsPhotosReport.staleRows.length} stale GPS assets.
                  </div>
                ) : null}
              </div>
            ) : null}
            {syncMsg ? (
              <div style={{ marginTop: 6, color: syncMsg.startsWith("Sync failed") ? "#ff9a9a" : "#9dd8a3" }}>
                {syncMsg}
              </div>
            ) : null}
          </>
        ) : null}

        {toolPanels.bounds ? (
          <>
            <div style={{ height: 1, background: "rgba(255,255,255,0.12)", marginTop: 10, marginBottom: 8 }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Bounds Picker</div>
            <div style={{ color: "#b8c4d8" }}>
              {pickMode ? "Click and drag to draw a rectangle. The bounds will appear below." : "Picker is off."}
            </div>
            {pickMode ? <div style={{ marginTop: 4, color: "#9fb2d6" }}>Disable picker to interact with map markers and popups.</div> : null}
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
                  onClick={() => {
                    setViewBounds({ ...bounds });
                    setViewBoundsVersion((v) => v + 1);
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
            {bounds ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Create Photo Area</div>
                <input
                  type="text"
                  value={photoAreaName}
                  onChange={(e) => setPhotoAreaName(e.target.value)}
                  placeholder="Area name"
                  style={{
                    width: "100%",
                    background: "#101827",
                    border: "1px solid #2a3a57",
                    color: "#fff",
                    borderRadius: 8,
                    padding: "6px 8px",
                    fontSize: 12,
                  }}
                />
                <button
                  type="button"
                  onClick={createPhotoAreaFromBounds}
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
                  Create area from current bounds
                </button>
                {photoAreaMsg ? (
                  <div style={{ marginTop: 6, color: "#9dd8a3" }}>{photoAreaMsg}</div>
                ) : null}
              </div>
            ) : null}
            {photoAreas.length ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Edit Existing Area</div>
                <select
                  value={editingAreaId}
                  onChange={(e) => setEditingAreaId(e.target.value)}
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
                  <option value="">Select area to edit</option>
                  {photoAreas.map((area) => (
                    <option key={`edit-area-${area.id}`} value={area.id}>
                      {area.title}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => loadAreaForEditing(editingAreaId)}
                    disabled={!editingAreaId}
                    style={{
                      flex: 1,
                      background: "#101827",
                      border: "1px solid #2a3a57",
                      color: "#fff",
                      padding: "6px 8px",
                      borderRadius: 8,
                      cursor: editingAreaId ? "pointer" : "default",
                      fontSize: 12,
                      opacity: editingAreaId ? 1 : 0.65,
                    }}
                  >
                    Load bounds
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPickMode(true);
                      setCornerPickMode(false);
                    }}
                    style={{
                      flex: 1,
                      background: pickMode ? "#0f1726" : "#101827",
                      border: "1px solid #2a3a57",
                      color: "#fff",
                      padding: "6px 8px",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {pickMode ? "Redraw mode on" : "Redraw on map"}
                  </button>
                  <button
                    type="button"
                    onClick={updatePhotoAreaFromBounds}
                    disabled={!editingAreaId || !bounds}
                    style={{
                      flex: 1,
                      background: "#15233a",
                      border: "1px solid #325080",
                      color: "#fff",
                      padding: "6px 8px",
                      borderRadius: 8,
                      cursor: editingAreaId && bounds ? "pointer" : "default",
                      fontSize: 12,
                      opacity: editingAreaId && bounds ? 1 : 0.65,
                    }}
                  >
                    Save bounds
                  </button>
                </div>
                {!bounds ? <div style={{ marginTop: 6, color: "#9fb2d6", fontSize: 11 }}>Load an area or draw bounds before saving.</div> : null}
                <div style={{ marginTop: 6, color: "#9fb2d6", fontSize: 11 }}>
                  Redraw: click and drag on the map to define the new rectangle, then click Save bounds.
                </div>
              </div>
            ) : null}
          </>
        ) : null}
        {toolPanels.areas ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "#b8c4d8" }}>Photo areas: {allAreaRows.length}</div>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={checkStaleAreaPhotos}
                disabled={staleAreaPhotosLoading || staleAreaPhotosRemoving}
                style={{
                  flex: 1,
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  padding: "6px 8px",
                  borderRadius: 8,
                  cursor: staleAreaPhotosLoading || staleAreaPhotosRemoving ? "default" : "pointer",
                  fontSize: 12,
                  opacity: staleAreaPhotosLoading || staleAreaPhotosRemoving ? 0.65 : 1,
                }}
              >
                {staleAreaPhotosLoading ? "Checking..." : "Check stale area photos"}
              </button>
              <button
                type="button"
                onClick={removeStaleAreaPhotos}
                disabled={staleAreaPhotosRemoving || !Number(staleAreaPhotosReport?.staleCount || 0)}
                style={{
                  flex: 1,
                  background: "#15233a",
                  border: "1px solid #325080",
                  color: "#fff",
                  padding: "6px 8px",
                  borderRadius: 8,
                  cursor: staleAreaPhotosRemoving || !Number(staleAreaPhotosReport?.staleCount || 0) ? "default" : "pointer",
                  fontSize: 12,
                  opacity: staleAreaPhotosRemoving || !Number(staleAreaPhotosReport?.staleCount || 0) ? 0.65 : 1,
                }}
              >
                {staleAreaPhotosRemoving ? "Removing..." : "Remove stale"}
              </button>
            </div>
            {staleAreaPhotosMsg ? (
              <div style={{ marginTop: 6, color: staleAreaPhotosMsg.startsWith("Stale") ? "#ff9a9a" : "#9dd8a3", fontSize: 11 }}>
                {staleAreaPhotosMsg}
              </div>
            ) : null}
            {Array.isArray(staleAreaPhotosReport?.staleRows) && staleAreaPhotosReport.staleRows.length ? (
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {staleAreaPhotosReport.staleRows.slice(0, 8).map((row) => (
                  <div
                    key={`${row.areaId}:${row.assetId}`}
                    style={{
                      background: "rgba(9, 17, 30, 0.88)",
                      border: "1px solid rgba(120, 170, 255, 0.18)",
                      borderRadius: 8,
                      padding: "6px 8px",
                      fontSize: 11,
                      lineHeight: 1.4,
                    }}
                  >
                    <div style={{ color: "#eef6ff", fontWeight: 600 }}>{row.assetName || row.assetId}</div>
                    <div style={{ color: "#9fb2d6" }}>{row.areaTitle}</div>
                    <div style={{ color: "#91a6cb" }}>{row.reason}</div>
                  </div>
                ))}
                {staleAreaPhotosReport.staleRows.length > 8 ? (
                  <div style={{ color: "#91a6cb", fontSize: 11 }}>
                    Showing 8 of {staleAreaPhotosReport.staleRows.length} stale assignments.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {toolPanels.areaStyle ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Area style</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {AREA_VISUAL_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAreaStyleDraft(m.id)}
                  style={{
                    background: areaStyleDraft === m.id ? "#15233a" : "#101827",
                    border: areaStyleDraft === m.id ? "1px solid #3b5f92" : "1px solid #2a3a57",
                    color: "#fff",
                    padding: "4px 6px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setAreaVisualMode(areaStyleDraft);
                  setAreaStyleMsg("Style applied");
                }}
                disabled={areaStyleDraft === areaVisualMode}
                style={{
                  background: "#15233a",
                  border: "1px solid #325080",
                  color: "#fff",
                  padding: "6px 8px",
                  borderRadius: 8,
                  cursor: areaStyleDraft === areaVisualMode ? "default" : "pointer",
                  fontSize: 12,
                  opacity: areaStyleDraft === areaVisualMode ? 0.65 : 1,
                }}
              >
                Apply style
              </button>
              <div style={{ color: "#9fb2d6", fontSize: 11 }}>
                Live: {AREA_VISUAL_MODES.find((m) => m.id === areaVisualMode)?.label || areaVisualMode}
              </div>
            </div>
            {areaStyleMsg ? (
              <div style={{ marginTop: 6, color: "#9dd8a3", fontSize: 11 }}>{areaStyleMsg}</div>
            ) : null}
          </div>
        ) : null}
        {toolPanels.bounds && bounds ? (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={copyPhotoAreaJson}
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
              {photoAreaCopied ? "Copied" : "Copy current area JSON"}
            </button>
          </div>
        ) : null}
        {toolPanels.areas && allAreaRows.length ? (
          <div style={{ marginTop: 8, maxHeight: 140, overflowY: "auto" }}>
            {allAreaRows.map((area) => {
              const count = Array.isArray(area.photos) ? area.photos.length : 0;
              return (
                <div key={`tool-${area.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: "#dfe9ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{area.title}</div>
                    <div style={{ color: "#9fb2d6", fontSize: 11 }}>{count} photo{count === 1 ? "" : "s"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {!area.locked ? (
                      <button
                        type="button"
                        onClick={() => {
                          loadAreaForEditing(area.id);
                          setToolPanels((prev) => ({ ...prev, bounds: true }));
                        }}
                        style={{
                          background: "#101827",
                          border: "1px solid #2a3a57",
                          color: "#fff",
                          padding: "4px 6px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontSize: 11,
                        }}
                      >
                        Edit
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => deletePhotoArea(area.id)}
                      disabled={!!area.locked}
                      style={{
                        background: "#1f1020",
                        border: "1px solid #6f2b5a",
                        color: "#fff",
                        padding: "4px 6px",
                        borderRadius: 8,
                        cursor: area.locked ? "default" : "pointer",
                        fontSize: 11,
                        opacity: area.locked ? 0.5 : 1,
                      }}
                    >
                      {area.locked ? "Built-in" : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {toolPanels.corner ? (
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
          ) : null}
        </>
      ) : null}

      {shareOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Share photo"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShareOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20010,
            background: "rgba(0,0,0,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(520px, 96vw)",
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              background: "linear-gradient(165deg, rgba(8,15,27,0.98), rgba(7,12,21,0.94))",
              color: "#f4f8ff",
              border: "1px solid rgba(120, 170, 255, 0.36)",
              borderRadius: 14,
              boxShadow: "0 18px 36px rgba(0,0,0,0.42), inset 0 0 0 1px rgba(255,255,255,0.04)",
              padding: 12,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Share Photo</div>
            <div style={{ color: "#b8c4d8", marginBottom: 8, fontSize: 12 }}>
              Lightroom short link is required. Date/time and lat/lng are optional.
            </div>
            <input
              type="url"
              value={shareShortLink}
              onChange={(e) => setShareShortLink(e.target.value)}
              placeholder="https://adobe.ly/..."
              style={{
                width: "100%",
                background: "#101827",
                border: "1px solid #2a3a57",
                color: "#fff",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 13,
              }}
            />
            <div style={{ marginTop: 8 }}>
              <div style={{ color: "#9fb2d6", fontSize: 11, marginBottom: 4 }}>Year</div>
              <select
                value={shareYear}
                onChange={(e) => setShareYear(e.target.value)}
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                <option value="2023">2023</option>
                <option value="2022">2022</option>
              </select>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ color: "#9fb2d6", fontSize: 11, marginBottom: 4 }}>Race</div>
              <select
                value={shareRace}
                onChange={(e) => setShareRace(e.target.value)}
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                <option value="12 Hours of Sebring">12 Hours of Sebring</option>
                <option value="1000 Miles of Sebring">1000 Miles of Sebring</option>
              </select>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ color: "#9fb2d6", fontSize: 11, marginBottom: 4 }}>Date / Time (optional)</div>
              <input
                type="datetime-local"
                value={shareDateTime}
                onChange={(e) => setShareDateTime(e.target.value)}
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              />
            </div>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <input
                type="number"
                inputMode="decimal"
                value={shareLat}
                onChange={(e) => setShareLat(e.target.value)}
                placeholder="Latitude (optional)"
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              />
              <input
                type="number"
                inputMode="decimal"
                value={shareLng}
                onChange={(e) => setShareLng(e.target.value)}
                placeholder="Longitude (optional)"
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              />
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ color: "#9fb2d6", fontSize: 11, marginBottom: 4 }}>
                Photo area (required when no location)
              </div>
              <select
                value={shareAreaId}
                onChange={(e) => setShareAreaId(e.target.value)}
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                <option value="">Select area (optional with location)</option>
                {allAreaRows.map((area) => (
                  <option key={`share-area-${area.id}`} value={area.id}>
                    {area.title}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                style={{
                  background: "#111",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  padding: "8px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={submitSharePhoto}
                disabled={shareSubmitting}
                style={{
                  background: "#15233a",
                  border: "1px solid #325080",
                  color: "#fff",
                  padding: "8px 10px",
                  borderRadius: 8,
                  cursor: shareSubmitting ? "default" : "pointer",
                  fontSize: 12,
                  opacity: shareSubmitting ? 0.7 : 1,
                }}
              >
                {shareSubmitting ? "Sharing..." : "Share Photo"}
              </button>
            </div>
            {shareMsg ? (
              <div style={{ marginTop: 8, color: shareMsg.startsWith("Share failed") ? "#ff9a9a" : "#9dd8a3", fontSize: 12 }}>
                {shareMsg}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {shareAlbumOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Share album"
          onMouseDown={(e) => {
            if (!shareAlbumSubmitting && e.target === e.currentTarget) setShareAlbumOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20010,
            background: "rgba(0,0,0,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(520px, 96vw)",
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              background: "linear-gradient(165deg, rgba(8,15,27,0.98), rgba(7,12,21,0.94))",
              color: "#f4f8ff",
              border: "1px solid rgba(120, 170, 255, 0.36)",
              borderRadius: 14,
              boxShadow: "0 18px 36px rgba(0,0,0,0.42), inset 0 0 0 1px rgba(255,255,255,0.04)",
              padding: 12,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Share Album</div>
            <div style={{ color: "#b8c4d8", marginBottom: 8, fontSize: 12 }}>
              Lightroom shared album short link is required. The album title comes from Lightroom and a new album page is created under the selected series. Race and year are published with it.
            </div>
            <input
              type="url"
              value={shareAlbumShortLink}
              onChange={(e) => setShareAlbumShortLink(e.target.value)}
              placeholder="https://adobe.ly/..."
              style={{
                width: "100%",
                background: "#101827",
                border: "1px solid #2a3a57",
                color: "#fff",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 13,
              }}
            />
            <div style={{ marginTop: 8 }}>
              <div style={{ color: "#9fb2d6", fontSize: 11, marginBottom: 4 }}>Series</div>
              <select
                value={shareAlbumSeries}
                onChange={(e) => {
                  setShareAlbumSeries(e.target.value);
                  setShareAlbumExistingSlug("");
                }}
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                {SHARED_ALBUM_SERIES.map((series) => (
                  <option key={`share-album-series-${series.key}`} value={series.key}>
                    {series.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ color: "#9fb2d6", fontSize: 11, marginBottom: 4 }}>Existing album (optional)</div>
              <select
                value={shareAlbumExistingSlug}
                onChange={(e) => {
                  const nextSlug = e.target.value;
                  setShareAlbumExistingSlug(nextSlug);
                  setShareAlbumSlug(nextSlug);
                }}
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                <option value="">{shareAlbumChoicesLoading ? "Loading albums..." : "Create or choose by slug below"}</option>
                {shareAlbumChoices.map((album) => (
                  <option key={`share-album-existing-${album.albumKey}`} value={album.slug}>
                    {album.title} [{album.slug}] ({album.photoCount || 0})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ color: "#9fb2d6", fontSize: 11, marginBottom: 4 }}>Album slug</div>
              <input
                type="text"
                value={shareAlbumSlug}
                onChange={(e) => {
                  setShareAlbumSlug(e.target.value);
                  if ((e.target.value || "").trim() !== shareAlbumExistingSlug) {
                    setShareAlbumExistingSlug("");
                  }
                }}
                placeholder="2026-weathertech-practice-am"
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              />
              <div style={{ color: "#9fb2d6", fontSize: 11, marginTop: 6 }}>
                Required for new albums. Re-imports can fill this from the existing album picker.
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ color: "#9fb2d6", fontSize: 11, marginBottom: 4 }}>Year</div>
              <input
                type="number"
                inputMode="numeric"
                value={shareAlbumYear}
                onChange={(e) => setShareAlbumYear(e.target.value)}
                placeholder="2025"
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              />
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ color: "#9fb2d6", fontSize: 11, marginBottom: 4 }}>Race</div>
              <input
                list="share-album-race-options"
                value={shareAlbumRace}
                onChange={(e) => setShareAlbumRace(e.target.value)}
                placeholder="12 Hours of Sebring"
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              />
              <datalist id="share-album-race-options">
                {availableRaces.map((race) => (
                  <option key={`share-album-race-${race}`} value={race} />
                ))}
              </datalist>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ color: "#9fb2d6", fontSize: 11, marginBottom: 4 }}>Photo area (optional)</div>
              <select
                value={shareAlbumAreaId}
                onChange={(e) => setShareAlbumAreaId(e.target.value)}
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                <option value="">Assign later</option>
                {allAreaRows.map((area) => (
                  <option key={`share-album-area-${area.id}`} value={area.id}>
                    {area.title}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ color: "#9fb2d6", fontSize: 11, marginBottom: 4 }}>Local JPG export folder (optional)</div>
              <input
                type="file"
                multiple
                accept=".jpg,.jpeg"
                webkitdirectory=""
                directory=""
                onChange={(e) => {
                  const nextFiles = Array.from(e.target.files || []);
                  setShareAlbumLocalFiles(nextFiles);
                  setShareAlbumLocalImportEnabled(nextFiles.length > 0);
                }}
                style={{
                  width: "100%",
                  background: "#101827",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              />
              <div style={{ color: "#9fb2d6", fontSize: 11, marginTop: 6 }}>
                Select the exported JPG folder if you want the site to import local EXIF GPS after the album import. JPG/JPEG only.
              </div>
              {shareAlbumLocalFiles.length ? (
                <div style={{ color: "#d8e4ff", fontSize: 11, marginTop: 6 }}>
                  Selected {shareAlbumLocalFiles.length} file{shareAlbumLocalFiles.length === 1 ? "" : "s"} for optional local GPS import.
                </div>
              ) : null}
            </div>
            <label
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#d8e4ff",
                fontSize: 12,
              }}
            >
              <input
                type="checkbox"
                checked={shareAlbumLocalImportEnabled}
                disabled={!shareAlbumLocalFiles.length}
                onChange={(e) => setShareAlbumLocalImportEnabled(e.target.checked)}
              />
              Run local GPS import from the selected JPGs after the album import finishes
            </label>
            <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShareAlbumOpen(false)}
                style={{
                  background: "#111",
                  border: "1px solid #2a3a57",
                  color: "#fff",
                  padding: "8px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={submitShareAlbum}
                disabled={shareAlbumSubmitting}
                style={{
                  background: "#15233a",
                  border: "1px solid #325080",
                  color: "#fff",
                  padding: "8px 10px",
                  borderRadius: 8,
                  cursor: shareAlbumSubmitting ? "default" : "pointer",
                  fontSize: 12,
                  opacity: shareAlbumSubmitting ? 0.7 : 1,
                }}
              >
                {shareAlbumSubmitting ? "Sharing..." : "Share Album"}
              </button>
            </div>
            {shareAlbumMsg ? (
              <div style={{ marginTop: 8, color: shareAlbumMsg.startsWith("Share failed") ? "#ff9a9a" : "#9dd8a3", fontSize: 12 }}>
                {shareAlbumMsg}
              </div>
            ) : null}
            {shareAlbumDiagnostics ? (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", color: "#c7d6ef", fontSize: 12 }}>
                  Diagnostics
                </summary>
                <pre
                  style={{
                    marginTop: 8,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: "#0b1422",
                    border: "1px solid #22304a",
                    color: "#dfe8ff",
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 11,
                    lineHeight: 1.4,
                    maxHeight: 260,
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(shareAlbumDiagnostics, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}

      <MapContainer
        center={[27.4564, -81.3483]}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />
        {data ? <GeoJSON data={data} style={geoStyle} /> : null}
        {viewLatLngBounds ? <FitToBounds bounds={viewLatLngBounds} lockZoom version={viewBoundsVersion} /> : data ? <FitToGeoJSON data={data} /> : null}
        {toolPanels.bounds ? <BoundsPicker enabled={pickMode} onChange={setBounds} /> : null}
        {toolPanels.corner ? <CornerPicker enabled={cornerPickMode} activeCorner={activeCorner} onPick={onCornerPick} /> : null}
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

        {visibleGpsPins.map((pin) => (
          (() => {
            const ratio = Math.max(0, Math.min(1, Number(pin.photo_count || 0) / maxGpsClusterPhotoCount));
            const heatColor = gpsClusterHeatColor(ratio);
            const outerRadius = 15 + ratio * 20;
            const innerRadius = 7 + ratio * 10;
            const coreRadius = Math.max(4, 8 - ratio * 3.2);

            return (
              <Fragment key={pin.pin_id}>
                <Circle
                  center={[pin.lat, pin.lng]}
                  radius={outerRadius}
                  interactive={false}
                  pathOptions={{ stroke: false, fillColor: heatColor, fillOpacity: 0.12 + ratio * 0.18 }}
                />
                <Circle
                  center={[pin.lat, pin.lng]}
                  radius={innerRadius}
                  interactive={false}
                  pathOptions={{ stroke: false, fillColor: heatColor, fillOpacity: 0.16 + ratio * 0.24 }}
                />
                <CircleMarker
                  center={[pin.lat, pin.lng]}
                  radius={coreRadius}
                  pathOptions={{ color: heatColor, fillColor: heatColor, fillOpacity: 0.92, weight: 1.5 }}
                >
                  <Popup maxWidth={360} minWidth={220}>
                    <div style={{ width: "min(320px, 82vw)" }}>
                      <div style={{ fontWeight: 700 }}>
                        {Number(pin.photo_count || 0) > 1 ? "GPS Photo Cluster" : pin.title || "GPS Photo"}
                      </div>
                      <div style={{ marginTop: 4, color: "#9fb2d6", fontSize: 12 }}>
                        {pin.photo_count || 0} photo{Number(pin.photo_count || 0) === 1 ? "" : "s"}
                      </div>
                      {pin.cover_thumb_url ? (
                        <img
                          src={normalizeLightroomImageUrl(pin.cover_thumb_url)}
                          alt={pin.title || "GPS photo preview"}
                          style={{ width: "100%", height: "auto", marginTop: 8, borderRadius: 10, display: "block" }}
                        />
                      ) : null}
                      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => openGpsViewer(pin)}
                          style={{
                            background: "#111",
                            border: "1px solid #222",
                            color: "#fff",
                            padding: "6px 8px",
                            borderRadius: 8,
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          Open viewer
                        </button>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              </Fragment>
            );
          })()
        ))}

        {allAreaRows.map((area) => (
          <Fragment key={area.id}>
            <AreaOverlay
              bounds={area.bounds}
              title={area.title}
              mode={areaVisualMode}
              photoCount={Array.isArray(area.photos) ? area.photos.length : 0}
              maxPhotoCount={maxAreaPhotoCount}
            />
            {Array.isArray(area.photos) && area.photos.length > 0 ? (
              <CircleMarker
                center={Array.isArray(area.center) ? area.center : [((area.bounds.north + area.bounds.south) / 2), ((area.bounds.east + area.bounds.west) / 2)]}
                radius={3}
                pathOptions={{ color: AREA_MARKER_COLOR, fillColor: AREA_MARKER_COLOR, fillOpacity: 0.9 }}
              >
                <Popup maxWidth={720} minWidth={220}>
                  <div style={{ width: "min(600px, 90vw)", overflow: "hidden", borderRadius: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{area.title}</div>
                    {area.photos[0]?.src || area.photos[0]?.fullUrl ? (
                      <>
                        <img
                          src={getRenderablePhotoUrl(area.photos[0])}
                          alt={area.photos[0].alt || area.photos[0].name || area.title}
                          onClick={() => openAreaViewer(area)}
                          style={{ width: "100%", height: "auto", maxHeight: "55vh", objectFit: "cover", display: "block", cursor: "pointer" }}
                        />
                        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div style={{ color: "#9fb2d6", fontSize: 12 }}>
                            {area.photos.length} photo{area.photos.length === 1 ? "" : "s"}
                          </div>
                          <button
                            type="button"
                            onClick={() => openAreaViewer(area)}
                            style={{
                              background: "#111",
                              border: "1px solid #222",
                              color: "#fff",
                              padding: "6px 8px",
                              borderRadius: 8,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Open viewer
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "#9fb2d6", fontSize: 12, lineHeight: 1.35 }}>
                        {area.photos.length} photo{area.photos.length === 1 ? "" : "s"} assigned.
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ) : null}
          </Fragment>
        ))}
      </MapContainer>

      {areaViewer.open && areaViewer.photos.length ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Area photo viewer"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeAreaViewer();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20000,
            padding: 0,
          }}
        >
          <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ color: "#bbb", fontSize: 13 }}>
              {areaViewer.title} - {areaViewer.index + 1} / {areaViewer.photos.length}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {!String(areaViewer.photos[areaViewer.index]?.id || "").startsWith("builtin-") ? (
                <button
                  type="button"
                  onClick={removeCurrentAreaPhoto}
                  disabled={removingAreaPhoto}
                  style={{ background: "#1f1020", border: "1px solid #6f2b5a", color: "#fff", padding: "10px 12px", borderRadius: 12, cursor: "pointer", opacity: removingAreaPhoto ? 0.7 : 1 }}
                >
                  {removingAreaPhoto ? "Removing..." : "Remove from area"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={closeAreaViewer}
                style={{ background: "#111", border: "1px solid #222", color: "#fff", padding: "10px 12px", borderRadius: 12, cursor: "pointer" }}
              >
                Close
              </button>
            </div>
          </div>
          {areaViewerMsg ? (
            <div style={{ position: "absolute", top: 52, left: 12, color: areaViewerMsg.startsWith("Remove failed") ? "#ff9a9a" : "#9dd8a3", fontSize: 12 }}>
              {areaViewerMsg}
            </div>
          ) : null}

          {areaViewer.photos.length > 1 ? (
            <>
              <button
                type="button"
                onClick={prevAreaPhoto}
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "#111", border: "1px solid #222", color: "#fff", padding: "12px 14px", borderRadius: 14, cursor: "pointer" }}
                aria-label="Previous photo"
              >
                ←
              </button>
              <button
                type="button"
                onClick={nextAreaPhoto}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "#111", border: "1px solid #222", color: "#fff", padding: "12px 14px", borderRadius: 14, cursor: "pointer" }}
                aria-label="Next photo"
              >
                →
              </button>
            </>
          ) : null}

          <img
            src={getRenderablePhotoUrl(currentAreaViewerPhoto)}
            alt={currentAreaViewerPhoto?.alt || currentAreaViewerPhoto?.name}
            style={{ maxWidth: "100vw", maxHeight: "100vh", width: "auto", height: "auto", background: "#111" }}
            draggable={false}
          />
        </div>
      ) : null}

      {gpsViewer.open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="GPS photo viewer"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeGpsViewer();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20000,
            padding: 0,
          }}
        >
          <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ color: "#bbb", fontSize: 13 }}>
              {gpsViewer.title}
              {gpsViewer.photos.length ? ` - ${gpsViewer.index + 1} / ${gpsViewer.photos.length}` : ""}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={closeGpsViewer}
                style={{ background: "#111", border: "1px solid #222", color: "#fff", padding: "10px 12px", borderRadius: 12, cursor: "pointer" }}
              >
                Close
              </button>
            </div>
          </div>

          {gpsViewer.loading ? (
            <div style={{ color: "#fff" }}>Loading photos…</div>
          ) : gpsViewer.error ? (
            <div style={{ color: "#ff9a9a" }}>{gpsViewer.error}</div>
          ) : gpsViewer.photos.length ? (
            <>
              {gpsViewer.photos.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={prevGpsPhoto}
                    style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "#111", border: "1px solid #222", color: "#fff", padding: "12px 14px", borderRadius: 14, cursor: "pointer" }}
                    aria-label="Previous photo"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={nextGpsPhoto}
                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "#111", border: "1px solid #222", color: "#fff", padding: "12px 14px", borderRadius: 14, cursor: "pointer" }}
                    aria-label="Next photo"
                  >
                    →
                  </button>
                </>
              ) : null}

              <img
                src={normalizeLightroomImageUrl(gpsViewer.photos[gpsViewer.index]?.fullUrl)}
                alt={gpsViewer.photos[gpsViewer.index]?.alt || gpsViewer.photos[gpsViewer.index]?.name}
                style={{ maxWidth: "100vw", maxHeight: "100vh", width: "auto", height: "auto", background: "#111" }}
                draggable={false}
              />
            </>
          ) : (
            <div style={{ color: "#bbb" }}>No photos found for this marker.</div>
          )}
        </div>
      ) : null}

      <style jsx global>{`
        .leaflet-popup-content-wrapper,
        .leaflet-popup-tip {
          background: linear-gradient(150deg, #0d1628, #101a30);
          color: #eef6ff;
          border: 1px solid rgba(144, 191, 255, 0.34);
          box-shadow: 0 12px 26px rgba(0, 0, 0, 0.38);
        }
        .sebringTitleCard {
          animation: sebringPulse 4s ease-in-out infinite;
        }
        @keyframes sebringPulse {
          0%,
          100% {
            box-shadow: 0 14px 38px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
          }
          50% {
            box-shadow: 0 16px 42px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(115, 171, 255, 0.35),
              inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          }
        }
      `}</style>
      </div>
    </div>
  );
}
