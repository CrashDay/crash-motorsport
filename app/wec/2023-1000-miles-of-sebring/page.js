import fs from "fs";
import path from "path";
import SebringGalleryClient from "@/app/imsa/sebring-12-hours-2023/sebring-gallery-client";

function listWecSebringImages() {
  const absDir = path.join(process.cwd(), "public", "photos", "wec_1000");
  let files = [];
  try {
    files = fs.readdirSync(absDir);
  } catch {
    return [];
  }

  return files
    .filter((f) => {
      const lower = f.toLowerCase();
      return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp");
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

export default function WECSebring2023Page() {
  const images = listWecSebringImages();
  return (
    <SebringGalleryClient
      images={images}
      title="2023 WEC 1000 Miles of Sebring"
      emptyMessage="No WEC Sebring images found in /public/photos/wec_1000."
      basePath="/photos/wec_1000"
      backHref="/wec"
      backLabel="Back to WEC"
      assetSeries="wec"
      assetYear={2023}
      assetRace="1000 Miles of Sebring"
    />
  );
}
