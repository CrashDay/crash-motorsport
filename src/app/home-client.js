"use client";

import { useEffect, useMemo, useState } from "react";

export default function HomeClient({ heroCards, imsaFeatured, f1Featured }) {
  const imsaList = useMemo(() => imsaFeatured || [], [imsaFeatured]);
  const f1List = useMemo(() => f1Featured || [], [f1Featured]);

  const [viewer, setViewer] = useState({ open: false, series: null, index: 0 });

  const activeList = viewer.series === "imsa" ? imsaList : f1List;
  const activeName = viewer.open ? activeList[viewer.index] : null;
  const activeSrc =
    viewer.open && activeName
      ? viewer.series === "imsa"
        ? `/photos/imsa/${activeName}`
        : `/photos/f1/${activeName}`
      : null;

  const close = () => setViewer({ open: false, series: null, index: 0 });

  const prev = () =>
    setViewer((v) => {
      if (!v.open) return v;
      const list = v.series === "imsa" ? imsaList : f1List;
      const len = list.length || 1;
      return { ...v, index: (v.index - 1 + len) % len };
    });

  const next = () =>
    setViewer((v) => {
      if (!v.open) return v;
      const list = v.series === "imsa" ? imsaList : f1List;
      const len = list.length || 1;
      return { ...v, index: (v.index + 1) % len };
    });

  useEffect(() => {
    if (!viewer.open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };

    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [viewer.open]);

  const openFromHero = (card) => {
    const list = card.series === "imsa" ? imsaList : f1List;
    const idx = list.indexOf(card.file);
    setViewer({ open: true, series: card.series, index: Math.max(0, idx) });
  };

  const openFromGrid = (series, file) => {
    const list = series === "imsa" ? imsaList : f1List;
    const idx = list.indexOf(file);
    setViewer({ open: true, series, index: Math.max(0, idx) });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: "system-ui" }}>
      
      {/* HEADER */}
      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "6px 12px 2px",
          borderBottom: "1px solid #222",
        }}
      >
        <a href="/" style={{ lineHeight: 0 }}>
          <img
            src="/branding/crashdaypics-logo.png"
            alt="CrashDayPics"
            style={{
              height: "clamp(80px, 18vw, 200px)",
              width: "auto",
              display: "block",
            }}
          />
        </a>

        <div
          style={{
            display: "flex",
            gap: 18,
            fontSize: 12,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#bbb",
            marginTop: 4,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <a href="/" style={{ color: "#fff", textDecoration: "none" }}>Home</a>
          <a href="/imsa" style={{ color: "#bbb", textDecoration: "none" }}>IMSA</a>
          <a href="/f1" style={{ color: "#bbb", textDecoration: "none" }}>F1</a>
          <a href="/contact" style={{ color: "#bbb", textDecoration: "none" }}>Contact</a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ padding: "20px 16px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          {heroCards.map((card, i) => (
            <button
              key={`${card.series}-${card.file}-${i}`}
              type="button"
              onClick={() => openFromHero(card)}
              style={{
                padding: 0,
                border: "1px solid #222",
                borderRadius: 18,
                background: "transparent",
                cursor: "pointer",
                overflow: "hidden",
              }}
            >
              <img
                src={card.series === "imsa" ? `/photos/imsa/${card.file}` : `/photos/f1/${card.file}`}
                alt={card.file}
                style={{
                  width: "100%",
                  height: "clamp(180px, 32vw, 280px)",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </button>
          ))}
        </div>

        <h2 style={{ marginTop: 14, fontSize: 26, fontWeight: 800 }}>
          Professional Motorsports Photography
        </h2>
        <p style={{ marginTop: 6, maxWidth: 720, color: "#aaa" }}>
          IMSA and Formula 1 trackside action captured with precision motion and sponsor-forward composition.
        </p>
      </section>

      {/* IMSA */}
      <section style={{ padding: "20px 16px", borderTop: "1px solid #222" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <a href="/imsa" style={{ textDecoration: "none", color: "#fff" }}>
            <h3 style={{ margin: 0 }}>IMSA – Featured (Daytona)</h3>
          </a>
          <a href="/imsa/daytona" style={{ color: "#bbb", fontSize: 13 }}>View full gallery →</a>
        </div>

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          {imsaList.slice(0, 12).map((name) => (
            <button key={name} type="button" onClick={() => openFromGrid("imsa", name)} style={{ padding: 0, border: "1px solid #222", borderRadius: 14, background: "transparent", overflow: "hidden" }}>
              <img src={`/photos/imsa/${name}`} alt={name} style={{ width: "100%", height: "clamp(120px, 22vw, 170px)", objectFit: "cover" }} />
            </button>
          ))}
        </div>
      </section>

      {/* F1 */}
      <section style={{ padding: "20px 16px", borderTop: "1px solid #222" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <a href="/f1" style={{ textDecoration: "none", color: "#fff" }}>
            <h3 style={{ margin: 0 }}>Formula 1 – Featured (Imola)</h3>
          </a>
          <a href="/f1/imola" style={{ color: "#bbb", fontSize: 13 }}>View full gallery →</a>
        </div>

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          {f1List.slice(0, 12).map((name) => (
            <button key={name} type="button" onClick={() => openFromGrid("f1", name)} style={{ padding: 0, border: "1px solid #222", borderRadius: 14, background: "transparent", overflow: "hidden" }}>
              <img src={`/photos/f1/${name}`} alt={name} style={{ width: "100%", height: "clamp(120px, 22vw, 170px)", objectFit: "cover" }} />
            </button>
          ))}
        </div>
      </section>

      <footer style={{ padding: "14px", borderTop: "1px solid #222", textAlign: "center", color: "#777", fontSize: 12 }}>
        © 2026 CrashDayPics
      </footer>
    </div>
  );
}