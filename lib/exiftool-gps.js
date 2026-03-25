const { spawnSync } = require("child_process");

function readGpsFromExiftool(filePath) {
  const metadata = readPhotoMetadataFromExiftool(filePath);
  if (!metadata?.gps) return null;
  return metadata.gps;
}

function normalizeExifTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/^(\d{4}):(\d{2}):(\d{2})\s+/, "$1-$2-$3T")
    .replace(/(\.\d+)?([+-]\d{2}:\d{2}|Z)?$/, "$1$2");
  const epoch = Date.parse(normalized);
  if (!Number.isFinite(epoch)) return null;
  return new Date(epoch).toISOString();
}

function readPhotoMetadataFromExiftool(filePath) {
  try {
    const exe = process.env.EXIFTOOL_PATH || "exiftool";
    const result = spawnSync(
      exe,
      [
        "-json",
        "-n",
        "-GPSLatitude",
        "-GPSLongitude",
        "-DateTimeOriginal",
        "-SubSecDateTimeOriginal",
        "-CreateDate",
        "-FileModifyDate",
        "-FileName",
        filePath,
      ],
      {
      encoding: "utf8",
      }
    );
    if (result.error || result.status !== 0) return null;
    const json = JSON.parse(result.stdout || "[]");
    const item = json[0];
    if (!item) return null;
    const lat = Number(item.GPSLatitude);
    const lon = Number(item.GPSLongitude);
    const gps = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    const captureTime =
      normalizeExifTimestamp(item.SubSecDateTimeOriginal) ||
      normalizeExifTimestamp(item.DateTimeOriginal) ||
      normalizeExifTimestamp(item.CreateDate) ||
      normalizeExifTimestamp(item.FileModifyDate) ||
      null;

    return {
      fileName: String(item.FileName || "").trim() || null,
      captureTime,
      gps,
    };
  } catch {
    return null;
  }
}

module.exports = {
  readGpsFromExiftool,
  readPhotoMetadataFromExiftool,
};
