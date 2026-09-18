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

test("uses one outsourced allowance plus incremental multi-location cost", () => {
  assert.deepEqual(
    calculateDtfLocationCost({
      quantity: 40,
      baseAllowancePerShirtCents: 550,
      placementCostsPerShirtCents: [150, 350],
    }),
    {
      location_count: 2,
      base_allowance_per_shirt_cents: 550,
      additional_location_cost_per_shirt_cents: 150,
      cost_per_shirt_cents: 700,
      total_cost_cents: 28000,
    }
  );
});

test("keeps a single-location in-house allowance at three dollars per shirt", () => {
  assert.equal(
    calculateDtfLocationCost({
      quantity: 8,
      baseAllowancePerShirtCents: 300,
      placementCostsPerShirtCents: [350],
    }).total_cost_cents,
    2400
  );
});

test("adds the smaller incremental cost for full-front and full-back printing", () => {
  const cost = calculateDtfLocationCost({
    quantity: 30,
    baseAllowancePerShirtCents: 550,
    placementCostsPerShirtCents: [250, 350],
  });

  assert.equal(cost.additional_location_cost_per_shirt_cents, 250);
  assert.equal(cost.cost_per_shirt_cents, 800);
  assert.equal(cost.total_cost_cents, 24000);
});
