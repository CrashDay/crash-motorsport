import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET(request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!date) {
    return Response.json({ error: "Missing date query parameter." }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "data", "premarket-dashboard", date, "verifications.json");

  try {
    const payload = JSON.parse(await readFile(filePath, "utf8"));
    return Response.json({ records: payload.records ?? [] }, { status: 200 });
  } catch {
    return Response.json({ records: [] }, { status: 200 });
  }
}
