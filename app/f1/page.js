import f1Images from "@/data/f1-images.json";
import Link from "next/link";
import lightroomImageUrl from "@/lib/lightroom-image-url";
import { loadSharedAlbums } from "@/lib/shared-albums";

const { normalizeLightroomImageUrl } = lightroomImageUrl;

export const dynamic = "force-dynamic";

function listImages(prefix = "") {
  if (!prefix) return f1Images.slice();
  const p = prefix.toLowerCase();
  return f1Images.filter((f) => f.toLowerCase().startsWith(p));
}

function pickRandomImage(prefix = "") {
  const images = listImages(prefix);
  if (!images.length) return null;
  const pick = images[Math.floor(Math.random() * images.length)];
  return `/photos/f1/${pick}`;
}

function toCardImage(url) {
  return normalizeLightroomImageUrl(url);
}

export default async function F1Index() {
  const imolaImages = listImages("imola");
  const monacoImages = listImages("monaco");
  const imolaCoverSrc = pickRandomImage("imola");
  const monacoCoverSrc = pickRandomImage("monaco");
  const sharedAlbums = await loadSharedAlbums("f1");

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
          <a href="/imsa" style={{ color: "#bbb", textDecoration: "none" }}>IMSA</a>
          <a href="/f1" style={{ color: "#fff", textDecoration: "none" }}>F1</a>
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
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>F1</h1>
        <p style={{ color: "#aaa", marginTop: 8 }}>Motion-first trackside work from F1 events.</p>

        <div style={{ marginTop: 24, display: "flex", gap: 20, flexWrap: "wrap" }}>
          <a href="/f1/imola" style={{ textDecoration: "none", color: "#fff" }}>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 18, overflow: "hidden", width: 320 }}>
              {imolaCoverSrc ? (
                <img
                  src={imolaCoverSrc}
                  alt="Random Imola cover"
                  style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ height: 180, background: "#222", display: "flex", alignItems: "center", justifyContent: "center", color: "#777" }}>
                  Add images to /public/photos/f1
                </div>
              )}

              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 800 }}>Imola - 2024</div>
                <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                  {imolaImages.length ? `${imolaImages.length} photos` : "View gallery -&gt;"}
                </div>
              </div>
            </div>
          </a>

          <a href="/f1/monaco-2024" style={{ textDecoration: "none", color: "#fff" }}>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 18, overflow: "hidden", width: 320 }}>
              {monacoCoverSrc ? (
                <img
                  src={monacoCoverSrc}
                  alt="Random Monaco 2024 cover"
                  style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ height: 180, background: "#222", display: "flex", alignItems: "center", justifyContent: "center", color: "#777" }}>
                  Add Monaco images to /public/photos/f1
                </div>
              )}

              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 800 }}>Monaco - 2024</div>
                <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
                  {monacoImages.length ? `${monacoImages.length} photos` : "View gallery -&gt;"}
                </div>
              </div>
            </div>
          </a>

          {sharedAlbums.map((album) => (
            <a key={album.albumKey} href={`/f1/albums/${album.slug}`} style={{ textDecoration: "none", color: "#fff" }}>
              <div style={{ background: "#111", border: "1px solid #222", borderRadius: 18, overflow: "hidden", width: 320 }}>
                {album.coverThumbUrl ? (
                  <img
                    src={toCardImage(album.coverThumbUrl)}
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
