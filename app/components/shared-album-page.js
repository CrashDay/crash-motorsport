import { notFound, redirect } from "next/navigation";
import SebringGalleryClient from "@/app/imsa/sebring-12-hours-2023/sebring-gallery-client";
import { findCanonicalSharedAlbumSlug, loadSharedAlbum, loadSharedAlbums } from "@/lib/shared-albums";

export default async function SharedAlbumPage({ series, slug, backHref, backLabel }) {
  const canonicalSlug = findCanonicalSharedAlbumSlug(await loadSharedAlbums(series), slug);
  if (canonicalSlug) {
    redirect(`${backHref}/albums/${canonicalSlug}`);
  }

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
