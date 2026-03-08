import HomeClient from "./home-client";
import imsaImages from "@/data/imsa-images.json";
import f1Images from "@/data/f1-images.json";

export const dynamic = "force-dynamic"; // re-pick on refresh

const IMSA_ALBUMS = [
  { title: "Daytona 24 Hours - 2024", href: "/imsa/daytona", prefix: "imsa" },
  { title: "Sebring 12 Hours - 2023", href: "/imsa/sebring-12-hours-2023", prefix: "sebring2023-" },
];

const F1_ALBUMS = [
  { title: "Imola - 2024", href: "/f1/imola", prefix: "imola" },
  { title: "Monaco - 2024", href: "/f1/monaco-2024", prefix: "monaco" },
];

function selectByPrefix(images, prefix = "") {
  if (!prefix) return images.slice();
  const p = prefix.toLowerCase();
  return images.filter((name) => name.toLowerCase().startsWith(p));
}

function sampleUnique(arr, n) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function pickRandom(arr) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function Page() {
  const imsaAlbumPool = IMSA_ALBUMS.map((album) => ({
    ...album,
    images: selectByPrefix(imsaImages, album.prefix),
  })).filter((album) => album.images.length > 0);

  const f1AlbumPool = F1_ALBUMS.map((album) => ({
    ...album,
    images: selectByPrefix(f1Images, album.prefix),
  })).filter((album) => album.images.length > 0);

  const imsaAlbum = pickRandom(imsaAlbumPool) || {
    title: "IMSA",
    href: "/imsa",
    images: imsaImages.slice(),
  };

  const f1Album = pickRandom(f1AlbumPool) || {
    title: "F1",
    href: "/f1",
    images: f1Images.slice(),
  };

  const imsaAll = imsaAlbum.images;
  const f1All = f1Album.images;

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

  return (
    <HomeClient
      heroCards={heroCards}
      imsaFeatured={imsaFeatured}
      f1Featured={f1Featured}
      imsaAlbum={{ title: imsaAlbum.title, href: imsaAlbum.href }}
      f1Album={{ title: f1Album.title, href: f1Album.href }}
    />
  );
}
