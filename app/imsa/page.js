import fs from "fs";
import path from "path";
import Link from "next/link";
import lightroomImageUrl from "@/lib/lightroom-image-url";
import { loadSharedAlbums } from "@/lib/shared-albums";

const { normalizeLightroomImageUrl, toRemoteImageProxyUrl } = lightroomImageUrl;

export const dynamic = "force-dynamic";

function listAllImsaImages() {
  const absDir = path.join(process.cwd(), "public", "photos", "imsa");
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

function listImages(prefix = "") {
  const files = listAllImsaImages();
  if (!prefix) return files;
  const p = prefix.toLowerCase();
  return files.filter((f) => f.toLowerCase().startsWith(p));
}

function pickRandomImage(prefix = "") {
  const images = listImages(prefix);
  if (!images.length) return null;
  const pick = images[Math.floor(Math.random() * images.length)];
  return `/photos/imsa/${pick}`;
}

function toCardImage(url) {
  return toRemoteImageProxyUrl(normalizeLightroomImageUrl(url));
}

export default async function IMSAIndex() {
  const daytonaImages = listImages("imsa");
  const daytonaCoverSrc = pickRandomImage("imsa");
  const sebring2023Images = listImages("sebring2023-");
  const sebringCoverSrc = pickRandomImage("sebring2023");
  const sebring2022Images = listImages("sebring_2022-");
  const sebring2022CoverSrc = pickRandomImage("sebring_2022-");
  const sharedAlbums = await loadSharedAlbums("imsa");

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
          <a href="/imsa" style={{ color: "#fff", textDecoration: "none" }}>IMSA</a>
          <a href="/f1" style={{ color: "#bbb", textDecoration: "none" }}>F1</a>
          <details style={{ position: "relative" }}>
            <summary style={{ cursor: "pointer", color: "#bbb", listStyle: "none" }}>
              Maps
            </summary>
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, minWidth: 260, background: "#0f1724", border: "1px solid #22304a", borderRadius: 10, padding: "8px 0", boxShadow: "0 12px 28px rgba(0,0,0,0.5)", zIndex: 1000 }}>
              <a style={{ display: "block", color: "#dfe8ff", textDecoration: "none", padding: "10px 12px", letterSpacing: 0.3, textTransform: "none", fontSize: 13 }} href="/sebring-map">
                Sebring International Raceway
              </a>
              <a style={{ display: "block", color: "#dfe8ff", textDecoration: "none", padding: "10px 12px", letterSpacing: 0.3, textTransform: "none", fontSize: 13 }} href="/daniels-park">
                Daniels Park
              </a>
            </div>
          </details>
        </div>
      </nav>

      <section style={{ padding: "28px 24px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>IMSA</h1>
        <p style={{ color: "#aaa", marginTop: 8 }}>Motion-first trackside work from IMSA events.</p>

        <div style={{ marginTop: 24, display: "flex", gap: 20, flexWrap: "wrap" }}>
          <a href="/imsa/daytona" style={{ textDecoration: "none", color: "#fff" }}>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 18, overflow: "hidden", width: 320 }}>
              {daytonaCoverSrc ? (
                <img
                  src={daytonaCoverSrc}
                  alt="Random Daytona cover"
                  style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ height: 180, background: "#222", display: "flex", alignItems: "center", justifyContent: "center", color: "#777" }}>
                  Add images to /public/photos/imsa
                </div>
              )}

              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 800 }}>Daytona 24 Hours - 2024</div>
                <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                  {daytonaImages.length ? `${daytonaImages.length} photos` : "View gallery -&gt;"}
                </div>
              </div>
            </div>
          </a>

          <a href="/imsa/sebring-12-hours-2023" style={{ textDecoration: "none", color: "#fff" }}>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 18, overflow: "hidden", width: 320 }}>
              {sebringCoverSrc ? (
                <img
                  src={sebringCoverSrc}
                  alt="Sebring 12 Hours 2023 cover"
                  style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ height: 180, background: "#222", display: "flex", alignItems: "center", justifyContent: "center", color: "#777" }}>
                  Add sebring2023 images to /public/photos/imsa
                </div>
              )}

              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 800 }}>Sebring 12 Hours - 2023</div>
                <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                  {sebring2023Images.length ? `${sebring2023Images.length} photos` : "View gallery -&gt;"}
                </div>
              </div>
            </div>
          </a>

          <a href="/imsa/sebring-12-hours-2022" style={{ textDecoration: "none", color: "#fff" }}>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 18, overflow: "hidden", width: 320 }}>
              {sebring2022CoverSrc ? (
                <img
                  src={sebring2022CoverSrc}
                  alt="Sebring 12 Hours 2022 cover"
                  style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ height: 180, background: "#222", display: "flex", alignItems: "center", justifyContent: "center", color: "#777" }}>
                  Add sebring_2022 images to /public/photos/imsa
                </div>
              )}

              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 800 }}>Sebring 12 Hours - 2022</div>
                <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                  {sebring2022Images.length ? `${sebring2022Images.length} photos` : "View gallery -&gt;"}
                </div>
              </div>
            </div>
          </a>

          {sharedAlbums.map((album) => (
            <a key={album.albumKey} href={`/imsa/albums/${album.slug}`} style={{ textDecoration: "none", color: "#fff" }}>
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
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
