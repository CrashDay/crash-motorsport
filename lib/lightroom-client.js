const { getDb, getAdobeToken, upsertAdobeToken } = require("./db");
const { encryptText, decryptText } = require("./token-crypto");

const IMS_BASE_URL = process.env.ADOBE_IMS_BASE_URL || "https://ims-na1.adobelogin.com";
const LIGHTROOM_BASE_URL = process.env.ADOBE_LIGHTROOM_BASE_URL || "https://lr.adobe.io";
const USER_ID = "default";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function nowIso() {
  return new Date().toISOString();
}

function stripWhile1(text) {
  if (!text) return "";
  return text.replace(/^while\\(1\\)\\s*;?\\s*/i, "");
}

async function fetchWithRetry(url, options = {}, attempt = 0) {
  const res = await fetch(url, options);
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 3) return res;
    const delay = Math.min(1500 * (attempt + 1), 5000);
    await new Promise((r) => setTimeout(r, delay));
    return fetchWithRetry(url, options, attempt + 1);
  }
  return res;
}

async function fetchJson(url, options = {}) {
  const res = await fetchWithRetry(url, options);
  const text = await res.text();
  if (!res.ok) {
    const msg = text ? stripWhile1(text) : res.statusText;
    throw new Error(`Lightroom API error ${res.status}: ${msg}`);
  }
  const cleaned = stripWhile1(text);
  return cleaned ? JSON.parse(cleaned) : {};
}

async function getAccessToken() {
  const db = getDb();
  const row = getAdobeToken(db, USER_ID);
  if (!row) return null;

  const accessToken = decryptText(row.access_token);
  const refreshToken = decryptText(row.refresh_token);
  const expiresAt = Number(row.expires_at || 0);
  const now = Date.now();

  if (expiresAt > now + 120000) {
    return accessToken;
  }

  const refreshed = await refreshAccessToken(refreshToken);
  const nextExpiresAt = now + refreshed.expires_in * 1000;
  const updatedAt = nowIso();

  upsertAdobeToken(db, {
    user_id: USER_ID,
    access_token: encryptText(refreshed.access_token),
    refresh_token: encryptText(refreshed.refresh_token || refreshToken),
    expires_at: nextExpiresAt,
    created_at: row.created_at || updatedAt,
    updated_at: updatedAt,
  });

  return refreshed.access_token;
}

async function refreshAccessToken(refreshToken) {
  const clientId = requireEnv("ADOBE_CLIENT_ID");
  const clientSecret = requireEnv("ADOBE_CLIENT_SECRET");

  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", refreshToken);
  form.set("client_id", clientId);
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
    throw new Error(`Adobe token refresh failed: ${json.error_description || res.statusText}`);
  }
  return json;
}

function getAuthHeaders(accessToken) {
  const apiKey = requireEnv("ADOBE_LIGHTROOM_API_KEY");
  return {
    Authorization: `Bearer ${accessToken}`,
    "X-API-Key": apiKey,
  };
}

async function listCatalogs() {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("Not connected to Adobe");
  const headers = getAuthHeaders(accessToken);
  return fetchJson(`${LIGHTROOM_BASE_URL}/v2/catalogs`, { headers });
}

async function listAlbums(catalogId) {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("Not connected to Adobe");
  const headers = getAuthHeaders(accessToken);
  return fetchJson(`${LIGHTROOM_BASE_URL}/v2/catalogs/${catalogId}/albums`, { headers });
}

async function listAssets({ catalogId, albumId, limit }) {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("Not connected to Adobe");
  const headers = getAuthHeaders(accessToken);
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  const base = albumId
    ? `${LIGHTROOM_BASE_URL}/v2/catalogs/${catalogId}/albums/${albumId}/assets`
    : `${LIGHTROOM_BASE_URL}/v2/catalogs/${catalogId}/assets`;
  const url = params.toString() ? `${base}?${params}` : base;
  return fetchJson(url, { headers });
}

async function getAsset(catalogId, assetId) {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("Not connected to Adobe");
  const headers = getAuthHeaders(accessToken);
  return fetchJson(`${LIGHTROOM_BASE_URL}/v2/catalogs/${catalogId}/assets/${assetId}`, { headers });
}

async function fetchXmp(catalogId, assetId, assetPayload) {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("Not connected to Adobe");
  const headers = getAuthHeaders(accessToken);

  const link = assetPayload?.links?.["/rels/xmp"]?.href;
  const url = link
    ? (link.startsWith("http") ? link : `${LIGHTROOM_BASE_URL}${link}`)
    : `${LIGHTROOM_BASE_URL}/v2/catalogs/${catalogId}/assets/${assetId}/xmp`;

  const res = await fetchWithRetry(url, { headers });
  if (!res.ok) return null;
  return res.text();
}

function extractAltTextFromXmp(xmp) {
  if (!xmp) return "";
  const cleaned = String(xmp);

  const fields = [
    "<Iptc4xmpCore:AltTextAccessibility>\\s*<rdf:Alt>\\s*<rdf:li[^>]*>([^<]+)</rdf:li>",
    "<dc:description>\\s*<rdf:Alt>\\s*<rdf:li[^>]*>([^<]+)</rdf:li>",
    "<photoshop:Caption[^>]*>([^<]+)</photoshop:Caption>",
    "<xmp:Description[^>]*>([^<]+)</xmp:Description>",
  ].map((pattern) => new RegExp(pattern, "i"));

  for (const re of fields) {
    const match = cleaned.match(re);
    if (match?.[1]) return match[1].trim();
  }

  return "";
}

async function getRendition(assetId, size, catalogId) {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("Not connected to Adobe");
  const headers = getAuthHeaders(accessToken);

  const rendition = size === "thumb" ? "thumbnail2x" : "2048";
  const url = `${LIGHTROOM_BASE_URL}/v2/catalogs/${catalogId}/assets/${assetId}/renditions/${rendition}`;
  const res = await fetchWithRetry(url, { headers });
  return res;
}

module.exports = {
  IMS_BASE_URL,
  LIGHTROOM_BASE_URL,
  listCatalogs,
  listAlbums,
  listAssets,
  getAsset,
  fetchXmp,
  extractAltTextFromXmp,
  getRendition,
  getAccessToken,
  refreshAccessToken,
};
