import { NextResponse } from "next/server";
import { isValidSharedAlbumSeries, loadSharedAlbum } from "@/lib/shared-albums";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request, { params }) {
  const awaitedParams = await params;
  const series = String(awaitedParams?.series || "").trim().toLowerCase();
  const slug = String(awaitedParams?.slug || "").trim();

  if (!series || !isValidSharedAlbumSeries(series)) {
    return NextResponse.json({ error: "Invalid series" }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const album = await loadSharedAlbum(series, slug);
  if (!album) {
    return NextResponse.json({ error: "Album not found" }, { status: 404 });
  }

  return NextResponse.json({
    album: {
      albumKey: album.albumKey,
      series: album.series,
      slug: album.slug,
      title: album.title,
      year: album.year,
      race: album.race,
      coverThumbUrl: album.coverThumbUrl,
      createdAt: album.createdAt,
      updatedAt: album.updatedAt,
      assets: album.assets,
    },
  });
}
