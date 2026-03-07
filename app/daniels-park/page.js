import fs from "fs";
import path from "path";
import { readGpsFromExiftool } from "@/lib/exiftool-gps";

import DanielsParkPageClient from "./daniels-park-page-client";

const IMAGE_EXT_RE = /\.(jpe?g|png|webp)$/i;
const GROUP_TOLERANCE = 0.00015; // ~16m latitude tolerance

function listImageFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((name) => IMAGE_EXT_RE.test(name));
  } catch {
    return [];
  }
}

function groupNearbyPhotos(photoPoints) {
  const groups = [];

  for (const photo of photoPoints) {
    const existing = groups.find(
      (g) =>
        Math.abs(g.lat - photo.lat) <= GROUP_TOLERANCE &&
        Math.abs(g.lng - photo.lng) <= GROUP_TOLERANCE
    );

    if (existing) {
      existing.photos.push(photo.photo);
      const n = existing.photos.length;
      existing.lat = (existing.lat * (n - 1) + photo.lat) / n;
      existing.lng = (existing.lng * (n - 1) + photo.lng) / n;
      continue;
    }

    groups.push({
      id: `dp-${groups.length + 1}`,
      lat: photo.lat,
      lng: photo.lng,
      photos: [photo.photo],
    });
  }

  return groups;
}

function loadDanielsPhotoMarkers() {
  const photosDir = path.join(process.cwd(), "public", "photos", "daniels_park");
  const fileNames = listImageFiles(photosDir);

  const withGps = [];

  for (const fileName of fileNames) {
    const abs = path.join(photosDir, fileName);
    const gps = readGpsFromExiftool(abs);
    const lat = Number(gps?.lat);
    const lng = Number(gps?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    withGps.push({
      lat,
      lng,
      photo: {
        id: `daniels_park:${fileName}`,
        name: fileName,
        thumbUrl: `/photos/daniels_park/${fileName}`,
        fullUrl: `/photos/daniels_park/${fileName}`,
      },
    });
  }

  return groupNearbyPhotos(withGps);
}

function loadMapGeoJson() {
  const file = path.join(process.cwd(), "public", "maps", "daniels-park.geojson");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export default function Page() {
  const [mapGeoJson, photoMarkers] = [loadMapGeoJson(), loadDanielsPhotoMarkers()];

  return <DanielsParkPageClient mapGeoJson={mapGeoJson} photoMarkers={photoMarkers} />;
}
