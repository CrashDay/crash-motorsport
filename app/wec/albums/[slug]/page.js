import SharedAlbumPage from "@/app/components/shared-album-page";

export default async function WECSharedAlbumPage({ params }) {
  const awaitedParams = await params;
  return SharedAlbumPage({
    series: "wec",
    slug: awaitedParams.slug,
    backHref: "/wec",
    backLabel: "Back to WEC",
  });
}
