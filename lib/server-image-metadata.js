import sharp from "sharp";

function parseIsoLikeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const epoch = Date.parse(raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3"));
  if (!Number.isFinite(epoch)) return "";
  return new Date(epoch).toISOString();
}

function parseXmpCoordinate(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  const direct = Number(raw);
  if (Number.isFinite(direct)) return direct;

  const compactMatch = raw.match(/^(-?\d+(?:\.\d+)?)([NSEW])$/i);
  if (compactMatch) {
    let decimal = Number(compactMatch[1]);
    const direction = compactMatch[2].toUpperCase();
    if (direction === "S" || direction === "W") decimal *= -1;
    return Number.isFinite(decimal) ? decimal : null;
  }

  const dmsMatch = raw.match(
    /^(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)?\D*(\d+(?:\.\d+)?)?\D*([NSEW])$/i
  );
  if (!dmsMatch) return null;
  const deg = Number(dmsMatch[1]);
  const min = Number(dmsMatch[2] || 0);
  const sec = Number(dmsMatch[3] || 0);
  if (![deg, min, sec].every(Number.isFinite)) return null;
  let decimal = deg + min / 60 + sec / 3600;
  const direction = dmsMatch[4].toUpperCase();
  if (direction === "S" || direction === "W") decimal *= -1;
  return decimal;
}

function extractXmpValue(xmp, names) {
  for (const name of names) {
    const attrMatch = xmp.match(new RegExp(`${name}="([^"]+)"`, "i"));
    if (attrMatch?.[1]) return attrMatch[1];
    const tagMatch = xmp.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (tagMatch?.[1]) return tagMatch[1].trim();
  }
  return "";
}

function parseXmpPacket(xmp) {
  const gpsLatitudeRaw = extractXmpValue(xmp, ["exif:GPSLatitude", "exifEX:GPSLatitude"]);
  const gpsLongitudeRaw = extractXmpValue(xmp, ["exif:GPSLongitude", "exifEX:GPSLongitude"]);
  const captureTime =
    parseIsoLikeDate(extractXmpValue(xmp, ["exif:DateTimeOriginal", "xmp:CreateDate", "photoshop:DateCreated"])) || "";
  const lat = parseXmpCoordinate(gpsLatitudeRaw);
  const lon = parseXmpCoordinate(gpsLongitudeRaw);
  return {
    captureTime,
    gps: Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null,
    debug: {
      gpsLatitudeRaw: gpsLatitudeRaw || null,
      gpsLongitudeRaw: gpsLongitudeRaw || null,
      hasGpsStrings: Boolean(gpsLatitudeRaw || gpsLongitudeRaw),
    },
  };
}

export async function readServerPhotoMetadata(buffer, fileName) {
  let metadata = null;
  try {
    metadata = await sharp(buffer, { failOn: "none" }).metadata();
  } catch {
    return {
      fileName,
      captureTime: "",
      gps: null,
      unsupported: true,
    };
  }

  const xmp = String(metadata?.xmpAsString || "");
  const parsedXmp = xmp ? parseXmpPacket(xmp) : { captureTime: "", gps: null, debug: null };

  return {
    fileName: String(fileName || "").trim(),
    captureTime: parsedXmp.captureTime || "",
    gps: parsedXmp.gps || null,
    unsupported: false,
    debug: {
      format: metadata?.format || null,
      hasExif: Boolean(metadata?.exif),
      hasXmp: Boolean(metadata?.xmp || metadata?.xmpAsString),
      hasIptc: Boolean(metadata?.iptc),
      xmpPreview: xmp ? xmp.slice(0, 240) : "",
      xmpGpsDebug: parsedXmp.debug || null,
    },
  };
}
