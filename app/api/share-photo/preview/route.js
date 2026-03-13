import { NextResponse } from "next/server";

const ALLOWED_HOSTS = ["adobe.ly", "lightroom.adobe.com"];
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="100%" height="100%" fill="#0f172a"/><rect x="32" y="32" width="1136" height="611" rx="24" fill="#111827" stroke="#334155"/><text x="600" y="302" fill="#e2e8f0" font-family="Arial, sans-serif" font-size="44" text-anchor="middle" font-weight="700">Lightroom Shared Link</text><text x="600" y="354" fill="#94a3b8" font-family="Arial, sans-serif" font-size="28" text-anchor="middle">Preview unavailable</text></svg>`;

function isAllowedShareUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function extractMetaImage(html) {
  const patterns = [
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
    /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i,
    /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
    /<meta\s+content=["']([^"']+)["']\s+name=["']twitter:image["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const candidate = String(match?.[1] || "").trim().replaceAll("&amp;", "&");
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.toString();
    } catch {
      // ignore invalid URLs
    }
  }
  return "";
}

function fallbackImageResponse() {
  return new NextResponse(FALLBACK_SVG, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

async function fetchAsImage(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CrashDayPics/1.0; +https://crashdaypics.com)",
      Accept: "text/html,application/xhtml+xml,image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  if (contentType.startsWith("image/")) {
    const bytes = await res.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType || "image/jpeg",
        "Cache-Control": "public, max-age=600",
      },
    });
  }
  const html = await res.text();
  const imageUrl = extractMetaImage(html);
  if (!imageUrl) return null;

  const imgRes = await fetch(imageUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CrashDayPics/1.0; +https://crashdaypics.com)",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
    cache: "no-store",
  });
  if (!imgRes.ok) return null;

  const imgType = String(imgRes.headers.get("content-type") || "").toLowerCase();
  const imgBytes = await imgRes.arrayBuffer();
  return new NextResponse(imgBytes, {
    status: 200,
    headers: {
      "Content-Type": imgType.startsWith("image/") ? imgType : "image/jpeg",
      "Cache-Control": "public, max-age=600",
    },
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = String(searchParams.get("url") || "").trim();
  if (!rawUrl || !isAllowedShareUrl(rawUrl)) {
    return fallbackImageResponse();
  }
  try {
    const proxied = await fetchAsImage(rawUrl);
    return proxied || fallbackImageResponse();
  } catch {
    return fallbackImageResponse();
  }
}
