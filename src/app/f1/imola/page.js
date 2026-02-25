"use client";

import { useEffect, useMemo, useState } from "react";

export default function F1Imola() {
  // Files must be in: public/photos/f1/
  const images = useMemo(
    () => [
      "imola1.jpg",
      "imola2.jpg",
      "imola3.jpg",
      "imola4.jpg",
      "imola5.jpg",
      "imola6.jpg",
      "imola7.jpg",
      "imola8.jpg",
      "imola9.jpg",
      "imola10.jpg",
      "imola11.jpg",
      "imola12.jpg",
      "imola13.jpg",
      "imola14.jpg",
      "imola15.jpg",
      "imola16.jpg",
      "imola17.jpg",
    ],
    []
  );

  const [openIndex, setOpenIndex] = useState(null);
  const isOpen = openIndex !== null;

  const close = () => setOpenIndex(null);
  const prev = () =>
    setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length));
  const next = () =>
    setOpenIndex((i) => (i === null ? i : (i + 1) % images.length));

  useEffect(() => {
    if (!isOpen) return;

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
  }, [isOpen]);

  const activeName = openIndex !== null ? images[openIndex] : null;
  const activeSrc = activeName ? `/photos/f1/${activeName}` : null;

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
        <a
          href="/"
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#fff",
            textDecoration: "none",
          }}
        >
          Tony Day Motorsport
        </a>
        <a href="/f1" style={{ color: "#bbb", textDecoration: "none" }}>
          ← Back to F1
        </a>
      </nav>

      <section style={{ padding: "28px 24px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Imola</h1>

        {images.length === 0 ? (
          <p style={{ color: "#aaa", marginTop: 12 }}>
            No photos yet.
          </p>
        ) : (
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
                  src={`/photos/f1/${name}`}
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
        )}
      </section>

      {isOpen && images.length > 0 && (
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