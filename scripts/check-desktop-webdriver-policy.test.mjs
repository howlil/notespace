import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const desktop = readFileSync(new URL("../.github/workflows/verify-desktop.yml", import.meta.url), "utf8");
const release = readFileSync(new URL("../.github/workflows/release-desktop.yml", import.meta.url), "utf8");
const driver = readFileSync(new URL("desktop-webdriver-smoke.mjs", import.meta.url), "utf8");

test("Windows native WebView2 acceptance runs on compatible image without bypass", () => {
  assert.match(desktop, /check-desktop-windows:\s*#?[^]*?runs-on: windows-2022/);
  assert.doesNotMatch(desktop, /run: pnpm test:desktop:native/, "Critical native smoke already covers parity without a duplicate launch");
  assert.match(desktop, /name: Run critical native close and SQLite relaunch before MSI release[\s\S]*?run: pnpm test:desktop:critical/);
  assert.match(desktop, /NOTESPACE_DESKTOP_TEST_DATA_DIR:/);
  assert.match(desktop, /name: Install Microsoft EdgeDriver matching WebView2 Runtime/);
  assert.match(desktop, /scripts\/install-webview2-edgedriver\.ps1/);
  assert.doesNotMatch(desktop, /msedgedriver-tool/);
});

test("Latest Windows builds and Rust tests remain mandatory without fake UI acceptance", () => {
  assert.match(desktop, /check-desktop-windows-latest:\s+runs-on: windows-latest/);
  assert.match(desktop, /name: Native Rust tests on current Windows/);
  assert.match(desktop, /name: Build desktop on current Windows/);
});

test("Release candidate still requires real UI and installed MSI upgrade", () => {
  assert.match(release, /windows-installer:[\s\S]*?runs-on: windows-2022/);
  assert.match(release, /name: Smoke release binary/);
  assert.match(release, /name: Verify release product persistence/);
  assert.match(release, /name: Gate release on real MSI upgrade and user-data preservation/);
  assert.match(release, /name: Install Microsoft EdgeDriver matching WebView2 Runtime/);
});

test("Native smoke launches real WebView2 and explicitly reports session failure", () => {
  assert.match(driver, /new Builder\(\)\.usingServer\(driverUrl\)\.withCapabilities\(capabilities\)\.build\(\)/);
  assert.match(driver, /NATIVE_WEBDRIVER_SESSION_FAILED/);
  assert.match(driver, /await waitForDesktopRuntime\(driver\)/);
});

// A real Tauri close event is mandatory: relying on WebDriver's synthetic
// Alt+F4 leaves some Windows runners waiting even though the UI is healthy.
test("critical smoke requests a native close and verifies sidecar exit before relaunch", () => {
  const runtime = readFileSync(new URL("../apps/desktop/src-tauri/src/lib.rs", import.meta.url), "utf8");
  assert.match(runtime, /fn request_desktop_close\(app: AppHandle\)/);
  assert.match(runtime, /window\s*\.close\(\)/);
  assert.match(driver, /invoke\("request_desktop_close"\)/);
  assert.match(driver, /getAllWindowHandles\(\)/);
  assert.match(driver, /isExpectedNativeCloseDisconnect\(error\)/);
  assert.match(driver, /if \(!isExpectedNativeCloseDisconnect\(error\)\) throw error;\s*await waitForLocalServerExit\(\);/);
  assert.match(runtime, /fn allow_desktop_close\(app: AppHandle\)[\s\S]*?tauri::async_runtime::spawn_blocking\(move \|\| \{\s*stop_runtime\(&app\);\s*app.exit\(0\);/);
  // The old sidecar's Terminated event must still signal the shutdown waiter
  // after the supervisor generation has advanced. Otherwise a normal close
  // waits 12s and force-kills the child despite a successful Go shutdown.
  assert.match(runtime, /generation\.load\(Ordering::Acquire\) != generation \{[\s\S]*?matches!\(&event, CommandEvent::Terminated\(_\)\)[\s\S]*?mark_sidecar_exited\(&sidecar_exited\);/);
  assert.match(runtime, /mark_sidecar_exited\(&sidecar_exited\);\s*if stop_runtime_expected\(app, Some\(generation\)\)/);
  assert.match(driver, /if \(critical\) \{[\s\S]*?await closeDesktopWindow\(driver\);[\s\S]*?await waitForLocalServerExit\(\);[\s\S]*?\}\s*await driver.quit/);
  assert.doesNotMatch(driver, /keyDown\(Key\.ALT\)/);
});

test("Tauri commands for the authenticated loopback UI have explicit least-privilege ACL grants", () => {
  const build = readFileSync(new URL("../apps/desktop/src-tauri/build.rs", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../apps/desktop/src-tauri/src/lib.rs", import.meta.url), "utf8");
  const local = JSON.parse(readFileSync(new URL("../apps/desktop/src-tauri/capabilities/default.json", import.meta.url), "utf8"));
  const loopback = JSON.parse(readFileSync(new URL("../apps/desktop/src-tauri/capabilities/loopback.json", import.meta.url), "utf8"));

  const handlers = runtime.match(/\.invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/)?.[1];
  const manifest = build.match(/\.commands\(&\[([\s\S]*?)\]\)/)?.[1];
  assert.ok(handlers && manifest, "Tauri command handler and ACL build manifest must both exist");
  const registered = handlers.split(",").map(x => x.trim()).filter(Boolean);
  const declared = [...manifest.matchAll(/"([a-z_]+)"/g)].map(m => m[1]);
  assert.deepEqual([...declared].sort(), [...registered].sort(), "Every native command must be explicitly governed by ACL");

  assert.equal(loopback.local, false, "Loopback permissions must not be granted to the bundled recovery UI");
  assert.deepEqual(loopback.windows, ["main"]);
  assert.deepEqual(loopback.remote.urls, ["http://127.0.0.1:*/*"]);
  assert.equal(local.remote, undefined, "Startup capability must never grant remote origins");
  for (const command of registered.filter(x => x !== "desktop_retry_runtime")) {
    assert.ok(loopback.permissions.includes(`allow-${command.replaceAll("_", "-")}`), `Loopback UI command not permitted: ${command}`);
  }
  assert.ok(!loopback.permissions.includes("allow-desktop-retry-runtime"), "Untrusted loopback pages cannot restart the sidecar");
  assert.ok(!loopback.permissions.some(x => typeof x === "string" && (x.startsWith("shell:") || x.startsWith("fs:"))), "Remote UI must not receive shell or filesystem access");
  assert.ok(local.permissions.includes("allow-desktop-retry-runtime"), "Bundled recovery UI retains retry action");
  assert.match(driver, /invoke\("request_desktop_close"\)/);
});

test("Windows MSI release must reject executable console windows before publishing", () => {
  const main = readFileSync(new URL("../apps/desktop/src-tauri/src/main.rs", import.meta.url), "utf8");
  const prepare = readFileSync(new URL("prepare-desktop-sidecar.mjs", import.meta.url), "utf8");
  const beta = readFileSync(new URL("../.github/workflows/publish-desktop-beta.yml", import.meta.url), "utf8");

  assert.match(main, /windows_subsystem = "windows"/);
  assert.match(prepare, /"-H=windowsgui"/);
  for (const flow of [beta, release]) {
    assert.match(flow, /node scripts\/assert-windows-pe-subsystem\.mjs\s+apps\/desktop\/src-tauri\/target\/release\/notespace-desktop\.exe\s+apps\/desktop\/src-tauri\/binaries\/notespace-server-x86_64-pc-windows-msvc\.exe/);
  }
  assert.match(desktop, /name: Verify Go Windows GUI subsystem/);
  assert.match(desktop, /scripts\/assert-windows-pe-subsystem\.test\.mjs/);
  assert.match(desktop, /name: Run critical native close and SQLite relaunch before MSI release/);
});
