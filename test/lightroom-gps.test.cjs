const test = require("node:test");
const assert = require("node:assert/strict");

test("extractGpsFromLightroomAsset reads decimal gps payload", async () => {
  const { extractGpsFromLightroomAsset } = await import("../lib/lightroom-gps.js");
  const gps = extractGpsFromLightroomAsset({
    payload: {
      gps: {
        latitude: 27.4512,
        longitude: -81.3774,
      },
    },
  });

  assert.deepEqual(gps, { lat: 27.4512, lng: -81.3774 });
});

test("extractGpsFromLightroomAsset reads nested coordinate payload", async () => {
  const { extractGpsFromLightroomAsset } = await import("../lib/lightroom-gps.js");
  const gps = extractGpsFromLightroomAsset({
    payload: {
      location: {
        coordinate: {
          latitude: "27.4512",
          longitude: "-81.3774",
        },
      },
    },
  });

  assert.deepEqual(gps, { lat: 27.4512, lng: -81.3774 });
});

test("extractGpsFromLightroomAsset parses EXIF DMS with hemisphere refs", async () => {
  const { extractGpsFromLightroomAsset } = await import("../lib/lightroom-gps.js");
  const gps = extractGpsFromLightroomAsset({
    payload: {
      exif: {
        GPSLatitude: "27 27 4.32",
        GPSLatitudeRef: "N",
        GPSLongitude: "81 22 38.64",
        GPSLongitudeRef: "W",
      },
    },
  });

  assert.equal(gps.lat.toFixed(6), "27.451200");
  assert.equal(gps.lng.toFixed(6), "-81.377400");
});

test("extractGpsFromLightroomAsset parses structured DMS objects", async () => {
  const { extractGpsFromLightroomAsset } = await import("../lib/lightroom-gps.js");
  const gps = extractGpsFromLightroomAsset({
    payload: {
      xmp: {
        exif: {
          GPSLatitude: { degrees: 27, minutes: 27, seconds: 4.32, ref: "N" },
          GPSLongitude: { degrees: 81, minutes: 22, seconds: 38.64, ref: "W" },
        },
      },
    },
  });

  assert.equal(gps.lat.toFixed(6), "27.451200");
  assert.equal(gps.lng.toFixed(6), "-81.377400");
});
