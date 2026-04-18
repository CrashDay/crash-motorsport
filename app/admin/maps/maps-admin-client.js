"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function MapsAdminClient({ initialMaps = [] }) {
  const [maps, setMaps] = useState(initialMaps);
  const [title, setTitle] = useState("");
  const [trackId, setTrackId] = useState("");
  const [centerLat, setCenterLat] = useState("");
  const [centerLng, setCenterLng] = useState("");
  const [zoom, setZoom] = useState("15");
  const [loadPins, setLoadPins] = useState(true);
  const [geoJson, setGeoJson] = useState("");
  const [status, setStatus] = useState({ type: "", text: "" });
  const [saving, setSaving] = useState(false);

  const suggestedSlug = useMemo(() => slugify(title), [title]);
  const resolvedSlug = trackId.trim() || suggestedSlug;

  useEffect(() => {
    refreshMaps();
  }, []);

  async function refreshMaps() {
    const res = await fetch("/api/admin/maps", { cache: "no-store" });
    if (!res.ok) return;
    const payload = await res.json();
    setMaps(Array.isArray(payload?.maps) ? payload.maps : []);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setStatus({ type: "", text: "" });

    try {
      const res = await fetch("/api/admin/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          trackId: resolvedSlug,
          centerLat,
          centerLng,
          zoom,
          loadPins,
          geoJson,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);

      setStatus({ type: "ok", text: `Map added: /maps/${payload.map.id}` });
      setTitle("");
      setTrackId("");
      setCenterLat("");
      setCenterLng("");
      setZoom("15");
      setLoadPins(true);
      setGeoJson("");
      await refreshMaps();
    } catch (error) {
      setStatus({ type: "error", text: String(error?.message || error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="adminMapsShell">
      <header className="adminMapsHeader">
        <div>
          <p className="adminMapsKicker">Admin</p>
          <h1>Maps</h1>
          <p>Add map pages and keep the creation workflow behind admin sign-in.</p>
        </div>
        <nav>
          <Link href="/">Site</Link>
          <form action="/api/admin/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </nav>
      </header>

      <section className="adminMapsGrid">
        <form className="adminMapsForm" onSubmit={onSubmit}>
          <h2>Add Map</h2>

          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Road Atlanta" />
          </label>

          <label>
            URL slug
            <input value={trackId} onChange={(event) => setTrackId(slugify(event.target.value))} placeholder={suggestedSlug || "road-atlanta"} />
          </label>

          <div className="adminMapsPair">
            <label>
              Center latitude
              <input value={centerLat} onChange={(event) => setCenterLat(event.target.value)} placeholder="34.1489" inputMode="decimal" />
            </label>
            <label>
              Center longitude
              <input value={centerLng} onChange={(event) => setCenterLng(event.target.value)} placeholder="-83.8150" inputMode="decimal" />
            </label>
          </div>

          <div className="adminMapsPair">
            <label>
              Zoom
              <input value={zoom} onChange={(event) => setZoom(event.target.value)} placeholder="15" inputMode="numeric" />
            </label>
            <label className="adminMapsCheckbox">
              <input type="checkbox" checked={loadPins} onChange={(event) => setLoadPins(event.target.checked)} />
              Load GPS photo pins
            </label>
          </div>

          <label>
            GeoJSON
            <textarea value={geoJson} onChange={(event) => setGeoJson(event.target.value)} placeholder='{"type":"FeatureCollection","features":[]}' />
          </label>

          <div className="adminMapsSlug">Page: /maps/{resolvedSlug || "new-map"}</div>

          {status.text ? <div className={status.type === "error" ? "adminMapsError" : "adminMapsOk"}>{status.text}</div> : null}

          <button type="submit" disabled={saving}>
            {saving ? "Adding map..." : "Add map"}
          </button>
        </form>

        <section className="adminMapsList">
          <h2>Current Maps</h2>
          <div className="adminMapsItems">
            {maps.map((map) => (
              <article key={map.id} className="adminMapsItem">
                <div>
                  <strong>{map.title}</strong>
                  <span>{map.builtin ? "Built-in" : "Admin-added"}</span>
                </div>
                <div className="adminMapsActions">
                  <Link href={`/admin/maps/${map.id}`}>Tools</Link>
                  <Link href={`/maps/${map.id}`}>Open</Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>

      <style jsx>{`
        .adminMapsShell {
          min-height: 100vh;
          background: linear-gradient(160deg, #06100c 0%, #12251c 52%, #080b0a 100%);
          color: #f2fff7;
          padding: 24px;
          font-family: system-ui;
        }
        .adminMapsHeader {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-start;
          max-width: 1180px;
          margin: 0 auto 24px;
        }
        .adminMapsKicker {
          margin: 0 0 6px;
          color: #9dd8b5;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
        }
        h1,
        h2 {
          margin: 0;
          letter-spacing: 0;
        }
        h1 {
          font-size: clamp(30px, 5vw, 56px);
          line-height: 1;
        }
        h2 {
          font-size: 22px;
          margin-bottom: 14px;
        }
        p {
          margin: 8px 0 0;
          color: #cce6d6;
        }
        nav {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        a,
        button {
          color: #fff;
          border-radius: 8px;
          border: 1px solid #49725d;
          background: #123022;
          padding: 9px 11px;
          text-decoration: none;
          cursor: pointer;
          font-weight: 800;
        }
        .adminMapsGrid {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
          gap: 18px;
          max-width: 1180px;
          margin: 0 auto;
        }
        .adminMapsForm,
        .adminMapsList {
          background: rgba(10, 24, 17, 0.86);
          border: 1px solid rgba(136, 210, 163, 0.3);
          border-radius: 8px;
          padding: 16px;
        }
        label {
          display: grid;
          gap: 6px;
          margin-bottom: 12px;
          color: #dff5e8;
          font-size: 13px;
          font-weight: 800;
        }
        input,
        textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: 8px;
          border: 1px solid #385746;
          background: #09150f;
          color: #fff;
          padding: 10px 11px;
          font: inherit;
        }
        textarea {
          min-height: 190px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 12px;
        }
        .adminMapsPair {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .adminMapsCheckbox {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 20px;
        }
        .adminMapsCheckbox input {
          width: auto;
        }
        .adminMapsSlug,
        .adminMapsOk,
        .adminMapsError {
          border-radius: 8px;
          padding: 10px 11px;
          margin-bottom: 12px;
          font-size: 13px;
        }
        .adminMapsSlug {
          background: #0b1912;
          color: #bfe8cf;
          border: 1px solid #385746;
        }
        .adminMapsOk {
          background: rgba(26, 100, 62, 0.3);
          color: #c9ffdd;
          border: 1px solid rgba(97, 216, 139, 0.42);
        }
        .adminMapsError {
          background: rgba(100, 26, 26, 0.3);
          color: #ffd4d4;
          border: 1px solid rgba(255, 160, 160, 0.42);
        }
        .adminMapsForm > button {
          width: 100%;
          background: #d94820;
          border-color: #ffb08a;
        }
        .adminMapsItems {
          display: grid;
          gap: 10px;
        }
        .adminMapsItem {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid #385746;
          border-radius: 8px;
          padding: 12px;
          background: #0b1912;
        }
        .adminMapsItem div {
          display: grid;
          gap: 4px;
        }
        .adminMapsItem span {
          color: #a8cdb7;
          font-size: 12px;
        }
        .adminMapsActions {
          display: flex !important;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        @media (max-width: 820px) {
          .adminMapsHeader,
          .adminMapsGrid,
          .adminMapsPair {
            grid-template-columns: 1fr;
          }
          .adminMapsHeader {
            display: grid;
          }
          nav {
            justify-content: flex-start;
          }
        }
      `}</style>
    </main>
  );
}
