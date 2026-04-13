#!/usr/bin/env node

const { Client } = require("pg");

function parseArgs(argv) {
  const out = {
    series: "",
    keep: [],
    delete: [],
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--series") {
      out.series = String(argv[i + 1] || "").trim().toLowerCase();
      i += 1;
      continue;
    }
    if (arg === "--keep") {
      const value = String(argv[i + 1] || "").trim();
      if (value) out.keep.push(value);
      i += 1;
      continue;
    }
    if (arg === "--delete") {
      const value = String(argv[i + 1] || "").trim();
      if (value) out.delete.push(value);
      i += 1;
      continue;
    }
    if (arg === "--dry-run") {
      out.dryRun = true;
    }
  }

  return out;
}

function getConnectionString() {
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.PRISMA_DATABASE_URL ||
    process.env.DATABASE_URL ||
    ""
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.series) {
    throw new Error("--series is required");
  }
  if (!args.delete.length) {
    throw new Error("At least one --delete slug is required");
  }

  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error("Missing POSTGRES_URL");
  }

  const keepSet = new Set(args.keep);
  const deleteSlugs = args.delete.filter((slug) => !keepSet.has(slug));
  if (!deleteSlugs.length) {
    console.log(JSON.stringify({ ok: true, deletedAlbumKeys: [], skipped: "All delete slugs were also in keep list." }, null, 2));
    return;
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const albumRows = (
      await client.query(
        `
          SELECT album_key, slug, title, updated_at
          FROM shared_albums
          WHERE series = $1 AND slug = ANY($2::text[])
          ORDER BY updated_at DESC
        `,
        [args.series, deleteSlugs]
      )
    ).rows;

    const albumKeys = albumRows.map((row) => row.album_key);
    const assetRows = albumKeys.length
      ? (
          await client.query(
            `
              SELECT DISTINCT asset_id
              FROM shared_album_assets
              WHERE album_key = ANY($1::text[])
            `,
            [albumKeys]
          )
        ).rows
      : [];
    const assetIds = assetRows.map((row) => row.asset_id).filter(Boolean);
    const pinRows = assetIds.length
      ? (
          await client.query(
            `
              SELECT DISTINCT pin_id
              FROM pin_assets
              WHERE asset_id = ANY($1::text[])
                AND pin_id LIKE 'gps:%'
            `,
            [assetIds]
          )
        ).rows
      : [];
    const pinIds = pinRows.map((row) => row.pin_id).filter(Boolean);
    if (args.dryRun || !albumKeys.length) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            dryRun: args.dryRun,
            albums: albumRows,
            assetCount: assetIds.length,
            gpsPinCount: pinIds.length,
          },
          null,
          2
        )
      );
      return;
    }

    await client.query("BEGIN");
    if (pinIds.length) {
      await client.query("DELETE FROM pin_assets WHERE pin_id = ANY($1::text[])", [pinIds]);
      await client.query("DELETE FROM photo_pins WHERE pin_id = ANY($1::text[])", [pinIds]);
    }
    if (assetIds.length) {
      await client.query("DELETE FROM pin_assets WHERE asset_id = ANY($1::text[])", [assetIds]);
      await client.query("DELETE FROM photo_area_assets WHERE asset_id = ANY($1::text[])", [assetIds]);
    }
    await client.query("DELETE FROM shared_album_assets WHERE album_key = ANY($1::text[])", [albumKeys]);
    await client.query("DELETE FROM shared_albums WHERE album_key = ANY($1::text[])", [albumKeys]);
    if (assetIds.length) {
      await client.query("DELETE FROM photo_assets WHERE asset_id = ANY($1::text[])", [assetIds]);
    }
    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          ok: true,
          deletedAlbumKeys: albumKeys,
          deletedSlugs: albumRows.map((row) => row.slug),
          deletedAssetCount: assetIds.length,
          deletedGpsPinCount: pinIds.length,
        },
        null,
        2
      )
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
