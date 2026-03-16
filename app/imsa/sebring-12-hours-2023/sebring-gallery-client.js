"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AssignPhotoToArea from "@/app/components/assign-photo-to-area";

function getDisplayImageUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.hostname.toLowerCase() === "photos.adobe.io") {
      return `/api/remote-image?url=${encodeURIComponent(raw)}`;
    }
  } catch {
    // local path or invalid URL; return as-is
  }
  return raw;
}

export default function SebringGalleryClient({
  images,
  sharedAssets = [],
  title = "Sebring 12 Hours - 2023",
  emptyMessage = "No sebring2023 images found in /public/photos/imsa.",
  basePath = "/photos/imsa",
  backHref = "/imsa",
  backLabel = "Back to IMSA",
  assetSeries = "imsa",
  assetYear = null,
  assetRace = "",
}) {
  const items = [
    ...images.map((name) => {
      const src = `${basePath}/${name}`;
      return {
        id: `${assetSeries}:${name}`,
        name,
        thumbUrl: src,
        fullUrl: src,
        year: assetYear,
        race: assetRace,
      };
    }),
    ...sharedAssets.map((asset) => ({
      id: String(asset?.id || ""),
      name: String(asset?.name || asset?.id || "Shared album photo"),
      thumbUrl: String(asset?.thumbUrl || asset?.fullUrl || "").trim(),
      fullUrl: String(asset?.fullUrl || asset?.thumbUrl || "").trim(),
      year: asset?.year ?? assetYear,
      race: asset?.race || assetRace,
    })),
  ].filter((item) => item.id && item.thumbUrl && item.fullUrl);
  const [openIndex, setOpenIndex] = useState(null);
  const isOpen = openIndex !== null;

  function close() {
    setOpenIndex(null);
  }

  function prev() {
    setOpenIndex((i) => {
      if (i === null || !items.length) return i;
      return (i - 1 + items.length) % items.length;
    });
  }

  function next() {
    setOpenIndex((i) => {
      if (i === null || !items.length) return i;
      return (i + 1) % items.length;
    });
  }

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
  }, [isOpen]);

  const activeItem = openIndex !== null ? items[openIndex] : null;
  const activeName = activeItem?.name || null;
  const activeSrc = activeItem?.fullUrl || null;
  const activeAsset = activeItem
    ? {
        id: activeItem.id,
        name: activeItem.name,
        thumbUrl: activeItem.thumbUrl,
        fullUrl: activeItem.fullUrl,
        year: activeItem.year,
        race: activeItem.race,
      }
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: "system-ui" }}>
      <nav style={{ display: "flex", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #222" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "#fff" }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <span style={{ fontSize: "clamp(22px, 3.4vw, 42px)", fontWeight: 900, letterSpacing: 0.2 }}>
              CrashDayPics
            </span>
            <span style={{ marginTop: 4, fontSize: "clamp(10px, 1vw, 13px)", color: "#aaa", letterSpacing: 1 }}>
              Mapped by corner, light and speed.
            </span>
          </div>
        </Link>
        <Link href={backHref} style={{ color: "#bbb", textDecoration: "none" }}>
          &larr; {backLabel}
        </Link>
      </nav>

      <section style={{ padding: "28px 24px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>{title}</h1>
        <p style={{ color: "#aaa", marginTop: 8, maxWidth: 760 }}>
          Click any image to open full-screen. Use &larr; &rarr; to navigate, Esc to close.
        </p>

        {items.length ? (
          <div className="galleryGrid">
            {items.map((item, idx) => (
              <button
                key={item.id}
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
                aria-label={`Open ${item.name}`}
              >
                <img
                  src={getDisplayImageUrl(item.thumbUrl)}
                  alt={item.name}
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
        ) : (
          <div style={{ color: "#888", marginTop: 16 }}>
            {emptyMessage}
          </div>
        )}
      </section>

      {isOpen && (
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
              {openIndex + 1} / {items.length} - {activeName}
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
                Close
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
            title="Previous"
          >
            &larr;
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
            title="Next"
          >
            &rarr;
          </button>

          <img
            src={getDisplayImageUrl(activeSrc)}
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
