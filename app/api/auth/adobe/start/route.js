import { NextResponse } from "next/server";
import crypto from "crypto";
import { IMS_BASE_URL } from "@/lib/lightroom-client";

export async function GET(request) {
  const url = new URL(request.url);
  const redirect = url.searchParams.get("redirect") || "/sebring-map";
  const prompt = url.searchParams.get("prompt");
  const clientId = process.env.ADOBE_CLIENT_ID;
  const redirectUri = process.env.ADOBE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "Adobe OAuth env vars are missing" }, { status: 500 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const authUrl = new URL(`${IMS_BASE_URL}/ims/authorize/v2`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set(
    "scope",
    [
      "openid",
      "AdobeID",
      "lr_partner_apis",
      "lr_partner_rendition_apis",
      "offline_access",
    ].join(",")
  );
  if (prompt) {
    authUrl.searchParams.set("prompt", prompt);
  }

  const res = NextResponse.redirect(authUrl.toString());
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set("adobe_oauth_state", state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  res.cookies.set("adobe_oauth_redirect", redirect, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
