import { redirect, notFound } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { loadMapPage } from "@/lib/map-pages";
import MapToolsClient from "./map-tools-client";

export const dynamic = "force-dynamic";

export default async function Page({ params }) {
  if (!(await isAdminAuthenticated())) {
    const awaitedParams = await params;
    redirect(`/admin/login?next=/admin/maps/${encodeURIComponent(awaitedParams?.trackId || "")}`);
  }

  const { trackId } = await params;
  const config = await loadMapPage(trackId);
  if (!config) notFound();

  return (
    <MapToolsClient
      title={config.title}
      trackId={config.id}
      center={config.center}
      zoom={config.zoom}
      geoJsonUrl={`/maps/${config.id}.geojson`}
      mapGeoJson={config.mapGeoJson}
    />
  );
}
