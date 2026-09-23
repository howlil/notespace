import assert from "node:assert/strict";
import test from "node:test";
import { errorMessage } from "./error-message.ts";

test("errorMessage preserves Error messages and supplies a fallback", () => {
  assert.equal(errorMessage(new Error("Conflict"), "Could not rename workspace."), "Conflict");
  assert.equal(errorMessage("unknown", "Could not rename workspace."), "Could not rename workspace.");
});
