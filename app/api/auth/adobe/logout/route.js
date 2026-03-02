import { NextResponse } from "next/server";
import { getDb, deleteAdobeToken } from "@/lib/db";

export async function POST() {
  const db = getDb();
  deleteAdobeToken(db, "default");
  return NextResponse.json({ ok: true });
}
