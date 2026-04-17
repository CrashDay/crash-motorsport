"use client";

import dynamic from "next/dynamic";

const PhotoMapClient = dynamic(() => import("@/app/components/photo-map-client"), {
  ssr: false,
});

export default function MapPageClient(props) {
  return <PhotoMapClient {...props} />;
}
