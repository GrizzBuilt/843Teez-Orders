const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateDtfLocationCost,
  recommendDtfProduction,
} = require("../lib/dtf-production");

test("keeps small orders in house", () => {
  assert.equal(
    recommendDtfProduction({
      quantity: 9,
      placements: ["left_chest", "full_back"],
    }).source,
    "in_house_dtf"
  );
});

test("keeps a simple 10-piece left-chest job in house", () => {
  assert.equal(
    recommendDtfProduction({ quantity: 10, placements: ["left_chest"] }).source,
    "in_house_dtf"
  );
});

test("outsources a 10-piece large-placement job", () => {
  assert.equal(
    recommendDtfProduction({ quantity: 10, placements: ["full_back"] }).source,
    "outsourced_dtf"
  );
});

test("outsources a 10-piece multi-location job", () => {
  assert.equal(
    recommendDtfProduction({
      quantity: 10,
      placements: ["left_chest", "sleeve"],
    }).source,
    "outsourced_dtf"
  );
});

test("outsources orders of 25 or more", () => {
  assert.equal(
    recommendDtfProduction({ quantity: 25, placements: ["left_chest"] }).source,
    "outsourced_dtf"
  );
});

test("rush work stays in house even at higher quantities", () => {
  assert.equal(
    recommendDtfProduction({
      quantity: 40,
      placements: ["left_chest", "full_back"],
      rush: true,
    }).source,
    "in_house_dtf"
  );
});

test("charges the standard DTF allowance for every base print location", () => {
  assert.deepEqual(
    calculateDtfLocationCost({
      quantity: 40,
      locationCount: 2,
      costPerLocationCents: 550,
    }),
    {
      location_count: 2,
      cost_per_location_cents: 550,
      cost_per_shirt_cents: 1100,
      total_cost_cents: 44000,
    }
  );
});

test("keeps a single-location in-house allowance at three dollars per shirt", () => {
  assert.equal(
    calculateDtfLocationCost({
      quantity: 8,
      locationCount: 1,
      costPerLocationCents: 300,
    }).total_cost_cents,
    2400
  );
});
