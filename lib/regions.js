const regions = [
  {
    track_id: "sebring",
    region_id: "sebring.turn3.inside",
    label: "Turn 3 (Inside)",
    aliases: ["turn 3 inside", "t3 inside", "turn3 inside"],
    anchor: { x: 839.14, y: 319.3 },
  },
];

function getRegionsByTrack(trackId) {
  return regions.filter((r) => r.track_id === trackId);
}

function getRegionById(regionId) {
  return regions.find((r) => r.region_id === regionId) || null;
}

module.exports = {
  regions,
  getRegionsByTrack,
  getRegionById,
};
