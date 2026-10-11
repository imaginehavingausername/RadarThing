import assert from "node:assert/strict";
import { test } from "node:test";
import { screenAcars } from "./acars-moderation";

test("blocks whole-word profanity and slurs", () => {
  assert.deepEqual(screenAcars("What the shit?"), {
    flagged: true,
    categories: ["profanity"],
  });
  assert.deepEqual(screenAcars("F.U.C.K and n!gga"), {
    flagged: true,
    categories: ["profanity", "hate"],
  });
});

test("catches common spelling variations", () => {
  for (const text of ["fuuuck", "b1tch", "sh!t", "a$$hole"]) {
    assert.equal(screenAcars(text).flagged, true, text);
  }
});

test("allows normal flight updates and words containing blocked substrings", () => {
  for (const text of [
    "Passing FL350, cockpit checks complete",
    "Business class service has started",
    "Airbus RETARD callout on landing",
    "Approaching Scunthorpe",
  ]) {
    assert.deepEqual(screenAcars(text), { flagged: false, categories: [] });
  }
});
