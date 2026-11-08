import assert from "node:assert/strict";
import test from "node:test";
import { installDesktopUpdateWith } from "./install-desktop-update.ts";

test("verified update is installed only after outstanding writes flush", async () => {
  const calls: string[] = [];
  await installDesktopUpdateWith({
    flush: async () => { calls.push("flush"); },
    install: async () => { calls.push("install"); },
  });
  assert.deepEqual(calls, ["flush", "install"]);
});

test("failed save prevents installation of an otherwise signed update", async () => {
  let installed = false;
  await assert.rejects(installDesktopUpdateWith({
    flush: async () => { throw new Error("disk full"); },
    install: async () => { installed = true; },
  }), /disk full/);
  assert.equal(installed, false);
});

test("installer failure propagates without claiming successful update", async () => {
  await assert.rejects(installDesktopUpdateWith({
    flush: async () => {},
    install: async () => { throw new Error("MSI blocked"); },
  }), /MSI blocked/);
});
