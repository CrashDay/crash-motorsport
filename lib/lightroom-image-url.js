function normalizeLightroomImageUrl(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();

    if (host === "photos.adobe.io" && parsed.pathname.startsWith("/v2/spaces/")) {
      parsed.protocol = "https:";
      parsed.hostname = "lightroom.adobe.com";
      parsed.pathname = parsed.pathname.replace(/^\/v2\//, "/v2c/");
      return parsed.toString();
    }

    return parsed.toString();
  } catch {
    return raw;
  }
}

function isAdobeImageHost(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return false;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "photos.adobe.io" ||
      host.endsWith(".photos.adobe.io") ||
      host === "lightroom.adobe.com" ||
      host.endsWith(".lightroom.adobe.com")
    );
  } catch {
    return false;
  }
}

function toRemoteImageProxyUrl(rawUrl) {
  const normalized = normalizeLightroomImageUrl(rawUrl);
  if (!normalized || !isAdobeImageHost(normalized)) return normalized;
  return `/api/remote-image?url=${encodeURIComponent(normalized)}`;
}

module.exports = {
  normalizeLightroomImageUrl,
  isAdobeImageHost,
  toRemoteImageProxyUrl,
};
