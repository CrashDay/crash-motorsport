import { NextResponse } from "next/server";
import { getAccessToken, LIGHTROOM_BASE_URL } from "@/lib/lightroom-client";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function GET() {
  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 401 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  let apiKey;
  try {
    apiKey = requireEnv("ADOBE_LIGHTROOM_API_KEY");
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }

  const res = await fetch(`${LIGHTROOM_BASE_URL}/v2/catalogs`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-API-Key": apiKey,
    },
  });
  const text = await res.text();
  return NextResponse.json({
    status: res.status,
    body: text,
  });
}
