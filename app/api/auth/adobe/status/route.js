import { NextResponse } from "next/server";
import { getDb, getAdobeToken } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const row = getAdobeToken(db, "default");
  const now = Date.now();

  return NextResponse.json({
    connected: !!row,
    expires_at: row?.expires_at || null,
    expired: row ? row.expires_at <= now : false,
  });
}
