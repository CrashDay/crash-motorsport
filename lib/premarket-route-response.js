import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DASHBOARD_DIR = path.join(process.cwd(), "data", "premarket-dashboard");
const BRIEFS_DIR = path.join(process.cwd(), "data", "premarket-briefs");

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "x-robots-tag": "noindex, nofollow",
};

export async function renderPremarketResponse(request, date = null) {
  if (date && !normalizeDate(date)) {
    return htmlResponse(
      "<!doctype html><title>Premarket Unavailable</title><p>No published dashboard is available for this date.</p>",
      404,
    );
  }

  if (isMobileRequest(request)) {
    return renderMobileBriefResponse(date);
  }

  return renderDashboardResponse(date);
}

export function isMobileRequest(request) {
  const url = new URL(request.url);
  const forcedView = url.searchParams.get("view");
  if (forcedView === "mobile") return true;
  if (forcedView === "full") return false;

  const clientHintMobile = request.headers.get("sec-ch-ua-mobile");
  if (clientHintMobile === "?1") return true;
  if (clientHintMobile === "?0") return false;

  const userAgent = request.headers.get("user-agent") ?? "";
  return /\b(iPhone|iPod|Android.+Mobile|Windows Phone|BlackBerry|IEMobile|Opera Mini)\b/i.test(userAgent);
}

async function renderDashboardResponse(date) {
  const safeDate = normalizeDate(date);
  const dashboardPath = path.join(DASHBOARD_DIR, safeDate ?? "latest", "dashboard.html");

  try {
    const html = await readFile(dashboardPath, "utf8");
    return new Response(html, { status: 200, headers: HTML_HEADERS });
  } catch {
    const detail = safeDate ? "for this date" : "yet";
    return htmlResponse(
      `<!doctype html><title>Premarket Unavailable</title><p>No published dashboard is available ${detail}.</p>`,
      404,
    );
  }
}

async function renderMobileBriefResponse(date) {
  const safeDate = normalizeDate(date);
  const brief = await readBriefFile(safeDate ? `${safeDate}.json` : "latest.json");
  if (!brief) {
    const detail = safeDate ? "for this date" : "yet";
    return htmlResponse(
      `<!doctype html><title>Premarket Unavailable</title><p>No mobile premarket brief is available ${detail}.</p>`,
      404,
    );
  }

  const dates = await listPremarketBriefDates();
  return htmlResponse(renderMobileBriefHtml(brief, dates));
}

async function listPremarketBriefDates() {
  try {
    const files = await readdir(BRIEFS_DIR, { withFileTypes: true });
    return files
      .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))
      .map((entry) => entry.name.replace(/\.json$/, ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

async function readBriefFile(fileName) {
  try {
    const raw = await readFile(path.join(BRIEFS_DIR, fileName), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeDate(date) {
  if (!date) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function htmlResponse(html, status = 200) {
  return new Response(html, { status, headers: HTML_HEADERS });
}

function renderMobileBriefHtml(brief, dates) {
  const otherDates = dates.filter((date) => date !== brief.date).slice(0, 10);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(brief.title ?? "Premarket Brief")}</title>
  <style>${MOBILE_CSS}</style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <p class="eyebrow">Mobile Brief</p>
      <h1>Premarket Brief</h1>
      <p class="lede">Fast morning read for phones. Desktop keeps the full dashboard by default.</p>
      <div class="meta-row">
        <span>Session: ${escapeHtml(brief.date)}</span>
        <span>Published: ${escapeHtml(formatDateTime(brief.publishedAt))}</span>
      </div>
      <a class="full-link" href="${brief.date ? `/premarket/${encodeURIComponent(brief.date)}?view=full` : "/premarket?view=full"}">Open full dashboard</a>
    </header>
    <section class="briefing">${brief.html ?? ""}</section>
    ${renderArchiveLinks(otherDates)}
  </main>
</body>
</html>`;
}

function renderArchiveLinks(dates) {
  if (!dates.length) return "";
  return `<nav class="archive" aria-label="Recent premarket briefs">
    <h2>Recent Briefs</h2>
    <div>${dates.map((date) => `<a href="/premarket/${encodeURIComponent(date)}?view=mobile">${escapeHtml(date)}</a>`).join("")}</div>
  </nav>`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value ?? "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MOBILE_CSS = `
  :root {
    color-scheme: dark;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #07111c;
    color: #edf5fb;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: linear-gradient(180deg, #07111c 0%, #0b1825 100%);
  }

  .page {
    width: min(100%, 760px);
    min-height: 100vh;
    margin: 0 auto;
    padding: 18px 14px 42px;
  }

  .hero,
  .briefing,
  .archive {
    border: 1px solid rgba(125, 160, 190, 0.2);
    border-radius: 18px;
    background: rgba(10, 22, 34, 0.94);
  }

  .hero {
    padding: 20px 18px;
    margin-bottom: 14px;
  }

  .eyebrow {
    margin: 0 0 8px;
    color: #7dd3fc;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: 34px;
    line-height: 1.04;
  }

  .lede {
    margin: 10px 0 0;
    color: #c8d7e4;
    line-height: 1.45;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }

  .meta-row span,
  .full-link,
  .archive a {
    display: inline-flex;
    border-radius: 999px;
    border: 1px solid rgba(125, 160, 190, 0.22);
    background: rgba(14, 31, 48, 0.9);
    color: #dff3ff;
    font-size: 13px;
    text-decoration: none;
  }

  .meta-row span {
    padding: 7px 10px;
  }

  .full-link {
    width: fit-content;
    margin-top: 14px;
    padding: 9px 12px;
  }

  .briefing {
    padding: 18px;
  }

  .briefing-section + .briefing-section {
    margin-top: 20px;
    padding-top: 18px;
    border-top: 1px solid rgba(125, 160, 190, 0.14);
  }

  .briefing-kicker {
    display: inline-flex;
    margin-bottom: 10px;
    padding: 5px 9px;
    border-radius: 999px;
    background: rgba(20, 184, 166, 0.14);
    color: #99f6e4;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .briefing h1,
  .briefing h2,
  .briefing h3 {
    margin: 0 0 10px;
    color: #f8fbff;
    line-height: 1.15;
  }

  .briefing h1 {
    font-size: 28px;
  }

  .briefing h2 {
    font-size: 21px;
  }

  .briefing h3 {
    font-size: 17px;
  }

  .briefing p,
  .briefing li,
  .briefing blockquote,
  .briefing td {
    color: #d8e5ef;
    font-size: 15px;
    line-height: 1.55;
  }

  .briefing ul,
  .briefing ol {
    margin: 10px 0 0 20px;
    padding: 0;
  }

  .briefing li + li {
    margin-top: 7px;
  }

  .briefing blockquote {
    margin: 12px 0 0;
    padding: 11px 13px;
    border-left: 3px solid #22d3ee;
    border-radius: 0 10px 10px 0;
    background: rgba(8, 145, 178, 0.12);
  }

  .briefing table {
    display: block;
    width: 100%;
    margin-top: 12px;
    overflow-x: auto;
    border-collapse: collapse;
  }

  .briefing th,
  .briefing td {
    min-width: 150px;
    padding: 10px;
    border: 1px solid rgba(125, 160, 190, 0.18);
    text-align: left;
    vertical-align: top;
  }

  .briefing th {
    background: rgba(20, 42, 64, 0.95);
    color: #f0f9ff;
    font-size: 12px;
    text-transform: uppercase;
  }

  .archive {
    margin-top: 14px;
    padding: 18px;
  }

  .archive h2 {
    margin: 0 0 10px;
    color: #7dd3fc;
    font-size: 14px;
    text-transform: uppercase;
  }

  .archive div {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .archive a {
    padding: 8px 10px;
  }
`;
