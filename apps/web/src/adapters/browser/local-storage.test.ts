import assert from "node:assert/strict";
import test from "node:test";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "./local-storage.ts";

test("browser storage is inert when no window exists", () => {
  assert.equal(readLocalStorage("notespace:test"), null);
  assert.equal(writeLocalStorage("notespace:test", "value"), false);
  assert.doesNotThrow(() => removeLocalStorage("notespace:test"));
});
