"use client";

import { useEffect, useState } from "react";

export default function AssignPhotoToArea({ asset }) {
  const [open, setOpen] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [trackId, setTrackId] = useState("sebring");
  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

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
        const list = Array.isArray(payload?.areas) ? payload.areas : [];
        setAreas(list);
        if (list.length) {
          setAreaId((prev) => (list.some((a) => a.id === prev) ? prev : list[0].id));
        } else {
          setAreaId("");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAreas([]);
        setAreaId("");
      });
    return () => {
      cancelled = true;
    };
  }, [open, trackId]);

  const assign = async () => {
    if (!asset?.id || !areaId || !trackId) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/photo-area-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId,
          areaId,
          asset: {
            id: asset.id,
            name: asset.name || asset.id,
            thumbUrl: asset.thumbUrl || asset.fullUrl,
            fullUrl: asset.fullUrl || asset.thumbUrl,
          },
        }),
      });
      const raw = await res.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }
      if (!res.ok) throw new Error(payload?.error || raw || `HTTP ${res.status}`);
      setMsg("Assigned");
    } catch (e) {
      setMsg(`Failed: ${String(e?.message || e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "#111",
          border: "1px solid #222",
          color: "#fff",
          padding: "10px 12px",
          borderRadius: 12,
          cursor: "pointer",
        }}
      >
        Add to Area
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

