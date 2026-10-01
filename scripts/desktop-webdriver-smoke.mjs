import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { Builder, Capabilities } from "selenium-webdriver";

const root = resolve(import.meta.dirname, "..");
const application = process.env.TAURI_APP_BINARY
  ? resolve(root, process.env.TAURI_APP_BINARY)
  : resolve(root, "apps/desktop/src-tauri/target/debug/notespace-desktop.exe");
const driverBinary = process.env.TAURI_DRIVER ?? "tauri-driver";
const nativeDriver = process.env.TAURI_NATIVE_DRIVER ?? resolve(root, "msedgedriver.exe");
const driverUrl = process.env.TAURI_WEBDRIVER_URL ?? "http://127.0.0.1:4444/";
const profileDirectory = process.env.TAURI_NATIVE_PROFILE
  ? resolve(root, process.env.TAURI_NATIVE_PROFILE)
  : resolve(root, ".desktop-webdriver-data");
const persistedKey = "notespace.desktop.webdriver.smoke";

if (!existsSync(application)) {
  throw new Error(`Native application binary not found: ${application}`);
}
mkdirSync(profileDirectory, { recursive: true });

const driverArgs = existsSync(nativeDriver) ? ["--native-driver", nativeDriver] : [];
const driverProcess = spawn(driverBinary, driverArgs, { cwd: root, stdio: ["ignore", "inherit", "inherit"], windowsHide: true });
let driver;

try {
  await waitForWebDriver(driverUrl, driverProcess);
  const capabilities = new Capabilities();
  capabilities.set("tauri:options", {
    application,
    webviewOptions: { userDataFolder: profileDirectory },
  });
  capabilities.setBrowserName("wry");
  driver = await new Builder().usingServer(driverUrl).withCapabilities(capabilities).build();

  await waitForDesktopRuntime(driver);
  const firstUrl = await driver.getCurrentUrl();
  assert.match(firstUrl, /^http:\/\/127\.0\.0\.1:49832\//, "desktop must use the stable loopback origin");
  await driver.executeScript(
    "localStorage.setItem(arguments[0], arguments[1]);",
    persistedKey,
    "persisted",
  );
  await driver.quit();
  driver = undefined;

  driver = await new Builder().usingServer(driverUrl).withCapabilities(capabilities).build();
  await waitForDesktopRuntime(driver);
  const restored = await driver.executeScript("return localStorage.getItem(arguments[0]);", persistedKey);
  assert.equal(restored, "persisted", "desktop browser state must survive relaunch");
  await driver.executeScript("localStorage.removeItem(arguments[0]);", persistedKey);
  console.log("native WebDriver smoke passed: launch, stable origin, relaunch persistence");
} finally {
  if (driver) await driver.quit().catch(() => {});
  driverProcess.kill();
}

async function waitForDesktopRuntime(session) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const title = await session.getTitle();
      const url = await session.getCurrentUrl();
      if (title.includes("Notespace") && url.startsWith("http://127.0.0.1:49832/")) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("Timed out waiting for the Notespace desktop runtime.");
}

async function waitForWebDriver(url, child) {
  const endpoint = new URL("status", url);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`tauri-driver exited with code ${child.exitCode}`);
    try {
      const response = await fetch(endpoint);
      if (response.ok) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Timed out waiting for tauri-driver at ${endpoint}`);
}
