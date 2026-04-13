#!/usr/bin/env node

const { Client } = require("pg");

function parseArgs(argv) {
  const out = {
    series: "",
    slug: "",
    title: "",
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--series") {
      out.series = String(argv[i + 1] || "").trim().toLowerCase();
      i += 1;
      continue;
    }
    if (arg === "--slug") {
      out.slug = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (arg === "--title") {
      out.title = String(argv[i + 1] || "").trim();
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
  if (!args.series) throw new Error("--series is required");
  if (!args.slug) throw new Error("--slug is required");
  if (!args.title) throw new Error("--title is required");

  const connectionString = getConnectionString();
  if (!connectionString) throw new Error("Missing POSTGRES_URL");

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const existing = (
      await client.query(
        `
          SELECT album_key, series, slug, title, updated_at
          FROM shared_albums
          WHERE series = $1 AND slug = $2
          ORDER BY updated_at DESC, album_key DESC
          LIMIT 1
        `,
        [args.series, args.slug]
      )
    ).rows[0];

    if (!existing) {
      throw new Error(`Album not found for ${args.series}/${args.slug}`);
    }

    if (args.dryRun) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            dryRun: true,
            albumKey: existing.album_key,
            currentTitle: existing.title,
            nextTitle: args.title,
          },
          null,
          2
        )
      );
      return;
    }

    await client.query(
      `
        UPDATE shared_albums
        SET title = $2
        WHERE album_key = $1
      `,
      [existing.album_key, args.title]
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          series: args.series,
          slug: args.slug,
          albumKey: existing.album_key,
          previousTitle: existing.title,
          newTitle: args.title,
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
