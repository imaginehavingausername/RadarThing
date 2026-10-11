import assert from "node:assert/strict";
import test from "node:test";
import { moderationErrorMessage } from "./moderation-error";

test("moderation errors show known reasons without exposing Convex diagnostics", () => {
  const selfError = new Error(
    "[CONVEX M(acars:adminRemove)] Server Error: You cannot moderate your own account",
  );
  assert.equal(
    moderationErrorMessage(selfError, "Could not remove entry."),
    "You cannot moderate your own account.",
  );
  assert.equal(
    moderationErrorMessage(
      new Error("[CONVEX M(acars:adminRemove)] Internal server error"),
      "Could not remove entry.",
    ),
    "Could not remove entry.",
  );
});
