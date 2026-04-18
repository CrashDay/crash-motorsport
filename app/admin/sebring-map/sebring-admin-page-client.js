"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const SebringMapView = dynamic(
  () => import("@/app/sebring-map/sebring-leaflet").then((mod) => mod.SebringMapView),
  {
    ssr: false,
  }
);

export default function SebringAdminPageClient() {
  return (
    <>
      <Link
        href="/admin/maps"
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 30000,
          background: "rgba(8,14,26,0.9)",
          border: "1px solid rgba(137,179,255,0.35)",
          borderRadius: 8,
          color: "#fff",
          padding: "8px 10px",
          textDecoration: "none",
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        Manage maps
      </Link>
      <SebringMapView showTrackTools />
    </>
  );
}
