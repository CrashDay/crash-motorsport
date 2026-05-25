import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const BRIEFS_DIR = path.join(process.cwd(), "data", "premarket-briefs");

export async function getLatestPremarketBrief() {
  return readBriefFile("latest.json");
}

export async function getPremarketBrief(date) {
  return readBriefFile(`${date}.json`);
}

export async function listPremarketBriefDates() {
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
