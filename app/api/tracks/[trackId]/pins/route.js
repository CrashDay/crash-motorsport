import { NextResponse } from "next/server";
import { getDb, getDbPath, getPinsByTrack } from "@/lib/db";

export async function GET(_request, { params }) {
  const awaitedParams = await params;
  const rawTrackId = awaitedParams.trackId;
  const trackId = String(rawTrackId || "").trim().toLowerCase();
  const db = getDb();
  const pins = getPinsByTrack(db, trackId);
  const { searchParams } = new URL(_request.url);
  const debug = searchParams.get("debug");
  if (debug === "1") {
    const totalPins = db.prepare("SELECT COUNT(*) AS c FROM photo_pins").get()?.c || 0;
    const trackPins = db
      .prepare("SELECT COUNT(*) AS c FROM photo_pins WHERE track_id = ?")
      .get(trackId)?.c || 0;
    return NextResponse.json({
      pins,
      db_path: getDbPath(),
      total_pins: totalPins,
      track_pins: trackPins,
      track_id_raw: rawTrackId,
      track_id_norm: trackId,
      track_id_codes: String(rawTrackId || "")
        .split("")
        .map((ch) => ch.charCodeAt(0)),
      cwd: process.cwd(),
    });
  }
  return NextResponse.json({ pins });
}
