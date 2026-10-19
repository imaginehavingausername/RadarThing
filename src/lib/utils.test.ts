import assert from "node:assert/strict";
import test from "node:test";

import { getCompactAircraftType, normalizeAircraftType } from "./utils";

test("normalizes Antonov An-124 names to A124", () => {
  assert.equal(normalizeAircraftType("ANTONOV"), "A124");
  assert.equal(normalizeAircraftType("Antonov AN-124"), "A124");
  assert.equal(normalizeAircraftType("AN124"), "A124");
  assert.equal(getCompactAircraftType("ANTONOV"), "A124");
});

test("normalizes live Antonov An-140 stream names to A140", () => {
  assert.equal(normalizeAircraftType("Antonov An-140"), "A140");
  assert.equal(getCompactAircraftType("Antonov An-140"), "A140");
});

test("normalizes the Airbus A220-300 to its ICAO designator BCS3", () => {
  assert.equal(normalizeAircraftType("A220"), "BCS3");
  assert.equal(normalizeAircraftType("Airbus A220"), "BCS3");
  assert.equal(normalizeAircraftType("A220-300"), "BCS3");
  assert.equal(normalizeAircraftType("Airbus A220-300"), "BCS3");
  assert.equal(getCompactAircraftType("A220-300"), "BCS3");
  assert.equal(getCompactAircraftType("A223"), "BCS3");
  assert.equal(getCompactAircraftType("A220"), "BCS3");
  assert.equal(getCompactAircraftType("A220-100"), "A221");
});

test("normalizes Dornier names to ICAO type designators", () => {
  assert.equal(normalizeAircraftType("DORNIER"), "D328");
  assert.equal(getCompactAircraftType("DORNIER"), "D328");
  assert.equal(getCompactAircraftType("Dornier 328"), "D328");
  assert.equal(getCompactAircraftType("Dornier Do 328"), "D328");
  assert.equal(getCompactAircraftType("Do-228"), "D228");
  assert.equal(getCompactAircraftType("Dornier 328JET"), "J328");
  assert.equal(getCompactAircraftType("Fairchild Dornier 328 Jet"), "J328");
});
