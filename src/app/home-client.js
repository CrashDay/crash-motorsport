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
      {/* BRAND HEADER (tightened padding) */}
      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          borderBottom: "1px solid #222",
          padding: "10px 12px 10px", // was huge; now tight
          gap: 6, // was 12; now tighter
        }}
      >
        <a href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img
  src="/branding/crashdaypics-logo.png"
  alt="CrashDayPics"
  style={{
    height: "clamp(80px, 18vw, 240px)",
    width: "auto",
    objectFit: "contain",
    display: "block",
    marginBottom: 4,
  }}
/>
        </a>

        <div
          style={{
            display: "flex",
            gap: 20,
            fontSize: 12,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#bbb",
            flexWrap: "wrap",
            justifyContent: "center",
            paddingBottom: 2, // keeps it snug
          }}
        >
          <a href="/" style={{ color: "#fff", textDecoration: "none" }}>
            Home
          </a>
          <a href="/imsa" style={{ color: "#bbb", textDecoration: "none" }}>
            IMSA
          </a>
          <a href="/f1" style={{ color: "#bbb", textDecoration: "none" }}>
            F1
          </a>
          <a href="/contact" style={{ color: "#bbb", textDecoration: "none" }}>
            Contact
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ padding: "22px 16px" }}>
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
              onClick={() => openFromHero(card)}
              style={{
                padding: 0,
                border: "1px solid #222",
                borderRadius: 18,
                background: "transparent",
                cursor: "pointer",
                overflow: "hidden",
              }}
              aria-label={`Open hero image ${card.file}`}
            >
              <img
                src={card.series === "imsa" ? `/photos/imsa/${card.file}` : `/photos/f1/${card.file}`}
                alt={card.file}
                style={{
                  width: "100%",
                  height: "clamp(180px, 30vw, 320px)",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </button>
          ))}
        </div>

        <h2 style={{ marginTop: 18, fontSize: 28, fontWeight: 800 }}>Professional Motorsports Photography</h2>
        <p style={{ marginTop: 8, maxWidth: 720, color: "#aaa" }}>
          IMSA and Formula 1 trackside action captured with precision motion and sponsor-forward composition.
        </p>
      </section>

      {/* IMSA FEATURED */}
      <section style={{ padding: "28px 16px", borderTop: "1px solid #222" }}>
        <h3 style={{ fontSize: 20, margin: 0 }}>IMSA – Featured (Daytona)</h3>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          {imsaList.slice(0, 12).map((name) => (
            <button
              key={name}
              onClick={() => openFromGrid("imsa", name)}
              style={{
                padding: 0,
                border: "1px solid #222",
                borderRadius: 16,
                overflow: "hidden",
                background: "transparent",
                cursor: "pointer",
              }}
              aria-label={`Open ${name}`}
            >
              <img
                src={`/photos/imsa/${name}`}
                alt={name}
                style={{
                  width: "100%",
                  height: "clamp(110px, 18vw, 190px)",
                  objectFit: "cover",
                  display: "block",
                }}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </section>

      {/* F1 FEATURED */}
      <section style={{ padding: "28px 16px", borderTop: "1px solid #222" }}>
        <h3 style={{ fontSize: 20, margin: 0 }}>Formula 1 – Featured (Imola)</h3>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          {f1List.slice(0, 12).map((name) => (
            <button
              key={name}
              onClick={() => openFromGrid("f1", name)}
              style={{
                padding: 0,
                border: "1px solid #222",
                borderRadius: 16,
                overflow: "hidden",
                background: "transparent",
                cursor: "pointer",
              }}
              aria-label={`Open ${name}`}
            >
              <img
                src={`/photos/f1/${name}`}
                alt={name}
                style={{
                  width: "100%",
                  height: "clamp(110px, 18vw, 190px)",
                  objectFit: "cover",
                  display: "block",
                }}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </section>

      {/* LIGHTBOX (unchanged) */}
      {viewer.open && activeList.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image viewer"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              right: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ color: "#bbb", fontSize: 13 }}>
              {viewer.index + 1} / {activeList.length} — {activeName}
            </div>

            <button
              type="button"
              onClick={close}
              style={{
                background: "#111",
                border: "1px solid #222",
                color: "#fff",
                padding: "10px 12px",
                borderRadius: 12,
                cursor: "pointer",
              }}
              aria-label="Close"
            >
              Close ✕
            </button>
          </div>

          <button
            type="button"
            onClick={prev}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              background: "#111",
              border: "1px solid #222",
              color: "#fff",
              padding: "12px 14px",
              borderRadius: 14,
              cursor: "pointer",
            }}
            aria-label="Previous image"
            title="Previous (←)"
          >
            ←
          </button>

          <button
            type="button"
            onClick={next}
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              background: "#111",
              border: "1px solid #222",
              color: "#fff",
              padding: "12px 14px",
              borderRadius: 14,
              cursor: "pointer",
            }}
            aria-label="Next image"
            title="Next (→)"
          >
            →
          </button>

          <img
            src={activeSrc}
            alt={activeName || "Selected image"}
            style={{
              maxWidth: "calc(100vw - 120px)",
              maxHeight: "calc(100vh - 120px)",
              width: "auto",
              height: "auto",
              borderRadius: 18,
              border: "1px solid #222",
              boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
              background: "#111",
            }}
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}