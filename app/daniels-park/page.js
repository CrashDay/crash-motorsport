import DanielsParkPageClient from "./daniels-park-page-client";
import photoMarkers from "@/data/daniels-photo-markers.json";

export default function Page() {
  return <DanielsParkPageClient mapGeoJson={null} photoMarkers={photoMarkers} />;
}
