const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb, upsertPhotoAsset, upsertRegionPin, upsertPinAsset, getPinsByTrack } = require("../lib/db");

test("aggregation: many assets -> one pin with correct photo_count", () => {
  const db = createDb(":memory:");
  const pinId = upsertRegionPin(db, {
    track_id: "sebring",
    region_id: "sebring.turn3.inside",
    anchor_x: 100,
    anchor_y: 200,
    title: "Turn 3 (Inside)",
  });

  const assets = ["a1", "a2", "a3", "a4"].map((id, idx) => ({
    asset_id: id,
    track_id: "sebring",
    capture_time: `2026-02-01T14:0${idx}:00Z`,
    alt_text_snapshot: "turn 3 inside",
    thumb_url: `https://example.com/thumb-${id}.jpg`,
    full_url: `https://example.com/full-${id}.jpg`,
    last_synced_at: "2026-02-02T00:00:00Z",
  }));

  for (const asset of assets) {
    upsertPhotoAsset(db, asset);
    upsertPinAsset(db, {
      pin_id: pinId,
      asset_id: asset.asset_id,
      sort_order: Date.parse(asset.capture_time),
      added_at: "2026-02-02T00:00:00Z",
    });
  }

  const pins = getPinsByTrack(db, "sebring");
  assert.equal(pins.length, 1);
  assert.equal(pins[0].photo_count, 4);
});
