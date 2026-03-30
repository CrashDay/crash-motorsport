import fs from "fs";
import Link from "next/link";
import path from "path";
import lightroomImageUrl from "@/lib/lightroom-image-url";
import { loadSharedAlbums } from "@/lib/shared-albums";

const { normalizeLightroomImageUrl } = lightroomImageUrl;

export const dynamic = "force-dynamic";

function listWecImages() {
  const absDir = path.join(process.cwd(), "public", "photos", "wec_1000");
  let files = [];
  try {
    files = fs.readdirSync(absDir);
  } catch {
    return [];
  }
  return files
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function pickRandomImage(images) {
  if (!images.length) return null;
  const pick = images[Math.floor(Math.random() * images.length)];
  return `/photos/wec_1000/${pick}`;
}

function toCardImage(url) {
  return normalizeLightroomImageUrl(url);
}

export default async function WECIndexPage() {
  const sebringImages = listWecImages();
  const coverSrc = pickRandomImage(sebringImages);
  const sharedAlbums = await loadSharedAlbums("wec");

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: "system-ui" }}>
      <nav style={{ display: "flex", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #222" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "#fff" }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <span style={{ fontSize: "clamp(22px, 3.4vw, 42px)", fontWeight: 900, letterSpacing: 0.2 }}>
              CrashDayPics
            </span>
            <span style={{ marginTop: 4, fontSize: "clamp(10px, 1vw, 13px)", color: "#aaa", letterSpacing: 1 }}>
              Mapped by corner, light and speed.
            </span>
          </div>
        </Link>

        <div style={{ display: "flex", gap: 18, fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "#bbb", alignItems: "center" }}>
          <Link href="/" style={{ color: "#bbb", textDecoration: "none" }}>Home</Link>
          <Link href="/imsa" style={{ color: "#bbb", textDecoration: "none" }}>IMSA</Link>
          <Link href="/f1" style={{ color: "#bbb", textDecoration: "none" }}>F1</Link>
          <Link href="/wec" style={{ color: "#fff", textDecoration: "none" }}>WEC</Link>
        </div>
      </nav>

      <section style={{ padding: "28px 24px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>WEC</h1>
        <p style={{ color: "#aaa", marginTop: 8 }}>Endurance work from the FIA World Endurance Championship.</p>

        <div style={{ marginTop: 24, display: "flex", gap: 20, flexWrap: "wrap" }}>
          <Link href="/wec/2023-1000-miles-of-sebring" style={{ textDecoration: "none", color: "#fff" }}>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 18, overflow: "hidden", width: 320 }}>
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt="2023 WEC 1000 Miles of Sebring cover"
                  style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ height: 180, background: "#222", display: "flex", alignItems: "center", justifyContent: "center", color: "#777" }}>
                  Add images to /public/photos/wec_1000
                </div>
              )}

              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 800 }}>2023 WEC 1000 Miles of Sebring</div>
                <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                  {sebringImages.length ? `${sebringImages.length} photos` : "View gallery -&gt;"}
                </div>
              </div>
            </div>
          </Link>

          {sharedAlbums.map((album) => (
            <Link key={album.albumKey} href={`/wec/albums/${album.slug}`} style={{ textDecoration: "none", color: "#fff" }}>
              <div style={{ background: "#111", border: "1px solid #222", borderRadius: 18, overflow: "hidden", width: 320 }}>
                {album.coverFullUrl || album.coverThumbUrl ? (
                  <img
                    src={toCardImage(album.coverFullUrl || album.coverThumbUrl)}
                    alt={`${album.title} cover`}
                    style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div style={{ height: 180, background: "#222", display: "flex", alignItems: "center", justifyContent: "center", color: "#777" }}>
                    Shared album
                  </div>
                )}

                <div style={{ padding: 14 }}>
                  <div style={{ fontWeight: 800 }}>{album.title}</div>
                  <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                    {album.photoCount ? `${album.photoCount} photos` : "View gallery -&gt;"}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
