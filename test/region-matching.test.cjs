const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeText, getRegionIdFromAltText } = require("../lib/region-matching");

test("normalizeText collapses punctuation and case", () => {
  assert.equal(normalizeText("TURN 3!  INSIDE"), "turn 3 inside");
  assert.equal(normalizeText("t3-inside"), "t3 inside");
});

test("getRegionIdFromAltText matches Turn 3 inside aliases", () => {
  assert.equal(getRegionIdFromAltText("sebring", "Turn 3 inside battle"), "sebring.turn3.inside");
  assert.equal(getRegionIdFromAltText("sebring", "t3 inside!"), "sebring.turn3.inside");
  assert.equal(getRegionIdFromAltText("sebring", "TURN3 INSIDE"), "sebring.turn3.inside");
  assert.equal(getRegionIdFromAltText("sebring", "Turn 5 exit"), null);
});
