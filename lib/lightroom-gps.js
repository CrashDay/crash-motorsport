function parseCoordinateValue(value, ref = "") {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? applyHemisphere(value, ref) : null;
  }

  if (Array.isArray(value)) {
    if (!value.length) return null;
    if (value.length === 1) return parseCoordinateValue(value[0], ref);
    const degrees = parseCoordinateValue(value[0]);
    const minutes = parseCoordinateValue(value[1]);
    const seconds = parseCoordinateValue(value[2] ?? 0);
    if (![degrees, minutes, seconds].every(Number.isFinite)) return null;
    const decimal = Math.abs(degrees) + minutes / 60 + seconds / 3600;
    const signed = degrees < 0 ? -decimal : decimal;
    return applyHemisphere(signed, ref);
  }

  if (typeof value === "object") {
    if ("value" in value) return parseCoordinateValue(value.value, ref || value.ref || value.reference);
    if ("decimal" in value) return parseCoordinateValue(value.decimal, ref || value.ref || value.reference);
    if ("degrees" in value || "minutes" in value || "seconds" in value) {
      return parseCoordinateValue(
        [value.degrees ?? 0, value.minutes ?? 0, value.seconds ?? 0],
        ref || value.ref || value.reference
      );
    }
    if ("numerator" in value && "denominator" in value) {
      const numerator = Number(value.numerator);
      const denominator = Number(value.denominator);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
      return numerator / denominator;
    }
    return null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(",", ".");
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return applyHemisphere(numeric, ref);

  const dms = normalized.match(
    /^(-?\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)?\D*(\d+(?:\.\d+)?)?\D*([NSEW])?$/i
  );
  if (!dms) return null;

  const degrees = Number(dms[1]);
  const minutes = Number(dms[2] || 0);
  const seconds = Number(dms[3] || 0);
  if (![degrees, minutes, seconds].every(Number.isFinite)) return null;

  const decimal = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  const signed = degrees < 0 ? -decimal : decimal;
  return applyHemisphere(signed, dms[4] || ref);
}

function applyHemisphere(value, ref = "") {
  if (!Number.isFinite(value)) return null;
  const hemisphere = String(ref || "")
    .trim()
    .toUpperCase();
  if (hemisphere === "S" || hemisphere === "W") return -Math.abs(value);
  if (hemisphere === "N" || hemisphere === "E") return Math.abs(value);
  return value;
}

function getByPath(input, path) {
  return path.reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    return current[key];
  }, input);
}

function firstDefinedValue(input, paths) {
  for (const path of paths) {
    const value = getByPath(input, path);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return undefined;
}

function extractGpsFromLightroomAsset(asset) {
  const latValue = firstDefinedValue(asset, [
    ["payload", "gps", "latitude"],
    ["payload", "gps", "lat"],
    ["payload", "location", "latitude"],
    ["payload", "location", "lat"],
    ["payload", "location", "coordinate", "latitude"],
    ["payload", "location", "coordinate", "lat"],
    ["payload", "coordinate", "latitude"],
    ["payload", "coordinate", "lat"],
    ["payload", "latitude"],
    ["payload", "lat"],
    ["payload", "exif", "GPSLatitude"],
    ["payload", "exif", "gpsLatitude"],
    ["payload", "xmp", "exif", "GPSLatitude"],
    ["payload", "xmp", "exif", "gpsLatitude"],
    ["payload", "xmp", "exifEX", "GPSLatitude"],
    ["payload", "metadata", "gps", "latitude"],
  ]);
  const lngValue = firstDefinedValue(asset, [
    ["payload", "gps", "longitude"],
    ["payload", "gps", "lng"],
    ["payload", "gps", "lon"],
    ["payload", "location", "longitude"],
    ["payload", "location", "lng"],
    ["payload", "location", "lon"],
    ["payload", "location", "coordinate", "longitude"],
    ["payload", "location", "coordinate", "lng"],
    ["payload", "location", "coordinate", "lon"],
    ["payload", "coordinate", "longitude"],
    ["payload", "coordinate", "lng"],
    ["payload", "coordinate", "lon"],
    ["payload", "longitude"],
    ["payload", "lng"],
    ["payload", "lon"],
    ["payload", "exif", "GPSLongitude"],
    ["payload", "exif", "gpsLongitude"],
    ["payload", "xmp", "exif", "GPSLongitude"],
    ["payload", "xmp", "exif", "gpsLongitude"],
    ["payload", "xmp", "exifEX", "GPSLongitude"],
    ["payload", "metadata", "gps", "longitude"],
  ]);

  const latRef = firstDefinedValue(asset, [
    ["payload", "gps", "latitudeRef"],
    ["payload", "gps", "latRef"],
    ["payload", "exif", "GPSLatitudeRef"],
    ["payload", "xmp", "exif", "GPSLatitudeRef"],
    ["payload", "xmp", "exifEX", "GPSLatitudeRef"],
  ]);
  const lngRef = firstDefinedValue(asset, [
    ["payload", "gps", "longitudeRef"],
    ["payload", "gps", "lngRef"],
    ["payload", "gps", "lonRef"],
    ["payload", "exif", "GPSLongitudeRef"],
    ["payload", "xmp", "exif", "GPSLongitudeRef"],
    ["payload", "xmp", "exifEX", "GPSLongitudeRef"],
  ]);

  const lat = parseCoordinateValue(latValue, latRef);
  const lng = parseCoordinateValue(lngValue, lngRef);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

module.exports = {
  extractGpsFromLightroomAsset,
  parseCoordinateValue,
};
