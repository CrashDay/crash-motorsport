import fs from "fs";
import path from "path";
import HomeClient from "./home-client";

export const dynamic = "force-dynamic"; // re-pick on refresh

function listImages(relDir) {
  const absDir = path.join(process.cwd(), "public", relDir);
  let files = [];
  try {
    files = fs.readdirSync(absDir);
  } catch {
    return [];
  }
  return files
    .filter((f) => {
      const lower = f.toLowerCase();
      return (
        !lower.startsWith(".") &&
        !lower.includes("ds_store") &&
        (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp"))
      );
    })
    .sort();
}

function sampleUnique(arr, n) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

export default function Page() {
  const imsaAll = listImages("photos/imsa");
  const f1All = listImages("photos/f1");

  // HERO: mix IMSA + F1
  const heroCards = [];
  const heroIMSA = sampleUnique(imsaAll, 2);
  const heroF1 = sampleUnique(f1All, 1);

  heroIMSA.forEach((file) => heroCards.push({ series: "imsa", file }));
  heroF1.forEach((file) => heroCards.push({ series: "f1", file }));

  // If we don't have enough, fill from whatever exists
  while (heroCards.length < 3) {
    const pool = imsaAll.length ? "imsa" : f1All.length ? "f1" : null;
    if (!pool) break;
    const file = pool === "imsa" ? imsaAll[Math.floor(Math.random() * imsaAll.length)] : f1All[Math.floor(Math.random() * f1All.length)];
    heroCards.push({ series: pool, file });
  }

  // Featured sections
  const imsaFeatured = sampleUnique(imsaAll, 24); // homepage uses first 12
  const f1Featured = sampleUnique(f1All, 24);     // homepage uses first 12

  return <HomeClient heroCards={heroCards} imsaFeatured={imsaFeatured} f1Featured={f1Featured} />;
}