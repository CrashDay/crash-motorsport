import { NextResponse } from "next/server";
import { loadSharedAlbums, isValidSharedAlbumSeries } from "@/lib/shared-albums";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request, { params }) {
  const awaitedParams = await params;
  const series = String(awaitedParams?.series || "").trim().toLowerCase();

  if (!series || !isValidSharedAlbumSeries(series)) {
    return NextResponse.json({ error: "Invalid series" }, { status: 400 });
  }

  try {
    const albums = await loadSharedAlbums(series);
    return NextResponse.json({
      series,
      albums: albums.map((album) => ({
        albumKey: album.albumKey,
        slug: album.slug,
        title: album.title,
        year: album.year,
        race: album.race,
        photoCount: album.photoCount,
        createdAt: album.createdAt,
        updatedAt: album.updatedAt,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 503 });
  }
}
