const test = require("node:test");
const assert = require("node:assert/strict");
const { recommendDtfProduction } = require("../lib/dtf-production");

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
