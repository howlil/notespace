import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const desktop = readFileSync(new URL("../.github/workflows/verify-desktop.yml", import.meta.url), "utf8");
const release = readFileSync(new URL("../.github/workflows/release-desktop.yml", import.meta.url), "utf8");
const driver = readFileSync(new URL("desktop-webdriver-smoke.mjs", import.meta.url), "utf8");

test("Windows native WebView2 acceptance runs on compatible image without bypass", () => {
  assert.match(desktop, /check-desktop-windows:\s*#?[^]*?runs-on: windows-2022/);
  assert.match(desktop, /name: Run native WebDriver parity smoke\s+run: pnpm test:desktop:native/);
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
  assert.match(driver, /if \(critical\) \{\s*await closeDesktopWindow\(driver\);\s*await waitForLocalServerExit\(\);/);
  assert.doesNotMatch(driver, /keyDown\(Key\.ALT\)/);
});
