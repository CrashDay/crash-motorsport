"use client";

import dynamic from "next/dynamic";

const SebringMapView = dynamic(
  () => import("@/app/sebring-map/sebring-leaflet").then((mod) => mod.SebringMapView),
  {
    ssr: false,
  }
);

export default function SebringAdminPageClient() {
  return <SebringMapView showTrackTools />;
}
