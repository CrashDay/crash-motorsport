"use client";

import dynamic from "next/dynamic";

const SebringMapView = dynamic(
  () => import("./sebring-leaflet").then((mod) => mod.SebringMapView),
  {
    ssr: false,
  }
);

export default function SebringPageClient() {
  return <SebringMapView showTrackTools={false} />;
}
