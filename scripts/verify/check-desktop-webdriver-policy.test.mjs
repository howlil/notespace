import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Tauri commands for the authenticated loopback UI have explicit least-privilege ACL grants", () => {
  const build = readFileSync(new URL("../../apps/desktop/src-tauri/build.rs", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../../apps/desktop/src-tauri/src/lib.rs", import.meta.url), "utf8");
  const local = JSON.parse(readFileSync(new URL("../../apps/desktop/src-tauri/capabilities/default.json", import.meta.url), "utf8"));
  const loopback = JSON.parse(readFileSync(new URL("../../apps/desktop/src-tauri/capabilities/loopback.json", import.meta.url), "utf8"));

  const handlers = runtime.match(/\.invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/)?.[1];
  const manifest = build.match(/\.commands\(&\[([\s\S]*?)\]\)/)?.[1];
  assert.ok(handlers && manifest, "Tauri command handler and ACL build manifest must both exist");
  const registered = handlers.split(",").map((x) => x.trim()).filter(Boolean);
  const declared = [...manifest.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...declared].sort(), [...registered].sort(), "Every native command must be explicitly governed by ACL");

  assert.equal(loopback.local, false, "Loopback permissions must not be granted to the bundled recovery UI");
  assert.deepEqual(loopback.windows, ["main"]);
  assert.deepEqual(loopback.remote.urls, ["http://127.0.0.1:*/*"]);
  assert.equal(local.remote, undefined, "Startup capability must never grant remote origins");
  for (const command of registered.filter((x) => x !== "desktop_retry_runtime")) {
    assert.ok(loopback.permissions.includes(`allow-${command.replaceAll("_", "-")}`), `Loopback UI command not permitted: ${command}`);
  }
  for (const permission of [
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:window:allow-is-focused",
    "core:window:allow-is-maximized",
  ]) {
    assert.ok(loopback.permissions.includes(permission), `Loopback titlebar window permission missing: ${permission}`);
  }
  assert.ok(!loopback.permissions.includes("allow-desktop-retry-runtime"), "Untrusted loopback pages cannot restart the sidecar");
  assert.ok(!loopback.permissions.some((x) => typeof x === "string" && (x.startsWith("shell:") || x.startsWith("fs:"))), "Remote UI must not receive shell or filesystem access");
  assert.ok(local.permissions.includes("allow-desktop-retry-runtime"), "Bundled recovery UI retains retry action");
});

test("Windows desktop and sidecar binaries keep GUI subsystem flags", () => {
  const main = readFileSync(new URL("../../apps/desktop/src-tauri/src/main.rs", import.meta.url), "utf8");
  const prepare = readFileSync(new URL("../dev/prepare-desktop-sidecar.mjs", import.meta.url), "utf8");
  assert.match(main, /windows_subsystem = "windows"/);
  assert.match(prepare, /"-H=windowsgui"/);
});
