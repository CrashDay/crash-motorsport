"use client";

import { useEffect, useState } from "react";

const LOCAL_SEBRING_AREAS_KEY = "sebring_photo_areas_v1";
const DEFAULT_TRACK_ID = "sebring";

function getLocalSebringAreas() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_SEBRING_AREAS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a) => a && typeof a === "object" && typeof a.id === "string" && a.id.trim())
      .map((a) => ({ id: String(a.id), title: String(a.title || a.id) }));
  } catch {
    return [];
  }
}

function mergeAreas(serverAreas, localAreas) {
  const map = new Map();
  for (const area of serverAreas || []) {
    if (!area?.id) continue;
    map.set(String(area.id), { ...area, id: String(area.id), title: String(area.title || area.id) });
  }
  for (const area of localAreas || []) {
    if (!area?.id) continue;
    if (!map.has(area.id)) {
      map.set(area.id, { id: area.id, title: area.title || area.id });
      continue;
    }
    const existing = map.get(area.id);
    const existingTitle = String(existing?.title || "");
    const localTitle = String(area.title || area.id);
    // Prefer local human-readable titles over server fallback IDs for custom areas.
    if (!existingTitle || existingTitle === area.id) {
      map.set(area.id, { ...existing, title: localTitle });
    }
  }
  return Array.from(map.values());
}

function getAssetIds(asset) {
  const rawId = String(asset?.id || "").trim();
  const thumbUrl = String(asset?.thumbUrl || "").trim();
  const fullUrl = String(asset?.fullUrl || "").trim();
  const canonicalId = [rawId, fullUrl || thumbUrl].filter(Boolean).join("::");
  return { rawId, canonicalId };
}

function getAssignedAreaTitles(areas, ids) {
  if (!Array.isArray(areas) || !ids?.rawId) return [];
  const out = [];
  for (const area of areas) {
    const photos = Array.isArray(area?.photos) ? area.photos : [];
    const match = photos.some((p) => {
      const pid = String(p?.id || "");
      return pid === ids.rawId || (ids.canonicalId && pid === ids.canonicalId);
    });
    if (match) out.push(String(area?.title || area?.id || "Unnamed area"));
  }
  return out;
}

async function postAssignment(payload, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch("/api/photo-area-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      let parsed = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }
      if (!res.ok) {
        const message = parsed?.error || raw || `HTTP ${res.status}`;
        const err = new Error(message);
        err.status = res.status;
        throw err;
      }
      return parsed || { ok: true };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retryable = !status || status >= 500;
      if (!retryable || attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 220 * (attempt + 1)));
    }
  }
  throw lastError || new Error("Assignment failed");
}

export default function AssignPhotoToArea({ asset }) {
  const assetId = asset?.id;
  const assetFullUrl = asset?.fullUrl;
  const assetThumbUrl = asset?.thumbUrl;
  const [open, setOpen] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [trackId, setTrackId] = useState("sebring");
  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [assignedByTrack, setAssignedByTrack] = useState({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/photo-areas", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        const list = Array.isArray(payload?.tracks) ? payload.tracks : [];
        setTracks(list);
        if (list.length && !list.some((t) => t.id === trackId)) {
          setTrackId(list[0].id);
        }
      })
      .catch(() => setTracks([]));
    return () => {
      cancelled = true;
    };
  }, [open, trackId]);

  useEffect(() => {
    if (!open || !trackId) return;
    let cancelled = false;
    setMsg("");
    fetch(`/api/photo-areas?trackId=${encodeURIComponent(trackId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        const serverList = Array.isArray(payload?.areas) ? payload.areas : [];
        const localList = trackId === "sebring" ? getLocalSebringAreas() : [];
        const list = mergeAreas(serverList, localList);
        setAreas(list);
        if (list.length) {
          setAreaId((prev) => (list.some((a) => a.id === prev) ? prev : list[0].id));
        } else {
          setAreaId("");
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (trackId === "sebring") {
          const localList = mergeAreas([], getLocalSebringAreas());
          setAreas(localList);
          setAreaId(localList.length ? localList[0].id : "");
        } else {
          setAreas([]);
          setAreaId("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, trackId]);

  useEffect(() => {
    if (!assetId) {
      setAssignedByTrack({});
      return;
    }
    let cancelled = false;
    const ids = getAssetIds({ id: assetId, fullUrl: assetFullUrl, thumbUrl: assetThumbUrl });
    fetch("/api/photo-areas", { cache: "no-store" })
      .then((r) => r.json())
      .then(async (payload) => {
        const tracksList = Array.isArray(payload?.tracks) ? payload.tracks : [];
        const statusEntries = await Promise.all(
          tracksList.map(async (t) => {
            try {
              const res = await fetch(`/api/photo-areas?trackId=${encodeURIComponent(t.id)}`, { cache: "no-store" });
              const trackPayload = await res.json();
              const serverAreas = Array.isArray(trackPayload?.areas) ? trackPayload.areas : [];
              const localAreas = t.id === "sebring" ? getLocalSebringAreas() : [];
              const mergedAreas = mergeAreas(serverAreas, localAreas);
              return [t.id, getAssignedAreaTitles(mergedAreas, ids)];
            } catch {
              return [t.id, []];
            }
          })
        );
        if (cancelled) return;
        setAssignedByTrack(Object.fromEntries(statusEntries));
      })
      .catch(() => {
        if (cancelled) return;
        setAssignedByTrack({});
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, assetFullUrl, assetThumbUrl]);

  const assign = async () => {
    if (!asset?.id || !areaId || !trackId) return;
    setSaving(true);
    setMsg("");
    try {
      await postAssignment({
        trackId,
        areaId,
        asset: {
          id: asset.id,
          name: asset.name || asset.id,
          thumbUrl: asset.thumbUrl || asset.fullUrl,
          fullUrl: asset.fullUrl || asset.thumbUrl,
          year: asset.year,
          race: asset.race,
        },
      });
      setMsg("Assigned");
      const areaTitle = areas.find((a) => a.id === areaId)?.title || areaId;
      setAssignedByTrack((prev) => {
        const current = Array.isArray(prev[trackId]) ? prev[trackId] : [];
        if (current.includes(areaTitle)) return prev;
        return { ...prev, [trackId]: [...current, areaTitle] };
      });
    } catch (e) {
      setMsg(`Failed: ${String(e?.message || e)}`);
    } finally {
      setSaving(false);
    }
  };

  const defaultTrackAssigned = Array.isArray(assignedByTrack[DEFAULT_TRACK_ID]) ? assignedByTrack[DEFAULT_TRACK_ID] : [];
  const selectedTrackAssigned = Array.isArray(assignedByTrack[trackId]) ? assignedByTrack[trackId] : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: defaultTrackAssigned.length ? "#132612" : "#111",
          border: defaultTrackAssigned.length ? "1px solid #2f6f3b" : "1px solid #222",
          color: "#fff",
          padding: "10px 12px",
          borderRadius: 12,
          cursor: "pointer",
        }}
      >
        {defaultTrackAssigned.length ? `Added to ${defaultTrackAssigned.length} area${defaultTrackAssigned.length === 1 ? "" : "s"}` : "Add to Area"}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div style={{ width: "min(520px, 94vw)", background: "#0f1724", border: "1px solid #2a3a57", borderRadius: 12, padding: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Assign Photo to Track Area</div>

            <div style={{ marginBottom: 8, fontSize: 12, color: "#b8c4d8" }}>Track page</div>
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              style={{ width: "100%", background: "#101827", border: "1px solid #2a3a57", color: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {selectedTrackAssigned.length ? (
              <div style={{ marginTop: 8, fontSize: 12, color: "#9dd8a3" }}>
                Assigned in: {selectedTrackAssigned.join(", ")}
              </div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 12, color: "#9fb2d6" }}>Not assigned to an area on this track yet.</div>
            )}

            <div style={{ marginTop: 12, marginBottom: 8, fontSize: 12, color: "#b8c4d8" }}>Photo area</div>
            <select
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              style={{ width: "100%", background: "#101827", border: "1px solid #2a3a57", color: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 12, color: msg.startsWith("Failed") ? "#ff9a9a" : "#9dd8a3" }}>{msg}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{ background: "#111", border: "1px solid #222", color: "#fff", padding: "8px 10px", borderRadius: 8, cursor: "pointer" }}
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={saving || !trackId || !areaId}
                  onClick={assign}
                  style={{ background: "#15233a", border: "1px solid #325080", color: "#fff", padding: "8px 10px", borderRadius: 8, cursor: "pointer", opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? "Assigning..." : "Assign"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
