import { notFound } from "next/navigation";
import { getMapPageConfigs } from "@/lib/map-page-configs";
import { loadMapPage } from "@/lib/map-pages";
import MapPageClient from "./map-page-client";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return getMapPageConfigs().map((config) => ({ trackId: config.id }));
}

export default async function Page({ params }) {
  const { trackId } = await params;
  const config = await loadMapPage(trackId);
  if (!config) notFound();

  return (
    <MapPageClient
      title={config.title}
      trackId={config.id}
      center={config.center}
      zoom={config.zoom}
      mapGeoJson={config.mapGeoJson}
      photoMarkers={config.photoMarkers}
      loadPins={config.loadPins}
    />
  );
}
