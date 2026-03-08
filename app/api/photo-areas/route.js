import { NextResponse } from "next/server";
import sebringAreas from "@/data/sebring-photo-areas.json";
import { getAreaAssetsByTrack, getDb } from "@/lib/db";

const TRACKS = {
  sebring: {
    id: "sebring",
    name: "Sebring International Raceway",
    areas: sebringAreas,
  },
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const trackId = String(searchParams.get("trackId") || "").trim().toLowerCase();

  if (!trackId) {
    return NextResponse.json({
      tracks: Object.values(TRACKS).map((t) => ({ id: t.id, name: t.name })),
    });
  }

  const track = TRACKS[trackId];
  if (!track) {
    return NextResponse.json({ error: "Unsupported trackId" }, { status: 400 });
  }

  let assignedByArea = {};
  try {
    const db = getDb();
    assignedByArea = getAreaAssetsByTrack(db, trackId);
  } catch {
    // In environments without writable local DB (e.g. some serverless deployments),
    // return static areas so assignment UI still works for area selection.
    assignedByArea = {};
  }
  const areas = track.areas.map((a) => ({
    ...a,
    photos: assignedByArea[a.id]?.length
      ? assignedByArea[a.id]
      : a.defaultPhoto
        ? [{ id: a.defaultPhoto.id, name: a.title, thumbUrl: a.defaultPhoto.src, fullUrl: a.defaultPhoto.src }]
        : [],
  }));

  return NextResponse.json({
    track: { id: track.id, name: track.name },
    areas,
  });
}
