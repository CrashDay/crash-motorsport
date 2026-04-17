import crypto from "crypto";
import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE = "crash_admin_session";

const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getAdminPassword() {
  return String(process.env.ADMIN_PASSWORD || "").trim();
}

function getSessionSecret() {
  return String(process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "").trim();
}

export function isAdminAuthConfigured() {
  return Boolean(getAdminPassword() && getSessionSecret());
}

function signPayload(payload) {
  const secret = getSessionSecret();
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  const secret = getSessionSecret();
  if (!secret || !token || !token.includes(".")) return false;

  const [body, signature] = token.split(".");
  if (!body || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return Number(payload?.exp || 0) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function createAdminSessionToken() {
  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    role: "admin",
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  });
}

export function isValidAdminPassword(password) {
  const configuredPassword = getAdminPassword();
  const submittedPassword = String(password || "");
  if (!configuredPassword || !submittedPassword) return false;

  const configuredBuffer = Buffer.from(configuredPassword);
  const submittedBuffer = Buffer.from(submittedPassword);
  if (configuredBuffer.length !== submittedBuffer.length) return false;
  return crypto.timingSafeEqual(configuredBuffer, submittedBuffer);
}

export async function isAdminAuthenticated() {
  if (!isAdminAuthConfigured()) return false;
  const cookieStore = await cookies();
  return verifyToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || "");
}

export function adminSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: SESSION_TTL_SECONDS,
  };
}
