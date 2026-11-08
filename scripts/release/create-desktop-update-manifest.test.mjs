import test from "node:test";
import assert from "node:assert/strict";
import { createUpdateManifest } from "./create-desktop-update-manifest.mjs";

test("publishes exact signed installer URL and platform key", () => {
  const update = createUpdateManifest("1.2.3", [{name:"Notespace_1.2.3_x64.msi",signature:"signed bytes"}]);
  assert.equal(update.version, "1.2.3");
  assert.equal(update.platforms["windows-x86_64"].signature, "signed bytes");
  assert.match(update.platforms["windows-x86_64"].url, /releases\/download\/v1\.2\.3\/Notespace_1\.2\.3_x64\.msi$/);
});
test("rejects missing signature, prerelease, and ambiguous candidates", () => {
  assert.throws(() => createUpdateManifest("1.2.3", [{name:"Notespace.msi",signature:""}]), /Invalid/);
  assert.throws(() => createUpdateManifest("1.2.3-beta.1", [{name:"Notespace.msi",signature:"signature"}]), /stable/);
  assert.throws(() => createUpdateManifest("1.2.3", []), /one signed/);
  assert.throws(() => createUpdateManifest("1.2.3", [{name:"a.msi",signature:"s"},{name:"b.msi",signature:"s"}]), /one signed/);
});
