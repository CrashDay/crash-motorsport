import SharedAlbumPage from "@/app/components/shared-album-page";

export default async function IMSASharedAlbumPage({ params }) {
  const awaitedParams = await params;
  return SharedAlbumPage({
    series: "imsa",
    slug: awaitedParams.slug,
    backHref: "/imsa",
    backLabel: "Back to IMSA",
  });
}
