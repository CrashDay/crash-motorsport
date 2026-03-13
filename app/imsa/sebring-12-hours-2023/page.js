import fs from "fs";
import path from "path";
import SebringGalleryClient from "./sebring-gallery-client";

function listSebring2023Images() {
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
      return lower.startsWith("sebring2023-") && (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp"));
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

export default function IMSASebring2023Page() {
  const images = listSebring2023Images();
  return (
    <SebringGalleryClient
      images={images}
      title="Sebring 12 Hours - 2023"
      emptyMessage="No sebring2023 images found in /public/photos/imsa."
    />
  );
}
