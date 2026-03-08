"use client";

import { useEffect, useMemo, useState } from "react";
import AssignPhotoToArea from "@/app/components/assign-photo-to-area";

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
      "imola18.jpg",
      "imola19.jpg",
      "imola20.jpg",
      "imola21.jpg",
      "imola22.jpg",
      "imola23.jpg",
      "imola24.jpg",
      "imola25.jpg",
      "imola26.jpg",
      "imola27.jpg",
      "imola28.jpg",
      "imola29.jpg",
      "imola30.jpg",
      "imola31.jpg",
      "imola32.jpg",
      "imola33.jpg",
      "imola34.jpg",
      "imola35.jpg",
      "imola36.jpg",
      "imola37.jpg",
      "imola38.jpg",
      "imola39.jpg",
      "imola40.jpg",
      "imola41.jpg",
      "imola42.jpg",
      "imola43.jpg",
      "imola44.jpg",
      "imola45.jpg",
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
  const activeAsset = activeName
    ? { id: `f1:${activeName}`, name: activeName, thumbUrl: activeSrc, fullUrl: activeSrc }
    : null;

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
        <a href="/f1" style={{ color: "#bbb", textDecoration: "none" }}>
          &lt;- Back to F1
        </a>
      </nav>

      <section style={{ padding: "28px 24px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Imola - 2024</h1>

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
              {openIndex + 1} / {images.length} - {activeName}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {activeAsset ? <AssignPhotoToArea asset={activeAsset} /> : null}
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
                Close X
              </button>
            </div>
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
            title="Previous (<-)"
          >
            &lt;-
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
            title="Next (->)"
          >
            -&gt;
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
