import { notFound } from "next/navigation";
import SebringGalleryClient from "@/app/imsa/sebring-12-hours-2023/sebring-gallery-client";
import { loadSharedAlbum } from "@/lib/shared-albums";

export default async function SharedAlbumPage({ series, slug, backHref, backLabel }) {
  const album = await loadSharedAlbum(series, slug);
  if (!album) notFound();

  return (
    <SebringGalleryClient
      images={[]}
      sharedAssets={album.assets}
      title={album.title}
      emptyMessage={`No shared album images found for ${album.title}.`}
      backHref={backHref}
      backLabel={backLabel}
      assetSeries={series}
      assetYear={album.year}
      assetRace={album.race || ""}
    />
  );
}
