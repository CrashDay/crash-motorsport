import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionToken,
  isAdminAuthConfigured,
  isValidAdminPassword,
} from "@/lib/admin-auth";

function getSafeNextUrl(request, value) {
  const fallback = new URL("/admin/sebring-map", request.url);
  const candidate = String(value || "").trim();
  if (!candidate.startsWith("/admin") || candidate.startsWith("/admin/login")) return fallback;
  return new URL(candidate, request.url);
}

export async function POST(request) {
  const formData = await request.formData();
  const password = formData.get("password");
  const nextUrl = getSafeNextUrl(request, formData.get("next"));

  if (!isAdminAuthConfigured()) {
    const url = new URL("/admin/login", request.url);
    url.searchParams.set("error", "not-configured");
    url.searchParams.set("next", nextUrl.pathname);
    return NextResponse.redirect(url, { status: 303 });
  }

  if (!isValidAdminPassword(password)) {
    const url = new URL("/admin/login", request.url);
    url.searchParams.set("error", "invalid");
    url.searchParams.set("next", nextUrl.pathname);
    return NextResponse.redirect(url, { status: 303 });
  }

  const response = NextResponse.redirect(nextUrl, { status: 303 });
  response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(), adminSessionCookieOptions());
  return response;
}
