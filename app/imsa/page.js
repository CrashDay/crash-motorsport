import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic"; // new random on refresh

function pickRandomImageFromPublic(relDir, prefix = "") {
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
      (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp")) &&
      (!prefix || lower.startsWith(prefix.toLowerCase()))
    );
  });

  if (!images.length) return null;

  const pick = images[Math.floor(Math.random() * images.length)];
  return `/${relDir}/${pick}`; // served from /photos/...
}

function listImagesFromPublic(relDir, prefix = "") {
  const absDir = path.join(process.cwd(), "public", relDir);

  let files = [];
  try {
    files = fs.readdirSync(absDir);
  } catch {
    return [];
  }

  const images = files.filter((f) => {
    const lower = f.toLowerCase();
    return (
      !lower.startsWith(".") &&
      !lower.includes("ds_store") &&
      (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp")) &&
      (!prefix || lower.startsWith(prefix.toLowerCase()))
    );
  });

  return images.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

export default function IMSAIndex() {
  const daytonaImages = listImagesFromPublic("photos/imsa", "imsa");
  const daytonaCoverSrc = pickRandomImageFromPublic("photos/imsa", "imsa");
  const sebring2023Images = listImagesFromPublic("photos/imsa", "sebring2023-");
  const sebringCoverSrc = pickRandomImageFromPublic("photos/imsa", "sebring2023");

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: "system-ui" }}>
      <style jsx>{`
        .navLinks {
          display: flex;
          gap: 18px;
          font-size: 12px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #bbb;
          align-items: center;
        }
        .mapsMenu {
          position: relative;
          display: inline-block;
        }
        .mapsButton {
          color: #bbb;
          text-decoration: none;
          background: transparent;
          border: 0;
          padding: 0;
          font: inherit;
          letter-spacing: inherit;
          text-transform: inherit;
          cursor: pointer;
        }
        .mapsDropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 260px;
          background: #0f1724;
          border: 1px solid #22304a;
          border-radius: 10px;
          padding: 8px 0;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
          opacity: 0;
          visibility: hidden;
          transform: translateY(-4px);
          transition: opacity 120ms ease, transform 120ms ease, visibility 120ms ease;
          z-index: 1000;
        }
        .mapsMenu:hover .mapsDropdown,
        .mapsMenu:focus-within .mapsDropdown {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }
        .mapsItem {
          display: block;
          color: #dfe8ff;
          text-decoration: none;
          padding: 10px 12px;
          letter-spacing: 0.3px;
          text-transform: none;
          font-size: 13px;
        }
        .mapsItem:hover {
          background: rgba(128, 168, 255, 0.12);
        }
      `}</style>
      <nav style={{ display: "flex", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #222" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "#fff" }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <span style={{ fontSize: "clamp(22px, 3.4vw, 42px)", fontWeight: 900, letterSpacing: 0.2 }}>
              CrashDayPics
            </span>
            <span style={{ marginTop: 4, fontSize: "clamp(10px, 1vw, 13px)", color: "#aaa", letterSpacing: 1 }}>
              Mapped by corner, light and speed.
            </span>
          </div>
        </a>

        <div className="navLinks">
          <a href="/" style={{ color: "#bbb", textDecoration: "none" }}>Home</a>
          <a href="/imsa" style={{ color: "#fff", textDecoration: "none" }}>IMSA</a>
          <a href="/f1" style={{ color: "#bbb", textDecoration: "none" }}>F1</a>
          <div className="mapsMenu">
            <button type="button" className="mapsButton" aria-haspopup="true">
              Maps
            </button>
            <div className="mapsDropdown">
              <a className="mapsItem" href="/sebring-map">
                Sebring International Raceway
              </a>
              <a className="mapsItem" href="/daniels-park">
                Daniels Park
              </a>
            </div>
          </div>
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
                <div style={{ fontWeight: 800 }}>24 Hours of Daytona - 2024</div>
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
        </div>
      </section>
    </div>
  );
}
