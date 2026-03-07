const fs = require("fs");
const path = require("path");

function decodeXmlEntities(text) {
  if (!text) return "";
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function extractAltTextFromXmp(xmp) {
  if (!xmp) return "";
  const cleaned = String(xmp);

  const patterns = [
    /<Iptc4xmpCore:AltTextAccessibility>\s*<rdf:Alt>\s*<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i,
    /<dc:description>\s*<rdf:Alt>\s*<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i,
    /<photoshop:Caption[^>]*>([\s\S]*?)<\/photoshop:Caption>/i,
    /<xmp:Description[^>]*>([\s\S]*?)<\/xmp:Description>/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const value = decodeXmlEntities(match[1]);
      if (value) return value;
    }
  }

  return "";
}

function readUtf8Safe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function extractAltTextFromFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "";

  const parsed = path.parse(filePath);
  const sidecarPath = path.join(parsed.dir, `${parsed.name}.xmp`);

  const xmpSidecar = readUtf8Safe(sidecarPath);
  const fromSidecar = extractAltTextFromXmp(xmpSidecar);
  if (fromSidecar) return fromSidecar;

  const raw = readUtf8Safe(filePath);
  return extractAltTextFromXmp(raw);
}

module.exports = {
  extractAltTextFromXmp,
  extractAltTextFromFile,
};
