#!/usr/bin/env node

const { spawnSync } = require("child_process");
const path = require("path");

const VALID_SERIES = new Set(["imsa", "wec", "f1"]);

function usage() {
  console.error(
    [
      "Usage:",
      "  node scripts/import-shared-album-with-local-gps.cjs --series <imsa|wec|f1> --slug <album-slug> --folder <path> --short-link <url> [--album-api-base <url>] [--year <yyyy>] [--race <name>] [--dry-run]",
      "",
      "Example:",
      "  POSTGRES_URL=... node scripts/import-shared-album-with-local-gps.cjs --series imsa --slug 2026-weathertech-practice-am --folder ~/Desktop/temp_jpg --short-link https://adobe.ly/... --album-api-base https://crashdaypics.com --year 2026 --race \"12 Hours of Sebring\"",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = {
    series: "",
    slug: "",
    folder: "",
    shortLink: "",
    albumApiBase: "",
    year: "",
    race: "",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--series") args.series = String(argv[i + 1] || "").trim().toLowerCase();
    else if (arg === "--slug") args.slug = String(argv[i + 1] || "").trim();
    else if (arg === "--folder") args.folder = String(argv[i + 1] || "").trim();
    else if (arg === "--short-link") args.shortLink = String(argv[i + 1] || "").trim();
    else if (arg === "--album-api-base") args.albumApiBase = String(argv[i + 1] || "").trim();
    else if (arg === "--year") args.year = String(argv[i + 1] || "").trim();
    else if (arg === "--race") args.race = String(argv[i + 1] || "").trim();
    else if (arg === "--dry-run") args.dryRun = true;
    else continue;
    if (arg !== "--dry-run") i += 1;
  }
  return args;
}

function runNode(scriptPath, extraArgs, options = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    stdio: "inherit",
    env: options.env || process.env,
    cwd: options.cwd || process.cwd(),
  });
  if (result.error) throw result.error;
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "CrashDayPicsSharedAlbumAutomation/1.0",
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error || `HTTP ${response.status} for ${url}`);
  }
  return json;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!VALID_SERIES.has(args.series) || !args.slug || !args.folder || !args.shortLink) {
    usage();
    process.exitCode = 1;
    return;
  }

  const albumApiBase = String(args.albumApiBase || process.env.SHARED_ALBUM_API_BASE || "").trim().replace(/\/+$/, "");
  if (!albumApiBase) {
    throw new Error("album API base is required via --album-api-base or SHARED_ALBUM_API_BASE");
  }

  const importPayload = {
    shortLink: args.shortLink,
    series: args.series,
    slug: args.slug,
  };
  if (args.year) importPayload.year = Number(args.year);
  if (args.race) importPayload.race = args.race;

  console.log(
    JSON.stringify(
      {
        step: "share-album-import",
        series: args.series,
        slug: args.slug,
        albumApiBase,
        dryRun: args.dryRun,
      },
      null,
      2
    )
  );

  const importResult = await postJson(`${albumApiBase}/api/share-album`, importPayload);
  console.log(
    JSON.stringify(
      {
        step: "share-album-import-result",
        albumSlug: importResult?.album_slug || null,
        matchedExistingAlbumKey: importResult?.matched_existing_album_key || null,
        committedStoredAssetCount: Number(importResult?.committed_stored_asset_count || 0),
        committedAlbumRows: Array.isArray(importResult?.committed_album_rows) ? importResult.committed_album_rows : [],
      },
      null,
      2
    )
  );

  const gpsScript = path.join(process.cwd(), "scripts", "import-shared-album-local-gps.cjs");
  const gpsArgs = [
    "--series",
    args.series,
    "--slug",
    args.slug,
    "--folder",
    args.folder,
    "--album-api-base",
    albumApiBase,
  ];
  if (args.dryRun) gpsArgs.push("--dry-run");
  runNode(gpsScript, gpsArgs);
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
