import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { windowsPESubsystem } from "./assert-windows-pe-subsystem.mjs";

function binary(subsystem, magic = 0x20b) {
  const file = Buffer.alloc(512);
  file.write("MZ");
  file.writeUInt32LE(0x80, 0x3c);
  file.write("PE\0\0", 0x80, "binary");
  file.writeUInt16LE(0xE0, 0x80 + 20);
  file.writeUInt16LE(magic, 0x80 + 24);
  file.writeUInt16LE(subsystem, 0x80 + 24 + 0x44);
  return file;
}

test("Windows PE parser recognizes GUI and console subsystems for PE32 and PE32+", () => {
  for (const magic of [0x10b, 0x20b]) {
    assert.equal(windowsPESubsystem(binary(2, magic)), 2);
    assert.equal(windowsPESubsystem(binary(3, magic)), 3);
  }
});

test("rejects malformed PE files and truncated headers", () => {
  assert.throws(() => windowsPESubsystem(Buffer.alloc(16)), /DOS header/);
  const truncated = binary(2).subarray(0, 170);
  assert.throws(() => windowsPESubsystem(truncated), /optional header/);
  const invalid = binary(2);
  invalid.write("BAD!", 0x80);
  assert.throws(() => windowsPESubsystem(invalid), /PE header/);
});

test("release Tauri target is a GUI app, while debug keeps terminal diagnostics", () => {
  const source = readFileSync(new URL("../apps/desktop/src-tauri/src/main.rs", import.meta.url), "utf8");
  assert.match(source, /cfg_attr\(all\(target_os = "windows", not\(debug_assertions\)\), windows_subsystem = "windows"\)/);
});

test("Windows Go sidecar uses GUI subsystem without losing pipe-based readiness protocol", () => {
  const build = readFileSync(new URL("prepare-desktop-sidecar.mjs", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../apps/desktop/src-tauri/src/lib.rs", import.meta.url), "utf8");
  const backup = readFileSync(new URL("../apps/desktop/src-tauri/src/desktop_recovery.rs", import.meta.url), "utf8");
  assert.match(build, /process\.platform === "win32"\) \{\s*goBuildArgs\.push\("-ldflags", "-H=windowsgui"\)/);
  assert.match(runtime, /NOTESPACE_READY_STDOUT/);
  assert.match(runtime, /wait_for_readiness\(&mut events/);
  assert.match(backup, /NOTESPACE_SNAPSHOT_ONLY/);
  assert.match(backup, /NOTESPACE_SNAPSHOT=/);
});
