import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { getMapPageConfig, getMapPageConfigs } from "@/lib/map-page-configs";
import MapPageClient from "./map-page-client";

export const dynamic = "force-dynamic";

function readJson(relativePath) {
  if (!relativePath) return null;
  const filePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function generateStaticParams() {
  return getMapPageConfigs().map((config) => ({ trackId: config.id }));
}

export default async function Page({ params }) {
  const { trackId } = await params;
  const config = getMapPageConfig(trackId);
  if (!config) notFound();

  const mapGeoJson = readJson(config.geoJsonPath);
  const photoMarkers = readJson(config.photoMarkersPath) || [];

  return (
    <MapPageClient
      title={config.title}
      trackId={config.id}
      center={config.center}
      zoom={config.zoom}
      mapGeoJson={mapGeoJson}
      photoMarkers={photoMarkers}
      loadPins={config.loadPins}
    />
  );
}
