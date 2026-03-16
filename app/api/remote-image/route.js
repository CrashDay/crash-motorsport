import { NextResponse } from "next/server";

const ALLOWED_HOSTS = ["photos.adobe.io"];
const USER_AGENT = "Mozilla/5.0 (compatible; CrashDayPics/1.0; +https://crashdaypics.com)";

function isAllowedUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = String(searchParams.get("url") || "").trim();
  if (!rawUrl || !isAllowedUrl(rawUrl)) {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  try {
    const res = await fetch(rawUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Upstream HTTP ${res.status}` }, { status: 502 });
    }

    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    const bytes = await res.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType.startsWith("image/") ? contentType : "image/jpeg",
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image fetch failed" }, { status: 502 });
  }
}
