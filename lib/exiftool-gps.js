const { spawnSync } = require("child_process");

function readGpsFromExiftool(filePath) {
  try {
    const result = spawnSync("exiftool", ["-json", "-n", "-GPSLatitude", "-GPSLongitude", filePath], {
      encoding: "utf8",
    });
    if (result.error || result.status !== 0) return null;
    const json = JSON.parse(result.stdout || "[]");
    const item = json[0];
    if (!item) return null;
    const lat = Number(item.GPSLatitude);
    const lon = Number(item.GPSLongitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

module.exports = {
  readGpsFromExiftool,
};
