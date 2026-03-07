"use client";

import { useEffect, useMemo, useState } from "react";

export default function IMSADaytona() {
  const images = useMemo(
  () => Array.from({ length: 16 }, (_, i) => `imsa${i + 2}.jpg`),
  []
);

  const [openIndex, setOpenIndex] = useState(null);

  const isOpen = openIndex !== null;

  function close() {
    setOpenIndex(null);
  }

  function prev() {
    setOpenIndex((i) => {
      if (i === null) return i;
      return (i - 1 + images.length) % images.length;
    });
  }

  function next() {
    setOpenIndex((i) => {
      if (i === null) return i;
      return (i + 1) % images.length;
    });
  }

  // Keyboard controls: Esc closes, arrows navigate
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };

    window.addEventListener("keydown", onKeyDown);
    // Prevent background scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const activeName = openIndex !== null ? images[openIndex] : null;
  const activeSrc = activeName ? `/photos/imsa/${activeName}` : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "#fff",
        fontFamily: "system-ui",
      }}
    >
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid #222",
        }}
      >
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
        <a href="/imsa" style={{ color: "#bbb", textDecoration: "none" }}>
          ← Back to IMSA
        </a>
      </nav>

      <section style={{ padding: "28px 24px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Daytona 24 Hours - 2024</h1>
        <p style={{ color: "#aaa", marginTop: 8, maxWidth: 760 }}>
          Click any image to open full-screen. Use ← → to navigate, Esc to close.
        </p>

        <div className="galleryGrid">
          {images.map((name, idx) => (
            <button
              key={name}
              type="button"
              onClick={() => setOpenIndex(idx)}
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
                style={{
                  width: "100%",
                  height: "auto",
                  aspectRatio: "4 / 3",
                  objectFit: "cover",
                  display: "block",
                }}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </section>

      {/* LIGHTBOX */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image viewer"
          onMouseDown={(e) => {
            // click backdrop closes; clicking on the image/controls should not
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
          {/* Top bar */}
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
              {openIndex + 1} / {images.length} — {activeName}
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

          {/* Prev button */}
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

          {/* Next button */}
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

          {/* Image */}
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
