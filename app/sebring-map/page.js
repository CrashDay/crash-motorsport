"use client";

import dynamic from "next/dynamic";

const SebringLeaflet = dynamic(() => import("./sebring-leaflet"), { ssr: false });

export default function Page() {
  return <SebringLeaflet />;
}