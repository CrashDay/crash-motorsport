import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET(_request, { params }) {
  const { date } = await params;
  return renderDashboardResponse(path.join(process.cwd(), "data", "premarket-dashboard", date, "dashboard.html"));
}

async function renderDashboardResponse(filePath) {
  try {
    const html = await readFile(filePath, "utf8");
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch {
    return new Response("<!doctype html><title>Premarket Unavailable</title><p>No published dashboard is available for this date.</p>", {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }
}
