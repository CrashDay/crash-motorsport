import { NextResponse } from "next/server";
import { getDb, upsertAdobeToken } from "@/lib/db";
import { IMS_BASE_URL } from "@/lib/lightroom-client";
import { encryptText } from "@/lib/token-crypto";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieState = request.cookies.get("adobe_oauth_state")?.value;
  const redirect = request.cookies.get("adobe_oauth_redirect")?.value || "/sebring-map";

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/sebring-map?auth=error", url));
  }

  const clientId = process.env.ADOBE_CLIENT_ID;
  const clientSecret = process.env.ADOBE_CLIENT_SECRET;
  const redirectUri = process.env.ADOBE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: "Adobe OAuth env vars are missing" }, { status: 500 });
  }

  const form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("code", code);
  form.set("client_id", clientId);
  form.set("redirect_uri", redirectUri);
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${IMS_BASE_URL}/ims/token/v3`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: form.toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    return NextResponse.redirect(new URL(`/sebring-map?auth=error`, url));
  }

  const now = Date.now();
  const expiresAt = now + json.expires_in * 1000;
  const nowIso = new Date().toISOString();
  const db = getDb();

  upsertAdobeToken(db, {
    user_id: "default",
    access_token: encryptText(json.access_token),
    refresh_token: encryptText(json.refresh_token),
    expires_at: expiresAt,
    created_at: nowIso,
    updated_at: nowIso,
  });

  const redirectUrl = new URL(redirect, url);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete("adobe_oauth_state");
  response.cookies.delete("adobe_oauth_redirect");
  return response;
}
