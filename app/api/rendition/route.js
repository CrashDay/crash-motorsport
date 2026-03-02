import { getDb, getPhotoAsset } from "@/lib/db";
import { getRendition } from "@/lib/lightroom-client";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get("assetId");
  const size = searchParams.get("size") || "large";

  if (!assetId) {
    return new Response("assetId is required", { status: 400 });
  }

  const db = getDb();
  const asset = getPhotoAsset(db, assetId);
  if (!asset?.catalog_id) {
    return new Response("asset not found", { status: 404 });
  }

  let upstream;
  try {
    upstream = await getRendition(assetId, size, asset.catalog_id);
  } catch (e) {
    return new Response("not connected", { status: 401 });
  }
  if (!upstream.ok) {
    return new Response("rendition unavailable", { status: upstream.status });
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("cache-control", "private, max-age=60");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
