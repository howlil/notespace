/* global console, fetch, setTimeout, URL */

import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { Builder, By, Capabilities, Key } from "selenium-webdriver";

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
const critical = process.argv.includes("--critical") || process.env.TAURI_NATIVE_PRODUCT_SMOKE === "1";

if (critical && !process.env.NOTESPACE_DESKTOP_TEST_DATA_DIR) {
  throw new Error("Critical desktop smoke requires NOTESPACE_DESKTOP_TEST_DATA_DIR for isolated product data.");
}
if (critical) {
  process.env.NOTESPACE_TEST_NOTE_SAVE_DELAY_MS ??= "1500";
}

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
  const productMarker = critical ? await runProductPersistenceJourney(driver) : null;
  if (critical) {
    await closeDesktopWindow(driver);
  }
  await driver.quit().catch(() => {});
  driver = undefined;

  driver = await new Builder().usingServer(driverUrl).withCapabilities(capabilities).build();
  await waitForDesktopRuntime(driver);
  const restored = await driver.executeScript("return localStorage.getItem(arguments[0]);", persistedKey);
  assert.equal(restored, "persisted", "desktop browser state must survive relaunch");
  if (critical) {
    assert.ok(productMarker, "critical smoke must have a product marker");
    await assertProductPersistence(driver, productMarker);
  }
  await driver.executeScript("localStorage.removeItem(arguments[0]);", persistedKey);
  console.log(critical
    ? "native WebDriver smoke passed: launch, close flush, product persistence, relaunch persistence"
    : "native WebDriver smoke passed: launch, stable origin, relaunch persistence");
} finally {
  if (driver) await driver.quit().catch(() => {});
  driverProcess.kill();
}

async function runProductPersistenceJourney(session) {
  const workspaceTitle = `Desktop smoke ${Date.now()}`;
  const initialMarker = `Desktop persistence ${Date.now()}`;
  const finalMarker = `${initialMarker} :: flushed before close`;
  const createButton = await visibleElement(session, By.css('main button[aria-label="New workspace"]'));
  await createButton.click();
  const titleInput = await visibleElement(session, By.css('input[aria-label="New workspace name"]'));
  await titleInput.sendKeys(workspaceTitle, Key.ENTER);
  const workspaceLink = await visibleElement(session, By.xpath(`//a[@aria-label=${xpathLiteral(`Open ${workspaceTitle}`)}]`));
  await workspaceLink.click();
  await waitForUrl(session, /\/workspaces\//);
  const editor = await visibleElement(session, By.css('[role="textbox"][aria-label="Workspace document"]'));
  await editor.click();
  await editor.sendKeys(Key.chord(Key.CONTROL, "a"), initialMarker);
  await waitForText(session, "Saving…");
  await editor.sendKeys(" :: flushed before close");
  await waitForEditorText(session, finalMarker);
  return { workspaceTitle, noteMarker: finalMarker };
}

async function assertProductPersistence(session, marker) {
  const workspaceLink = await visibleElement(session, By.xpath(`//a[@aria-label=${xpathLiteral(`Open ${marker.workspaceTitle}`)}]`));
  await workspaceLink.click();
  await waitForUrl(session, /\/workspaces\//);
  const editor = await visibleElement(session, By.css('[role="textbox"][aria-label="Workspace document"]'));
  const content = await editor.getText();
  assert.match(content, new RegExp(escapeRegExp(marker.noteMarker)), "product data must survive desktop relaunch");
}

async function closeDesktopWindow(session) {
  await session.actions()
    .keyDown(Key.ALT)
    .sendKeys(Key.F4)
    .keyUp(Key.ALT)
    .perform();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await session.getTitle();
    } catch {
      return;
    }
    await delay(250);
  }
}

async function visibleElement(session, locator, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const elements = await session.findElements(locator);
      for (const element of elements) {
        if (await element.isDisplayed()) return element;
      }
    } catch {
      // The WebView may not have rendered the next state yet.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for visible element: ${locator}`);
}

async function waitForText(session, text, timeout = 30_000) {
  return visibleElement(session, By.xpath(`//*[normalize-space(.)=${xpathLiteral(text)}]`), timeout);
}

async function waitForEditorText(session, text, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  const locator = By.css('[role="textbox"][aria-label="Workspace document"]');
  while (Date.now() < deadline) {
    try {
      const editor = await visibleElement(session, locator, 1_000);
      if ((await editor.getText()).includes(text)) return editor;
    } catch {
      // The editor can be recreated while the Workspace route hydrates.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Workspace editor text: ${text}`);
}

async function waitForUrl(session, pattern, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (pattern.test(await session.getCurrentUrl())) return;
    } catch {
      // The session can briefly reject commands while the app is relaunching.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for URL matching ${pattern}`);
}

function xpathLiteral(value) {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return `concat(${value.split("'").map((part) => `'${part}'`).join(', "\'", ')})`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForDesktopRuntime(session) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const title = await session.getTitle();
      const url = await session.getCurrentUrl();
      if (title.includes("Notespace") && url.startsWith("http://127.0.0.1:49832/")) return;
    } catch {
      // A closed native window is the expected completion signal.
    }
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
    } catch {
      // tauri-driver is expected to reject requests before it is ready.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Timed out waiting for tauri-driver at ${endpoint}`);
}
