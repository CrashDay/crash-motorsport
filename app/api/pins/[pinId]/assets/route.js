import { NextResponse } from "next/server";
import { getDb, getAssetsByPin } from "@/lib/db";

export async function GET(_request, { params }) {
  const awaitedParams = await params;
  const pinId = awaitedParams.pinId;
  const db = getDb();
  const assets = getAssetsByPin(db, pinId);
  return NextResponse.json({ assets });
}
