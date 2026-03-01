import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic"; // new random on refresh

function pickRandomImageFromPublic(relDir) {
  const absDir = path.join(process.cwd(), "public", relDir);

  let files = [];
  try {
    files = fs.readdirSync(absDir);
  } catch {
    return null;
  }

  const images = files.filter((f) => {
    const lower = f.toLowerCase();
    return (
      !lower.startsWith(".") &&
      !lower.includes("ds_store") &&
      (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp"))
    );
  });

  if (!images.length) return null;

  const pick = images[Math.floor(Math.random() * images.length)];
  return `/${relDir}/${pick}`; // served from /photos/...
}

export default function F1Index() {
  // Imola tile cover randomly picked from public/photos/f1
  const coverSrc = pickRandomImageFromPublic("photos/f1");

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: "system-ui" }}>
      <nav style={{ display: "flex", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #222" }}>
        <a href="/" style={{ fontSize: 20, fontWeight: 700, color: "#fff", textDecoration: "none" }}>
          Tony Day Motorsport
        </a>

        <div style={{ display: "flex", gap: 18, fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "#bbb" }}>
          <a href="/" style={{ color: "#bbb", textDecoration: "none" }}>Home</a>
          <a href="/imsa" style={{ color: "#bbb", textDecoration: "none" }}>IMSA</a>
          <a href="/f1" style={{ color: "#fff", textDecoration: "none" }}>F1</a>
        </div>
      </nav>

      <section style={{ padding: "28px 24px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>F1</h1>
        <p style={{ color: "#aaa", marginTop: 8 }}>Motion-first trackside work from F1 events.</p>

        <div style={{ marginTop: 24 }}>
          <a href="/f1/imola" style={{ textDecoration: "none", color: "#fff" }}>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 18, overflow: "hidden", width: 320 }}>
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt="Random Imola cover"
                  style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ height: 180, background: "#222", display: "flex", alignItems: "center", justifyContent: "center", color: "#777" }}>
                  Add images to /public/photos/f1
                </div>
              )}

              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 800 }}>Imola</div>
                <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>View gallery -&gt;</div>
              </div>
            </div>
          </a>
        </div>
      </section>
    </div>
  );
}
