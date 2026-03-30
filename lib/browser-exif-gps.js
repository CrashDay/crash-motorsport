const JPEG_SOI = 0xffd8;

function toAscii(view, start, length) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const code = view.getUint8(start + i);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

function readRational(view, offset, littleEndian) {
  const numerator = view.getUint32(offset, littleEndian);
  const denominator = view.getUint32(offset + 4, littleEndian);
  if (!denominator) return null;
  return numerator / denominator;
}

function readTagValue(view, tiffStart, type, count, valueOffset, littleEndian) {
  const valueByteLengthByType = {
    1: 1,
    2: 1,
    3: 2,
    4: 4,
    5: 8,
  };
  const unitSize = valueByteLengthByType[type];
  if (!unitSize) return null;
  const totalSize = unitSize * count;
  const inlineOffset = valueOffset;
  const dataOffset = totalSize <= 4 ? inlineOffset : tiffStart + view.getUint32(valueOffset, littleEndian);

  if (type === 2) {
    return toAscii(view, dataOffset, count);
  }
  if (type === 3) {
    if (count === 1) return view.getUint16(dataOffset, littleEndian);
    const values = [];
    for (let i = 0; i < count; i += 1) values.push(view.getUint16(dataOffset + i * 2, littleEndian));
    return values;
  }
  if (type === 4) {
    if (count === 1) return view.getUint32(dataOffset, littleEndian);
    const values = [];
    for (let i = 0; i < count; i += 1) values.push(view.getUint32(dataOffset + i * 4, littleEndian));
    return values;
  }
  if (type === 5) {
    if (count === 1) return readRational(view, dataOffset, littleEndian);
    const values = [];
    for (let i = 0; i < count; i += 1) values.push(readRational(view, dataOffset + i * 8, littleEndian));
    return values;
  }
  if (type === 1) {
    if (count === 1) return view.getUint8(dataOffset);
    const values = [];
    for (let i = 0; i < count; i += 1) values.push(view.getUint8(dataOffset + i));
    return values;
  }
  return null;
}

function readIfd(view, tiffStart, ifdOffset, littleEndian) {
  const entries = new Map();
  const dirStart = tiffStart + ifdOffset;
  const entryCount = view.getUint16(dirStart, littleEndian);
  for (let i = 0; i < entryCount; i += 1) {
    const entryOffset = dirStart + 2 + i * 12;
    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const value = readTagValue(view, tiffStart, type, count, entryOffset + 8, littleEndian);
    entries.set(tag, value);
  }
  return entries;
}

function parseExifDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/
  );
  if (!match) return "";
  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  const millis = fraction ? `.${fraction.slice(0, 3).padEnd(3, "0")}` : ".000";
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${millis}Z`;
}

function parseIsoLikeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const epoch = Date.parse(raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3"));
  if (!Number.isFinite(epoch)) return "";
  return new Date(epoch).toISOString();
}

function gpsPartsToDecimal(parts, ref) {
  if (!Array.isArray(parts) || parts.length < 3) return null;
  const [deg, min, sec] = parts.map((value) => Number(value));
  if (![deg, min, sec].every(Number.isFinite)) return null;
  let decimal = deg + min / 60 + sec / 3600;
  const direction = String(ref || "").trim().toUpperCase();
  if (direction === "S" || direction === "W") decimal *= -1;
  return decimal;
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

function decodeUtf8(buffer, start, length) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer.slice(start, start + length));
  } catch {
    return "";
  }
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
    gps:
      Number.isFinite(lat) && Number.isFinite(lon)
        ? { lat, lon }
        : null,
    debug: {
      gpsLatitudeRaw: gpsLatitudeRaw || null,
      gpsLongitudeRaw: gpsLongitudeRaw || null,
      hasGpsStrings: Boolean(gpsLatitudeRaw || gpsLongitudeRaw),
    },
  };
}

export function parseJpegMetadata(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== JPEG_SOI) return null;

  let bestCaptureTime = "";
  let bestGps = null;
  let exifGpsDebug = null;
  let xmpGpsDebug = null;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    offset += 2;
    if (marker === 0xda || marker === 0xd9) break;
    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > view.byteLength) break;
    if (marker === 0xe1) {
      const exifHeader = toAscii(view, offset + 2, 6);
      if (exifHeader === "Exif\0\0") {
        const tiffStart = offset + 8;
        const endianMarker = toAscii(view, tiffStart, 2);
        const littleEndian = endianMarker === "II";
        const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
        const ifd0 = readIfd(view, tiffStart, firstIfdOffset, littleEndian);
        const exifIfdOffset = Number(ifd0.get(0x8769) || 0);
        const gpsIfdOffset = Number(ifd0.get(0x8825) || 0);
        const exifIfd = exifIfdOffset ? readIfd(view, tiffStart, exifIfdOffset, littleEndian) : new Map();
        const gpsIfd = gpsIfdOffset ? readIfd(view, tiffStart, gpsIfdOffset, littleEndian) : new Map();

        const captureTime =
          parseExifDate(exifIfd.get(0x9003)) ||
          parseExifDate(exifIfd.get(0x9004)) ||
          parseExifDate(ifd0.get(0x0132));
        const lat = gpsPartsToDecimal(gpsIfd.get(0x0002), gpsIfd.get(0x0001));
        const lng = gpsPartsToDecimal(gpsIfd.get(0x0004), gpsIfd.get(0x0003));
        exifGpsDebug = {
          gpsLatitudeRef: gpsIfd.get(0x0001) ?? null,
          gpsLatitudeRaw: gpsIfd.get(0x0002) ?? null,
          gpsLongitudeRef: gpsIfd.get(0x0003) ?? null,
          gpsLongitudeRaw: gpsIfd.get(0x0004) ?? null,
          hasGpsTags:
            gpsIfd.has(0x0001) || gpsIfd.has(0x0002) || gpsIfd.has(0x0003) || gpsIfd.has(0x0004),
        };

        if (!bestCaptureTime && captureTime) bestCaptureTime = captureTime;
        if (!bestGps && Number.isFinite(lat) && Number.isFinite(lng)) {
          bestGps = { lat, lon: lng };
        }
      } else {
        const xmpHeader = toAscii(view, offset + 2, 29);
        if (xmpHeader.startsWith("http://ns.adobe.com/xap/1.0/")) {
          const xmp = decodeUtf8(buffer, offset + 31, segmentLength - 31);
          const parsed = parseXmpPacket(xmp);
          xmpGpsDebug = parsed.debug || null;
          if (!bestCaptureTime && parsed.captureTime) bestCaptureTime = parsed.captureTime;
          if (!bestGps && parsed.gps) bestGps = parsed.gps;
        }
      }
    }
    offset += segmentLength;
  }

  return {
    captureTime: bestCaptureTime,
    gps: bestGps,
    debug: {
      exifGpsDebug,
      xmpGpsDebug,
    },
  };
}

export async function readBrowserPhotoMetadata(file) {
  const fileName = String(file?.name || "").trim();
  const lowerName = fileName.toLowerCase();
  if (!/\.(jpe?g)$/i.test(lowerName)) {
    return {
      fileName,
      captureTime: "",
      gps: null,
      unsupported: true,
    };
  }

  const buffer = await file.arrayBuffer();
  const exif = parseJpegMetadata(buffer);
  return {
    fileName,
    captureTime: exif?.captureTime || "",
    gps: exif?.gps || null,
    unsupported: false,
  };
}
