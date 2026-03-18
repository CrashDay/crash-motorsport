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

module.exports = {
  normalizeLightroomImageUrl,
};
