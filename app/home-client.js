"use client";

import { useEffect, useMemo, useState } from "react";

export default function HomeClient({ heroCards, imsaFeatured, f1Featured, imsaAlbum, f1Album }) {
  // viewer lists
  const imsaList = useMemo(() => imsaFeatured || [], [imsaFeatured]);
  const f1List = useMemo(() => f1Featured || [], [f1Featured]);

  // lightbox state: one viewer, two modes
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer.open]);

  const openFromHero = (card) => {
    if (card.series === "imsa") {
      const idx = imsaList.indexOf(card.file);
      setViewer({ open: true, series: "imsa", index: Math.max(0, idx) });
    } else {
      const idx = f1List.indexOf(card.file);
      setViewer({ open: true, series: "f1", index: Math.max(0, idx) });
    }
  };

  const openFromGrid = (series, file) => {
    const list = series === "imsa" ? imsaList : f1List;
    const idx = list.indexOf(file);
    setViewer({ open: true, series, index: Math.max(0, idx) });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: "system-ui" }}>
      {/* Simple responsive CSS (no external files needed) */}
      <style jsx global>{`
        .navWrap {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 18px; /* tight padding = no “giant black header” */
          border-bottom: 1px solid #222;
          gap: 14px;
        }

        .navLinks {
          display: flex;
          gap: 18px;
          font-size: 12px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #bbb;
          white-space: nowrap;
        }
        .mapsMenu {
          position: relative;
          display: inline-block;
        }
        .mapsButton {
          color: #bbb;
          text-decoration: none;
          background: transparent;
          border: 0;
          padding: 0;
          font: inherit;
          letter-spacing: inherit;
          text-transform: inherit;
          cursor: pointer;
        }
        .mapsDropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 260px;
          background: #0f1724;
          border: 1px solid #22304a;
          border-radius: 10px;
          padding: 8px 0;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
          opacity: 0;
          visibility: hidden;
          transform: translateY(-4px);
          transition: opacity 120ms ease, transform 120ms ease, visibility 120ms ease;
          z-index: 1000;
        }
        .mapsMenu:hover .mapsDropdown,
        .mapsMenu:focus-within .mapsDropdown {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }
        .mapsItem {
          display: block;
          color: #dfe8ff;
          text-decoration: none;
          padding: 10px 12px;
          letter-spacing: 0.3px;
          text-transform: none;
          font-size: 13px;
        }
        .mapsItem:hover {
          background: rgba(128, 168, 255, 0.12);
        }

        .heroGrid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .featuredGrid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        @media (max-width: 900px) {
          .heroGrid {
            grid-template-columns: 1fr;
          }
          .heroImg {
            height: 260px !important;
          }
        }

        @media (max-width: 700px) {
          .navWrap {
            padding: 8px 12px;
          }
          .navLinks {
            gap: 14px;
            letter-spacing: 2px;
            font-size: 11px;
            flex-wrap: wrap;
            justify-content: flex-end;
          }
          .featuredGrid {
            grid-template-columns: repeat(2, 1fr);
          }
          .thumbImg {
            height: 150px !important;
          }
        }

        @media (max-width: 420px) {
          .thumbImg {
            height: 135px !important;
          }
        }
      `}</style>

      <nav className="navWrap">
        {/* BIG logo, tight header */}
        <a href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "#fff" }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <span style={{ fontSize: "clamp(22px, 3.4vw, 42px)", fontWeight: 900, letterSpacing: 0.2 }}>
              CrashDayPics
            </span>
            <span style={{ marginTop: 4, fontSize: "clamp(10px, 1vw, 13px)", color: "#aaa", letterSpacing: 1 }}>
              Mapped by corner, light and speed.
            </span>
          </div>
        </a>

        <div className="navLinks">
          <a href="/" style={{ color: "#fff", textDecoration: "none" }}>
            Home
          </a>
          <a href="/imsa" style={{ color: "#bbb", textDecoration: "none" }}>
            IMSA
          </a>
          <a href="/f1" style={{ color: "#bbb", textDecoration: "none" }}>
            F1
          </a>
          <div className="mapsMenu">
            <button type="button" className="mapsButton" aria-haspopup="true">
              Maps
            </button>
            <div className="mapsDropdown">
              <a className="mapsItem" href="/sebring-map">
                Sebring International Raceway
              </a>
              <a className="mapsItem" href="/daniels-park">
                Daniels Park
              </a>
            </div>
          </div>
          <a href="/contact" style={{ color: "#bbb", textDecoration: "none" }}>
            Contact
          </a>
        </div>
      </nav>

      {/* HERO (mixed IMSA + F1) */}
      <section style={{ padding: "22px 18px" }}>
        <div className="heroGrid">
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
              aria-label={`Open hero image ${card.file}`}
            >
              <img
                src={card.series === "imsa" ? `/photos/imsa/${card.file}` : `/photos/f1/${card.file}`}
                alt={card.file}
                className="heroImg"
                style={{ width: "100%", height: 300, objectFit: "cover", display: "block" }}
              />
            </button>
          ))}
        </div>

        <h2 style={{ marginTop: 16, fontSize: 28, fontWeight: 800 }}>Professional Motorsports Photography</h2>
        <p style={{ marginTop: 8, maxWidth: 720, color: "#aaa" }}>
          IMSA and Formula 1 trackside action captured with precision motion and sponsor-forward composition.
        </p>
      </section>

      {/* IMSA FEATURED */}
      <section style={{ padding: "22px 18px", borderTop: "1px solid #222" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <a href="/imsa" style={{ textDecoration: "none", color: "#fff" }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
              IMSA - Featured ({imsaAlbum?.title || "Gallery"})
            </h3>
          </a>
          <a href={imsaAlbum?.href || "/imsa"} style={{ color: "#bbb", textDecoration: "none", fontSize: 13 }}>
            View full gallery →
          </a>
        </div>

        <div className="featuredGrid" style={{ marginTop: 14 }}>
          {imsaList.slice(0, 12).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => openFromGrid("imsa", name)}
              style={{
                padding: 0,
                border: "1px solid #222",
                borderRadius: 16,
                background: "transparent",
                cursor: "pointer",
                overflow: "hidden",
              }}
              aria-label={`Open ${name}`}
            >
              <img
                src={`/photos/imsa/${name}`}
                alt={name}
                className="thumbImg"
                style={{ width: "100%", height: 170, objectFit: "cover", display: "block" }}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </section>

      {/* F1 FEATURED */}
      <section style={{ padding: "22px 18px", borderTop: "1px solid #222" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <a href="/f1" style={{ textDecoration: "none", color: "#fff" }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
              Formula 1 - Featured ({f1Album?.title || "Gallery"})
            </h3>
          </a>
          <a href={f1Album?.href || "/f1"} style={{ color: "#bbb", textDecoration: "none", fontSize: 13 }}>
            View full gallery →
          </a>
        </div>

        <div className="featuredGrid" style={{ marginTop: 14 }}>
          {f1List.slice(0, 12).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => openFromGrid("f1", name)}
              style={{
                padding: 0,
                border: "1px solid #222",
                borderRadius: 16,
                background: "transparent",
                cursor: "pointer",
                overflow: "hidden",
              }}
              aria-label={`Open ${name}`}
            >
              <img
                src={`/photos/f1/${name}`}
                alt={name}
                className="thumbImg"
                style={{ width: "100%", height: 170, objectFit: "cover", display: "block" }}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </section>

      <footer style={{ padding: "18px 18px", borderTop: "1px solid #222", color: "#777", fontSize: 12, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>© 2026 CrashDayPics</div>
        <div style={{ display: "flex", gap: 14 }}>
          <a href="/privacy" style={{ color: "#777", textDecoration: "none" }}>Privacy Policy</a>
          <a href="/terms" style={{ color: "#777", textDecoration: "none" }}>Terms of Use</a>
        </div>
      </footer>

      {/* LIGHTBOX */}
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
