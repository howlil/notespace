/* global console, fetch, setTimeout, URL, AbortSignal */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
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
const upgradeSeed = process.argv.includes("--upgrade-seed");
const upgradeVerify = process.argv.includes("--upgrade-verify");
assert.ok(!(upgradeSeed && upgradeVerify), "Choose one upgrade proof mode");
const upgradeFixture = process.env.NOTESPACE_UPGRADE_FIXTURE;
if ((upgradeSeed || upgradeVerify) && (!upgradeFixture || !process.env.NOTESPACE_DESKTOP_TEST_DATA_DIR)) {
  throw new Error("Upgrade proof requires NOTESPACE_UPGRADE_FIXTURE and isolated NOTESPACE_DESKTOP_TEST_DATA_DIR");
}
const critical = process.argv.includes("--critical") || process.env.TAURI_NATIVE_PRODUCT_SMOKE === "1" || upgradeSeed;

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
// Windows-hosted runners may reserve this fixed port. Fail immediately with
// the actual bind error instead of waiting for WebDriver DevToolsActivePort.
await assertDesktopLoopbackIsAvailable();

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
  if (upgradeSeed) {
    // Run against an INSTALLED historical MSI, never a debug binary.
    // Persist the fixture only after the OS close and sidecar shutdown.
    const marker = await runProductPersistenceJourney(driver);
    Object.assign(marker, await seedDurableDomains(driver));
    await closeDesktopWindow(driver);
    await waitForLocalServerExit();
    await driver.quit().catch(() => {});
    driver = undefined;
    writeFileSync(resolve(upgradeFixture), JSON.stringify(marker, null, 2), { flag: "wx" });
    console.log("upgrade proof: legacy installed app created durable library", marker.workspaceTitle);
  } else if (upgradeVerify) {
    // Run against an INSTALLED candidate MSI with the SAME data and WebView profile.
    const marker = JSON.parse(readFileSync(resolve(upgradeFixture), "utf8"));
    assert.equal(typeof marker.workspaceTitle, "string");
    assert.equal(typeof marker.noteMarker, "string");
    await assertProductPersistence(driver, marker);
    await assertDurableDomains(marker);
    await closeDesktopWindow(driver);
    await waitForLocalServerExit();
    console.log("upgrade proof: candidate installed app read legacy authored state", marker.workspaceTitle);
  } else {
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
  }
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

async function assertDesktopLoopbackIsAvailable() {
  const probe = createServer();
  await new Promise((resolveProbe, rejectProbe) => {
    probe.once("error", error => rejectProbe(new Error(
      `Desktop loopback 127.0.0.1:49832 is unavailable: ${error.message}. Use a Windows runner where this port is not reserved.`
    )));
    probe.listen(49832, "127.0.0.1", () => probe.close(resolveProbe));
  });
}

async function waitForLocalServerExit() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      await fetch("http://127.0.0.1:49832/api/health", { signal: AbortSignal.timeout(1000) });
    } catch {
      return;
    }
    await delay(250);
  }
  throw new Error("Desktop sidecar still serves requests after close; refusing MSI upgrade");
}

// Seed real user-owned aggregates using the installed PREVIOUS version's HTTP
// boundary. Browser fixture alone would only cover Notes and an empty Canvas.
async function requestLocal(path, method = "GET", body, headers = {}) {
  const request = {
    method,
    headers: { ...headers },
  };
  if (body !== undefined) {
    if (body instanceof Uint8Array) {
      request.body = body;
    } else {
      request.body = JSON.stringify(body);
      request.headers["Content-Type"] = "application/json";
    }
  }
  const response = await fetch(`http://127.0.0.1:49832${path}`, request);
  if (!response.ok) {
    throw new Error(`${method} ${path}: HTTP ${response.status} ${await response.text()}`);
  }
  if (response.status === 204) return null;
  const type = response.headers.get("Content-Type") ?? "";
  if (!type.includes("json")) return new Uint8Array(await response.arrayBuffer());
  return response.json();
}

async function seedDurableDomains(session) {
  const url = new URL(await session.getCurrentUrl());
  const match = url.pathname.match(/^\/workspaces\/([^/]+)$/);
  assert.ok(match, "upgrade seed must remain on authored Workspace");
  const workspaceId = decodeURIComponent(match[1]);
  const prefix = `/api/workspaces/${encodeURIComponent(workspaceId)}`;

  const milestone = await requestLocal(`${prefix}/milestones`, "POST", { title: "Upgrade milestone" });
  assert.ok(milestone.id);
  const task = await requestLocal(`${prefix}/tasks`, "POST", { title: "Preserved task", milestoneId: milestone.id });
  assert.ok(task.id);
  const standalone = await requestLocal("/api/tasks", "POST", { title: "Upgrade inbox task" });
  assert.ok(standalone.id);
  const assetId = `upgrade-proof-asset-${Date.now()}`;
  const originalAsset = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  await requestLocal(`${prefix}/assets/${assetId}`, "PUT", originalAsset, { "Content-Type": "image/png" });
  const activityId = `upgrade-proof-session-${Date.now()}`;
  await requestLocal(`/api/activity/sessions/${activityId}`, "PUT", {
    title: "Preserved activity", activityType: "write",
    activityDate: new Date().toISOString().slice(0, 10),
    activeSeconds: 600, finish: true, workspaceId, taskId: task.id,
  });
  const canvasWorkspace = await requestLocal("/api/workspaces", "POST", { title: "Upgrade Canvas evidence" });
  assert.ok(canvasWorkspace.id);
  const canvasPath = `/api/workspaces/${encodeURIComponent(canvasWorkspace.id)}/canvas`;
  const originalCanvas = await requestLocal(canvasPath);
  const canvasElementId = `upgrade-canvas-${Date.now()}`;
  const scene = structuredClone(originalCanvas.canvas.data);
  scene.elements.push({
    id: canvasElementId, type: "rectangle", x: 12, y: 16, width: 120, height: 90,
    angle: 0, strokeColor: "#000000", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 1, roughness: 1, opacity: 100,
    seed: 1, version: 1, versionNonce: 1, isDeleted: false,
    groupIds: [], boundElements: null, updated: Date.now(), link: null, locked: false,
  });
  await requestLocal(canvasPath, "PATCH", {
    canvas: { ...originalCanvas.canvas, data: scene }, version: originalCanvas.version,
  });
  const trashed = await requestLocal("/api/workspaces", "POST", { title: "Upgrade Trash evidence" });
  assert.ok(trashed.id && trashed.version);
  await requestLocal(`/api/workspaces/${encodeURIComponent(trashed.id)}`, "DELETE", undefined, { "If-Match": `"${trashed.version}"` });
  return { workspaceId, taskId: task.id, standaloneTaskId: standalone.id, assetId, activityId, trashedId: trashed.id, canvasWorkspaceId: canvasWorkspace.id, canvasElementId };
}

async function assertDurableDomains(marker) {
  const prefix = `/api/workspaces/${encodeURIComponent(marker.workspaceId)}`;
  const workspace = await requestLocal(prefix);
  assert.equal(workspace.id, marker.workspaceId);
  const task = await requestLocal(`/api/tasks/${encodeURIComponent(marker.taskId)}`);
  assert.equal(task.title, "Preserved task");
  const standalone = await requestLocal(`/api/tasks/${encodeURIComponent(marker.standaloneTaskId)}`);
  assert.equal(standalone.title, "Upgrade inbox task");
  const asset = await requestLocal(`${prefix}/assets/${encodeURIComponent(marker.assetId)}`);
  assert.deepEqual(Array.from(asset), [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const canvas = await requestLocal(`/api/workspaces/${encodeURIComponent(marker.canvasWorkspaceId)}/canvas`);
  assert.ok(canvas.canvas.data.elements.some(element => element.id === marker.canvasElementId), "Authored Canvas element must survive upgrade");
  const trash = await requestLocal("/api/trash");
  assert.ok(JSON.stringify(trash).includes(marker.trashedId), "Trashed workspace must survive upgrade");
  const activities = await requestLocal("/api/activity/sessions?limit=50");
  assert.ok(JSON.stringify(activities).includes(marker.activityId), "Activity history must survive upgrade");
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
  throw new Error("Desktop window did not close within 15 seconds");
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
