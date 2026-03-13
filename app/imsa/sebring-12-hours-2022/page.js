import fs from "fs";
import path from "path";
import SebringGalleryClient from "../sebring-12-hours-2023/sebring-gallery-client";

function listSebring2022Images() {
  const absDir = path.join(process.cwd(), "public", "photos", "imsa");
  let files = [];
  try {
    files = fs.readdirSync(absDir);
  } catch {
    return [];
  }

  return files
    .filter((f) => {
      const lower = f.toLowerCase();
      return lower.startsWith("sebring_2022-") && (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp"));
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

export default function IMSASebring2022Page() {
  const images = listSebring2022Images();
  return (
    <SebringGalleryClient
      images={images}
      title="Sebring 12 Hours - 2022"
      emptyMessage="No sebring_2022 images found in /public/photos/imsa."
    />
  );
}
