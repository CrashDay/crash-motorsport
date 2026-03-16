import SharedAlbumPage from "@/app/components/shared-album-page";

export const dynamic = "force-dynamic";

export default async function F1SharedAlbumPage({ params }) {
  const awaitedParams = await params;
  return SharedAlbumPage({
    series: "f1",
    slug: awaitedParams.slug,
    backHref: "/f1",
    backLabel: "Back to F1",
  });
}
