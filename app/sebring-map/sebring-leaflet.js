"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Rectangle, Circle, Polyline, CircleMarker, Popup, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
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
];
const AREA_OVERLAY_COLOR = "#5da2ff";
const AREA_MARKER_COLOR = "#ffd84d";

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
  return String(photo.fullUrl || photo.src || photo.thumbUrl || "").trim();
}

function inferPhotoYear(photo) {
  const explicit = Number(photo?.year);
  if (Number.isInteger(explicit) && explicit >= 1900 && explicit <= 2100) return explicit;
  const source = [photo?.id, photo?.name, photo?.fullUrl, photo?.thumbUrl, photo?.src]
    .map((v) => String(v || ""))
    .join(" ")
    .toLowerCase();
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
  return Math.max(10, Math.hypot(latMeters, lngMeters) * 0.45);
}

function AreaOverlay({ bounds, title, mode }) {
  const center = [(bounds.north + bounds.south) / 2, (bounds.east + bounds.west) / 2];
  const rect = toLatLngBounds(bounds);

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

      <Rectangle bounds={rect} interactive pathOptions={{ color: AREA_OVERLAY_COLOR, weight: 0, fillOpacity: 0, opacity: 0 }}>
        <Tooltip sticky direction="top" opacity={0.95}>
          {title}
        </Tooltip>
      </Rectangle>
    </Fragment>
  );
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
  const [viewBoundsVersion, setViewBoundsVersion] = useState(0);
  const [areaVisualMode, setAreaVisualMode] = useState(() => {
    if (typeof window === "undefined") return "soft_fill";
    try {
      const raw = window.localStorage.getItem(AREA_STYLE_STORAGE_KEY);
      if (raw && AREA_VISUAL_MODES.some((m) => m.id === raw)) return raw;
    } catch {
      // ignore localStorage read errors
    }
    return "soft_fill";
  });
  const [areaStyleDraft, setAreaStyleDraft] = useState("soft_fill");
  const [areaStyleMsg, setAreaStyleMsg] = useState("");
  const [areaViewer, setAreaViewer] = useState({ open: false, areaId: "", title: "", photos: [], index: 0 });
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
    setAreaStyleDraft(areaVisualMode);
  }, [areaVisualMode]);

  const allAreaRows = [
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
    )
      .map((p) => ({
        ...p,
        year: inferPhotoYear(p) || 2023,
        race: inferPhotoRace(p),
      }))
      .filter((p) => {
        const yearOk = yearFilter === "all" ? true : Number(p.year) === Number(yearFilter);
        const raceOk = raceFilter === "all" ? true : String(p.race || "") === raceFilter;
        return yearOk && raceOk;
      }),
  }));

  const closeAreaViewer = () => {
    setAreaViewer({ open: false, areaId: "", title: "", photos: [], index: 0 });
    setAreaViewerMsg("");
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
      const res = await fetch("/api/tracks/sebring/pins");
      if (!res.ok) throw new Error(`Pins HTTP ${res.status}`);
      const payload = await res.json();
      setPinsCount(Array.isArray(payload?.pins) ? payload.pins.length : 0);
    } catch {
      // ignore pins count failures in tools panel
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

      await Promise.all([loadPinsCount(), loadAssignedAreaPhotos()]);
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
          left: 12,
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
        <a href="/" style={{ color: "#ecf3ff", textDecoration: "none", fontSize: 12, fontWeight: 700, letterSpacing: 0.4 }}>
          Home
        </a>
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
          padding: "clamp(8px, 1.4vw, 12px) clamp(14px, 2.6vw, 20px)",
          fontSize: "clamp(18px, 4.8vw, 30px)",
          fontWeight: 800,
          letterSpacing: "clamp(0.2px, 0.12vw, 0.7px)",
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
          top: 88,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(8,14,26,0.86)",
            border: "1px solid rgba(137, 179, 255, 0.32)",
            borderRadius: 999,
            padding: "6px 10px",
          }}
        >
          <span style={{ color: "#c7d6ef", fontSize: 11, fontWeight: 700, letterSpacing: 0.2 }}>Year</span>
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
            }}
          >
            <option value="all">All</option>
            <option value="2023">2023</option>
            <option value="2022">2022</option>
          </select>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(8,14,26,0.86)",
            border: "1px solid rgba(137, 179, 255, 0.32)",
            borderRadius: 999,
            padding: "6px 10px",
          }}
        >
          <span style={{ color: "#c7d6ef", fontSize: 11, fontWeight: 700, letterSpacing: 0.2 }}>Race</span>
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
            }}
          >
            <option value="all">All</option>
            <option value="12 Hours of Sebring">12 Hours of Sebring</option>
          </select>
        </div>
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
            padding: "9px 14px",
            borderRadius: 999,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 0.3,
            boxShadow: "0 10px 24px rgba(255, 77, 20, 0.45), inset 0 0 0 1px rgba(255,255,255,0.2)",
            textTransform: "uppercase",
          }}
        >
          Share Photo
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
              bottom: 12,
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
                bottom: 56,
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
        {toolPanels.areas ? <div style={{ marginTop: 8, color: "#b8c4d8" }}>Photo areas: {allAreaRows.length}</div> : null}
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

        {allAreaRows.map((area) => (
          <Fragment key={area.id}>
            <AreaOverlay bounds={area.bounds} title={area.title} mode={areaVisualMode} />
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
            padding: 16,
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
            style={{ maxWidth: "calc(100vw - 120px)", maxHeight: "calc(100vh - 120px)", width: "auto", height: "auto", borderRadius: 18, border: "1px solid #222", boxShadow: "0 10px 40px rgba(0,0,0,0.6)", background: "#111" }}
            draggable={false}
          />
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

