"use client";

import dynamic from "next/dynamic";

const TrackMapView = dynamic(
  () => import("@/app/sebring-map/sebring-leaflet").then((mod) => mod.SebringMapView),
  {
    ssr: false,
  }
);

export default function MapPageClient(props) {
  return <TrackMapView showTrackTools={false} {...props} />;
}
