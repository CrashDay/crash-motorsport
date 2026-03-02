const { getRegionsByTrack } = require("./regions");

function normalizeText(input) {
  if (!input) return "";
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getRegionIdFromAltText(trackId, altText) {
  const regions = getRegionsByTrack(trackId);
  if (!regions.length) return null;

  const hay = normalizeText(altText);
  if (!hay) return null;

  for (const region of regions) {
    for (const alias of region.aliases || []) {
      const needle = normalizeText(alias);
      if (needle && hay.includes(needle)) {
        return region.region_id;
      }
    }
  }

  return null;
}

module.exports = {
  normalizeText,
  getRegionIdFromAltText,
};
