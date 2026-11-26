/* global console, fetch, setTimeout, URL, AbortSignal */

import { createServer } from "node:http";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { Builder, By, Capabilities, Key } from "selenium-webdriver";
import { isExpectedNativeCloseDisconnect } from "./native-close-session.mjs";
import {
  buildNativeReport,
  classifyNativeFailure,
  formatNativeSummaryMarkdown,
  parseNativeSmokeCases,
  sanitizeDiagnosticText,
  writeNativeReport,
} from "./native-smoke-report.mjs";

const root = resolve(import.meta.dirname, "../..");
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
const selectedCases = parseNativeSmokeCases(process.argv.slice(2), { critical, upgradeSeed, upgradeVerify });
const reportPath = process.env.NOTESPACE_NATIVE_REPORT ? resolve(root, process.env.NOTESPACE_NATIVE_REPORT) : null;
const resultsDir = reportPath ? resolve(reportPath, "..") : resolve(root, "test-results");
const binaryKind = /[/\\]release[/\\]/i.test(application) ? "release" : "debug";

if (critical && !process.env.NOTESPACE_DESKTOP_TEST_DATA_DIR) {
  throw new Error("Critical desktop smoke requires NOTESPACE_DESKTOP_TEST_DATA_DIR for isolated product data.");
}
if (critical) {
  process.env.NOTESPACE_TEST_CANVAS_SAVE_DELAY_MS ??= "1500";
}

if (!existsSync(application)) {
  throw new Error(`Native application binary not found: ${application}`);
}
mkdirSync(profileDirectory, { recursive: true });
const driverArgs = existsSync(nativeDriver) ? ["--native-driver", nativeDriver] : [];
const driverProcess = spawn(driverBinary, driverArgs, { cwd: root, stdio: ["ignore", "inherit", "inherit"], windowsHide: true });
let driver;
let activeOrigin;
const caseResults = [];

async function captureFailureScreenshot(caseName) {
  if (!driver) return null;
  try {
    mkdirSync(resultsDir, { recursive: true });
    const file = resolve(resultsDir, `native-failure-${caseName}.png`);
    const base64 = await driver.takeScreenshot();
    writeFileSync(file, Buffer.from(base64, "base64"));
    return file;
  } catch {
    return null;
  }
}

async function runNamedCase(name, property, expectedState, fn) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    caseResults.push({
      name,
      property,
      expectedState,
      status: "pass",
      category: null,
      durationMs: Date.now() - startedAt,
      error: null,
      screenshot: null,
    });
    return result;
  } catch (error) {
    const screenshot = await captureFailureScreenshot(name);
    caseResults.push({
      name,
      property,
      expectedState,
      status: "fail",
      category: classifyNativeFailure(error),
      durationMs: Date.now() - startedAt,
      error: sanitizeDiagnosticText(error?.message ?? error),
      screenshot,
    });
    return null;
  }
}

try {
  await waitForWebDriver(driverUrl, driverProcess);
  const capabilities = new Capabilities();
  capabilities.set("tauri:options", {
    application,
    webviewOptions: { userDataFolder: profileDirectory },
  });
  capabilities.setBrowserName("wry");
  driver = await openNativeSession(capabilities);

  await waitForDesktopRuntime(driver);
  const firstUrl = await driver.getCurrentUrl();
  assert.match(firstUrl, /^http:\/\/127\.0\.0\.1:\d+\//, "desktop must use an OS-allocated loopback port");
  activeOrigin = new URL(firstUrl).origin;

  if (upgradeSeed) {
    // Run against an INSTALLED historical MSI, never a debug binary.
    // Persist the fixture only after the OS close and sidecar shutdown.
    await runNamedCase("upgrade-seed", "Seed historical installed MSI data", "Seeded Workspace and domains flushed to SQLite", async () => {
      const nativeIPC = await driver.executeScript("return Boolean(window.__TAURI_INTERNALS__?.invoke)");
      assert.equal(nativeIPC, true, "Native app must retain Tauri IPC capability after authenticated loopback navigation");
      const marker = await runLegacyProductPersistenceJourney(driver);
      Object.assign(marker, await seedDurableDomains(driver));
      await closeDesktopWindow(driver);
      await waitForLocalServerExit();
      await driver.quit().catch(() => {});
      driver = undefined;
      writeFileSync(resolve(upgradeFixture), JSON.stringify(marker, null, 2), { flag: "wx" });
      console.log("upgrade proof: legacy installed app created durable library", marker.workspaceTitle);
    });
  } else if (upgradeVerify) {
    // Run against an INSTALLED candidate MSI with the SAME data and WebView profile.
    await runNamedCase("upgrade-verify", "Read back legacy authored state after MSI upgrade", "Candidate MSI preserves all authored workspaces, notes, assets, and trash", async () => {
      await assertDesktopChrome(driver, false);
      const nativeIPC = await driver.executeScript("return Boolean(window.__TAURI_INTERNALS__?.invoke)");
      assert.equal(nativeIPC, true, "Native app must retain Tauri IPC capability after authenticated loopback navigation");
      const marker = JSON.parse(readFileSync(resolve(upgradeFixture), "utf8"));
      assert.equal(typeof marker.workspaceTitle, "string");
      assert.equal(typeof marker.noteMarker, "string");
      await assertProductPersistence(driver, marker);
      await assertDurableDomains(marker);
      await closeDesktopWindow(driver);
      await waitForLocalServerExit();
      console.log("upgrade proof: candidate installed app read legacy authored state", marker.workspaceTitle);
    });
  } else {
    const selected = new Set(selectedCases);
    if (selected.has("native-runtime-chrome")) {
      await runNamedCase("native-runtime-chrome", "Loopback origin, Tauri IPC, and caption chrome", "Caption controls, drag strip, IPC, and maximize/restore work without overlap", async () => {
        const nativeIPC = await driver.executeScript("return Boolean(window.__TAURI_INTERNALS__?.invoke)");
        assert.equal(nativeIPC, true, "Native app must retain Tauri IPC capability after authenticated loopback navigation");
        await assertDesktopChrome(driver, false);
        await assertWindowCaptionControls(driver);
      });
    }

    if (selected.has("native-relaunch")) {
      await runNamedCase("native-relaunch", "WebView2 storage survives relaunch", "localStorage persists across native restart", async () => {
        await driver.executeScript("localStorage.setItem(arguments[0], arguments[1]);", persistedKey, "persisted");
        await driver.quit().catch(() => {});
        driver = undefined;
        driver = await openNativeSession(capabilities);
        await waitForDesktopRuntime(driver);
        const restored = await driver.executeScript("return localStorage.getItem(arguments[0]);", persistedKey);
        assert.equal(restored, "persisted", "desktop browser state must survive relaunch");
        await driver.executeScript("localStorage.removeItem(arguments[0]);", persistedKey);
      });
    }

    if (selected.has("native-persistence")) {
      await runNamedCase("native-persistence", "Close flush, sidecar shutdown, and SQLite relaunch durability", "Canvas + Canvas Note flush on close and read back after relaunch", async () => {
        await driver.executeScript("localStorage.setItem(arguments[0], arguments[1]);", persistedKey, "persisted");
        const productMarker = await runProductPersistenceJourney(driver);
        await closeDesktopWindow(driver);
        // Closing the WebView is insufficient: the Go/SQLite sidecar must have
        // terminated before the second native launch reuses the data directory.
        await waitForLocalServerExit();
        await driver.quit().catch(() => {});
        driver = undefined;

        driver = await openNativeSession(capabilities);
        await waitForDesktopRuntime(driver);
        const restored = await driver.executeScript("return localStorage.getItem(arguments[0]);", persistedKey);
        assert.equal(restored, "persisted", "desktop browser state must survive relaunch");
        assert.ok(productMarker, "critical smoke must have a product marker");
        await assertProductPersistence(driver, productMarker);
        await driver.executeScript("localStorage.removeItem(arguments[0]);", persistedKey);
      });
    }

    if (selected.has("native-html-sandbox")) {
      await runNamedCase("native-html-sandbox", "Code Worker and WebView2 HTML/IPC sandbox isolation", "Nested srcdoc sandbox blocks Tauri IPC, storage, fetch, and top-frame escape", async () => {
        await ensureIsolatedWorkspaceForCase(driver, `Native sandbox ${Date.now()}`);
        await assertDesktopChrome(driver, true);
        await assertCodeModule(driver);
      });
    }
  }

  const report = buildNativeReport({
    mode: upgradeSeed ? "upgrade-seed" : upgradeVerify ? "upgrade-verify" : critical ? "critical" : "smoke",
    binaryKind,
    runtime: { platform: process.platform },
    cases: caseResults,
  });
  writeNativeReport(reportPath, report);
  if (report.firstFailure) {
    throw new Error(`[${report.firstFailure.category}] ${report.firstFailure.name}: ${report.firstFailure.error}`);
  }
  console.log(
    critical
      ? `native WebDriver critical passed (${report.passed}/${report.total} cases): ${report.cases.map((c) => c.name).join(", ")}`
      : `native WebDriver smoke passed (${report.passed}/${report.total} cases): ${report.cases.map((c) => c.name).join(", ")}`,
  );
} finally {
  if (caseResults.length && reportPath) {
    const report = buildNativeReport({
      mode: upgradeSeed ? "upgrade-seed" : upgradeVerify ? "upgrade-verify" : critical ? "critical" : "smoke",
      binaryKind,
      runtime: { platform: process.platform },
      cases: caseResults,
    });
    writeNativeReport(reportPath, report);
    if (process.env.GITHUB_STEP_SUMMARY) {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, formatNativeSummaryMarkdown(report), { flag: "a" });
    }
  }
  if (driver) await driver.quit().catch(() => {});
  driverProcess.kill();
}

async function openNativeSession(capabilities) {
  try {
    // Native acceptance must drive the real Tauri WebView2 process, not
    // silently fall back to an HTTP-only smoke.
    return await new Builder().usingServer(driverUrl).withCapabilities(capabilities).build();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("DevToolsActivePort")) {
      console.error([
        "NATIVE_WEBDRIVER_SESSION_FAILED: WebView2 did not expose its DevTools port.",
        "Inspect the WebView2 and EdgeDriver versions in the CI preflight.",
        "Known WebView2+EdgeDriver upstream regression on Windows Server 2025:",
        "https://github.com/actions/runner-images/issues/14738",
        "Test the real WebView2 UI on windows-2022; do not substitute a mocked browser.",
      ].join("\n"));
    }
    throw error;
  }
}

async function assertDesktopChrome(session, workspace) {
  // The native app uses a frameless sidebar-only shell with overlay window controls.
  await visibleElement(session, By.css(".desktop-shell--custom .desktop-window-controls"));
  await visibleElement(session, By.css('.desktop-shell--custom button[aria-label="Search Notespace"]'));
  // The Canvas editor is code-split; wait for it to mount and draw before
  // asserting its native viewport size.
  if (workspace) {
    await visibleElement(session, By.css(".excalidraw__canvas.interactive"));
  }
  const state = await session.executeScript(`
    const shell = document.querySelector("[data-notespace-single-shell]");
    const explorer = shell?.querySelector("#notespace-home-sidebar");
    const controlsRoot = document.querySelector(".desktop-window-controls");
    const dragStrip = document.querySelector(".desktop-drag-strip");
    const canvas = shell?.querySelector(".excalidraw__canvas.interactive");
    const rect = canvas?.getBoundingClientRect();
    return {
      dragHeight: dragStrip ? Math.round(dragStrip.getBoundingClientRect().height) : 0,
      controls: controlsRoot?.querySelectorAll("button").length ?? 0,
      search: explorer?.querySelectorAll('button[aria-label="Search Notespace"]').length ?? 0,
      settings: explorer?.querySelectorAll('button[aria-label="Open Notespace settings"]').length ?? 0,
      explorerWidth: Math.round(explorer?.getBoundingClientRect().width ?? 0),
      explorerCount: shell?.querySelectorAll('aside[aria-label="Category explorer"]').length ?? 0,
      canvasWidth: rect?.width ?? 0,
      canvasHeight: rect?.height ?? 0,
      railCount: document.querySelectorAll(".workspace-rail, .desktop-workspace-rail-slot").length,
      brandCount: explorer?.querySelectorAll('a[aria-label="Notespace home"]').length ?? 0,
      toggleCount: explorer?.querySelectorAll('[data-explorer-toggle]').length ?? 0,
      canvasControlsRight: document.querySelector('[aria-label="Canvas view controls"]')?.getBoundingClientRect().right ?? 0,
      controlsLeft: controlsRoot?.getBoundingClientRect().left ?? 0,
    };
  `);
  assert.ok(state.dragHeight >= 8, "Top drag strip remains available");
  assert.equal(state.controls, 3, "Minimize, maximize and close remain accessible");
  assert.equal(state.search, 1, "Search remains reachable in the Explorer header");
  assert.equal(state.settings, 1, "Settings remain reachable in both shell states");
  assert.equal(state.explorerCount, 1, "One category explorer");
  assert.equal(state.railCount, 0, "No retired Workspace rail");
  assert.equal(state.brandCount, 1, "One Explorer header brand link");
  assert.equal(state.toggleCount, 1, "One independent Explorer toggle in the Explorer header");
  if (workspace && state.controlsLeft > 0) {
    assert.ok(state.canvasControlsRight <= state.controlsLeft, "Canvas controls do not overlap native caption controls");
  }
  if (workspace) {
    assert.ok(state.canvasWidth > 200 && state.canvasHeight > 150, "Excalidraw must have a drawable native viewport");
  }
}

async function assertWindowCaptionControls(session) {
  const maximize = await visibleElement(session, By.css('.desktop-window-controls > button[aria-label="Maximize window"], .desktop-window-controls > button[aria-label="Restore window"]'));
  const originalLabel = await maximize.getAttribute("aria-label");
  await maximize.click();
  await session.wait(async () => (await maximize.getAttribute("aria-label")) !== originalLabel, 5_000, "Caption maximize/restore works natively");
  await maximize.click();
  await session.wait(async () => (await maximize.getAttribute("aria-label")) === originalLabel, 5_000);
}

async function ensureIsolatedWorkspaceForCase(session, workspaceTitle) {
  const homeLinks = await session.findElements(By.css('#notespace-home-sidebar a[aria-label="Notespace home"]'));
  if (homeLinks.length) {
    await homeLinks[0].click();
    await waitForUrl(session, /[/]$/);
  }
  const firstRun = await session.findElements(By.xpath("//main//button[normalize-space()='Create Workspace']"));
  if (firstRun.length) {
    await firstRun[0].click();
    const field = await visibleElement(session, By.css('input[aria-label="Workspace name"]'));
    await field.sendKeys(workspaceTitle);
  } else {
    await (await visibleElement(session, By.css('main button[aria-label="New workspace"]'))).click();
    const field = await visibleElement(session, By.css('input[aria-label="New workspace name"]'));
    await field.sendKeys(workspaceTitle);
  }
  await (await visibleElement(session, By.xpath("//main//button[normalize-space()='Create']"))).click();
  await waitForUrl(session, /\/workspaces\//);
  await waitForWorkspaceSaved(session);
  return decodeURIComponent(new URL(await session.getCurrentUrl()).pathname.split("/").pop());
}

// The retired Note editor is replaced by the Canvas as the authored surface.
async function drawRectangleOnCanvas(session) {
  await (await visibleElement(session, By.css('[role="toolbar"][aria-label="Canvas tools"] button[aria-label="Rectangle"]'))).click();
  const bounds = await session.executeScript(`
    const canvas = document.querySelector(".excalidraw__canvas.interactive");
    const rect = canvas.getBoundingClientRect();
    return { x: rect.x, y: rect.y };
  `);
  const from = { x: Math.round(bounds.x + 220), y: Math.round(bounds.y + 180) };
  const to = { x: Math.round(bounds.x + 360), y: Math.round(bounds.y + 250) };
  await session.actions()
    .move({ x: from.x, y: from.y })
    .press()
    .move({ x: to.x, y: to.y })
    .release()
    .perform();
  await waitForWorkspaceSaved(session);
}

// The seed binary intentionally uses the previous published installer. Support
// both the modern Canvas-only v1.0+ shell (empty-library Create Workspace +
// Canvas/Note tools) and historical pre-1.0 installers (New workspace + document editor).
async function runLegacyProductPersistenceJourney(session) {
  const workspaceTitle = `Desktop smoke ${Date.now()}`;
  const createTrigger = await visibleElement(
    session,
    By.xpath("//main//button[normalize-space()='Create Workspace'] | //main//button[@aria-label='New workspace']"),
  );
  if ((await createTrigger.getAttribute("aria-label")) === "New workspace") {
    await createTrigger.click();
    await (await visibleElement(session, By.css('input[aria-label="New workspace name"]'))).sendKeys(workspaceTitle, Key.ENTER);
    await (await visibleElement(session, By.xpath(`//a[@aria-label=${xpathLiteral(`Open ${workspaceTitle}`)}]`))).click();
  } else {
    await createTrigger.click();
    const field = await visibleElement(session, By.css('input[aria-label="Workspace name"]'));
    await field.sendKeys(workspaceTitle);
    await (await visibleElement(session, By.xpath("//main//button[normalize-space()='Create']"))).click();
  }
  await waitForUrl(session, /[/]workspaces[/]/);
  const workspaceId = decodeURIComponent(new URL(await session.getCurrentUrl()).pathname.split("/").pop());

  const surface = await visibleElement(
    session,
    By.css('.excalidraw__canvas.interactive, [role="textbox"][aria-label="Workspace document"]'),
  );
  if ((await surface.getAttribute("aria-label")) === "Workspace document") {
    const initialMarker = `Desktop persistence ${Date.now()}`;
    const finalMarker = `${initialMarker} :: flushed before close`;
    await surface.click();
    await surface.sendKeys(Key.chord(Key.CONTROL, "a"), initialMarker);
    await waitForText(session, "Saving…");
    await surface.sendKeys(" :: flushed before close");
    await waitForEditorText(session, finalMarker);
    return { workspaceTitle, workspaceId, noteMarker: finalMarker };
  }

  await waitForWorkspaceSaved(session);
  await drawRectangleOnCanvas(session);
  const noteTool = await session.findElements(By.css('[aria-label="Canvas tools"] button[aria-label="Note"]'));
  const canvasNote = noteTool.length ? await assertCanvasNoteModule(session, workspaceId) : null;
  return {
    workspaceTitle,
    workspaceId,
    canvasNote,
    noteMarker: canvasNote?.text ?? `canvas-upgrade-${Date.now()}`,
  };
}

async function runProductPersistenceJourney(session) {
  const workspaceTitle = `Desktop smoke ${Date.now()}`;
  const workspaceId = await ensureIsolatedWorkspaceForCase(session, workspaceTitle);
  await assertDesktopChrome(session, true);
  await drawRectangleOnCanvas(session);
  const canvasNote = await assertCanvasNoteModule(session, workspaceId);
  return { workspaceTitle, workspaceId, canvasNote };
}

async function assertCanvasNoteModule(session, workspaceId) {
  await (await visibleElement(session, By.css('[aria-label="Canvas tools"] button[aria-label="Note"]'))).click();
  // The upgrade seed drives the previously released app, whose Notes use the ProseMirror editor
  // and a rich document; every later release uses the CodeMirror Markdown editor.
  const editor = await visibleElement(session, By.css("[data-note-element] [data-note-markdown-editor] .cm-content, [data-note-element] .ProseMirror"));
  const markdownEditor = (await editor.getAttribute("class")).split(/\s+/).includes("cm-content");
  const text = `desktop-note-module-${Date.now()}`;
  await editor.sendKeys(markdownEditor ? `# ${text}` : text);
  await waitForWorkspaceSaved(session);
  let noteId = null;
  await session.wait(async () => {
    const stored = await requestLocal(`/api/workspaces/${encodeURIComponent(workspaceId)}`);
    const elements = Array.isArray(stored.canvas?.data?.elements) ? stored.canvas.data.elements : [];
    const candidate = elements.find((element) => !element.isDeleted && element.customData?.notespaceNote?.noteId)?.customData?.notespaceNote?.noteId;
    if (!candidate) return false;
    const note = await requestLocal(`/api/notes/${encodeURIComponent(candidate)}`).catch(() => null);
    if (markdownEditor ? note?.document?.type !== "markdown" || note.document.text !== `# ${text}` : !JSON.stringify(note?.document ?? {}).includes(text)) return false;
    noteId = candidate;
    return true;
  }, 15_000, "Native Canvas Note instance and canonical document must persist");
  await editor.sendKeys(Key.ESCAPE);
  const readView = await visibleElement(session, By.css("[data-note-element] [data-note-read-view]"));
  await session.wait(async () => (await readView.getText()).includes(text), 10_000, "Native Canvas Note switches to read view with persisted content");
  await waitForWorkspaceSaved(session);
  console.log("native Canvas Note proof passed: WebView2 Markdown creation, persistence and read view");
  return { noteId, text };
}

async function assertCodeModule(session) {
  const origin = new URL(await session.getCurrentUrl()).origin;
  await (await visibleElement(session, By.css('[aria-label="Canvas tools"] button[aria-label="Code block"]'))).click();
  const block = await visibleElement(session, By.css('[data-canvas-code-block]'));
  assert.equal((await session.findElements(By.css('[data-canvas-code-header]'))).length, 0);
  const openCodeMenu = async () => {
    const target = await visibleElement(session, By.css('[data-canvas-code-block]'));
    await session.actions().contextClick(target).perform();
    return visibleElement(session, By.css('[role="menu"][aria-label="Object context menu"]'));
  };
  const replaceEditorCode = async (nextCode, { commit = false } = {}) => {
    const existing = await session.findElements(By.css('textarea[aria-label="Edit code block"]'));
    if (!existing.length) {
      const source = await visibleElement(session, By.css('[data-canvas-code-block] [aria-label="Code source"]'));
      const yOffset = await session.executeScript((el) => {
        const rect = el.getBoundingClientRect();
        const top = Math.max(rect.top + 8, 80);
        const bottom = Math.min(rect.bottom - 8, window.innerHeight - 20);
        const targetY = bottom > top ? (top + bottom) / 2 : (rect.top + rect.bottom) / 2;
        return Math.round(targetY - (rect.top + rect.height / 2));
      }, source);
      await session.actions().move({ origin: source, x: 0, y: yOffset }).doubleClick().perform();
    }
    const field = await visibleElement(session, By.css('textarea[aria-label="Edit code block"]'));
    await session.executeScript(`
      const editor = arguments[0];
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(editor, arguments[1]);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    `, field, nextCode);
    if (commit) {
      await field.sendKeys(Key.ESCAPE);
    }
    return field;
  };

  await session.actions().doubleClick(block).perform();
  const editor = await replaceEditorCode('console.log("desktop-code-module");');
  await editor.sendKeys(Key.chord(Key.CONTROL, Key.ENTER));
  const output = await visibleElement(session, By.css('[data-canvas-code-block] [aria-label="Code output"]'));
  await session.wait(async () => (await output.getText()).includes("desktop-code-module"), 10_000, "Native Worker output appears inside the card");
  await openCodeMenu();
  await (await visibleElement(session, By.xpath('//div[@data-object-context-menu]//button[normalize-space()="Hide output"]'))).click();
  await openCodeMenu();
  const langItem = await visibleElement(session, By.xpath('//div[@data-object-context-menu]//button[@role="menuitem" and contains(normalize-space(), "Language")]'));
  await session.actions().move({ origin: langItem }).perform();
  const search = await visibleElement(session, By.css('[aria-label="Search code languages"]'));
  await search.sendKeys("HTML");
  await (await visibleElement(session, By.xpath('//div[@data-object-context-submenu="code-language"]//button[normalize-space()="HTML / XML"]'))).click();
  await session.actions().sendKeys(Key.ESCAPE).perform();

  const leaks = [];
  const trapServer = createServer((req, res) => {
    leaks.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<html><body>trap-leaked</body></html>");
  });
  await new Promise((resolve) => trapServer.listen(0, "127.0.0.1", resolve));
  const trapOrigin = `http://127.0.0.1:${trapServer.address().port}`;
  try {
    // Keep the initial interactive snippet compact so the preview button fits within smaller CI WebView2 viewports.
    const interactiveHtml = '<button id="counter">Count <span id="count">0</span></button><script>document.querySelector("#counter").onclick=()=>{const c=document.querySelector("#count");c.textContent=String(Number(c.textContent)+1)};</script>';
    await replaceEditorCode(interactiveHtml, { commit: true });

    // Lazy execution: preview iframe must stay unmounted until user opts in.
    assert.equal((await session.findElements(By.css('iframe[name="notespace-html-preview-host"]'))).length, 0);
    await openCodeMenu();
    await (await visibleElement(session, By.xpath('//div[@data-object-context-menu]//button[normalize-space()="Preview" and not(@disabled)]'))).click();

    const hostFrame = await visibleElement(session, By.css('iframe[name="notespace-html-preview-host"][sandbox="allow-scripts"][referrerpolicy="no-referrer"]'));
    await session.switchTo().frame(hostFrame);
    const contentFrame = await visibleElement(session, By.css('iframe[name="notespace-html-preview"][sandbox="allow-scripts"][referrerpolicy="no-referrer"]'));
    await session.switchTo().frame(contentFrame);
    try {
      await (await visibleElement(session, By.css("#counter"))).click();
      assert.equal((await (await visibleElement(session, By.css("#count"))).getText()).trim(), "1");
    } finally {
      await session.switchTo().defaultContent();
    }

    const htmlPayload = [
      `<pre id="probe">pending</pre><iframe id="nested-trap" src="${trapOrigin}/leak-iframe"></iframe><script>`,
      '(async()=>{const b=async f=>{try{await f();return"LEAKED"}catch{return"blocked"}};',
      'const i=async(c,p)=>{if(!window.__TAURI_INTERNALS__?.invoke)return"blocked";try{return await Promise.race([Promise.resolve(window.__TAURI_INTERNALS__.invoke(c,p)).then(()=>"LEAKED",()=>"blocked"),new Promise(r=>setTimeout(()=>r("blocked-unsettled"),400))])}catch{return"blocked"}};',
      `const r={origin:window.origin,hasChromeWebview:Boolean(window.chrome?.webview),tauriPlugins:Object.keys(window.__TAURI_INTERNALS__?.plugins??{}),parentDoc:await b(()=>void parent.document.title),topDoc:await b(()=>void top.document.title),storage:await b(()=>localStorage.setItem("x","1")),fetchApi:await b(()=>fetch("/api/health")),fetchOrigin:await b(()=>fetch(${JSON.stringify(`${origin}/api/health`)})),fetchTrap:await b(()=>fetch(${JSON.stringify(`${trapOrigin}/leak-fetch`)})),fetchIpc:await b(()=>fetch("http://ipc.localhost/desktop_recovery_diagnostics")),tauriDiag:await i("desktop_recovery_diagnostics"),tauriOpener:await i("plugin:opener|open_url",{url:"https://example.com/"}),ipcPost:await b(()=>{if(!window.ipc?.postMessage)throw 1;window.ipc.postMessage(\'{"cmd":"desktop_recovery_diagnostics"}\')})};`,
      'const p=document.querySelector("#probe");p.textContent=JSON.stringify(r);p.dataset.ready="1";})();</script>',
    ].join("\n");

    await replaceEditorCode(htmlPayload, { commit: true });

    await session.wait(async () => session.executeScript(() => {
      const host = document.querySelector('iframe[name="notespace-html-preview-host"]');
      return Boolean(host?.getAttribute('srcdoc')?.includes('probe'));
    }), 10_000, "Host preview iframe srcdoc updates to isolation probe");
    const probeHostFrame = await visibleElement(session, By.css('iframe[name="notespace-html-preview-host"][sandbox="allow-scripts"][referrerpolicy="no-referrer"]'));
    await session.switchTo().frame(probeHostFrame);
    const probeContentFrame = await visibleElement(session, By.css('iframe[name="notespace-html-preview"][sandbox="allow-scripts"][referrerpolicy="no-referrer"]'));
    await session.switchTo().frame(probeContentFrame);
    try {
      await session.wait(async () => {
        const nodes = await session.findElements(By.css('#probe[data-ready="1"]'));
        return nodes.length > 0;
      }, 10_000, "WebView2 HTML preview probe finishes inside nested sandbox frame");
      const report = JSON.parse(await (await visibleElement(session, By.css("#probe"))).getText());
      assert.equal(report.origin, "null");
      assert.equal(report.hasChromeWebview, false, "WebView2 child frame must strip chrome.webview");
      assert.deepEqual(report.tauriPlugins, [], "WebView2 child frame must clear __TAURI_INTERNALS__.plugins");
      assert.equal(report.parentDoc, "blocked");
      assert.equal(report.topDoc, "blocked");
      assert.equal(report.storage, "blocked");
      assert.equal(report.fetchApi, "blocked");
      assert.equal(report.fetchOrigin, "blocked");
      assert.equal(report.fetchTrap, "blocked");
      assert.equal(report.fetchIpc, "blocked");
      assert.ok(report.tauriDiag === "blocked" || report.tauriDiag === "blocked-unsettled", `expected blocked tauriDiag, got ${report.tauriDiag}`);
      assert.equal(report.tauriOpener, "blocked");
      assert.equal(report.ipcPost, "blocked");
    } finally {
      await session.switchTo().defaultContent();
    }

    await replaceEditorCode(`<meta http-equiv="refresh" content="0;url=${trapOrigin}/leak-meta-refresh"><script>setTimeout(() => { try { location.href = ${JSON.stringify(`${origin}/api/health`)}; } catch {} }, 30);</script>`, { commit: true });
    await delay(900);
    const urlAfterNav = await session.getCurrentUrl();
    assert.ok(urlAfterNav.startsWith(origin), `Top WebView2 window must stay on sidecar origin, got ${urlAfterNav}`);
    await visibleElement(session, By.css("[data-canvas-code-block]"));
    assert.deepEqual(leaks, []);

    await openCodeMenu();
    await (await visibleElement(session, By.xpath('//div[@data-object-context-menu]//button[normalize-space()="Hide preview"]'))).click();
    assert.equal((await session.findElements(By.css('iframe[name="notespace-html-preview-host"]'))).length, 0);
    await waitForWorkspaceSaved(session);
  } finally {
    trapServer.closeAllConnections?.();
    await new Promise((resolve) => trapServer.close(resolve));
  }
  console.log("native Code Module proof passed: one toolbar, headerless card, Worker output and isolated WebView2 HTML preview");
}

async function assertProductPersistence(session, marker) {
  const workspaceLink = await visibleElement(session, By.xpath(`//a[@aria-label=${xpathLiteral(`Open ${marker.workspaceTitle}`)}]`));
  await workspaceLink.click();
  await waitForUrl(session, /\/workspaces\//);
  await visibleElement(session, By.css(".excalidraw__canvas.interactive"));
  const stored = await requestLocal(`/api/workspaces/${encodeURIComponent(marker.workspaceId)}/canvas`);
  const elements = (stored.canvas?.data?.elements ?? []).filter((element) => !element.isDeleted);
  assert.ok(elements.length >= 1, "canvas elements must survive desktop relaunch");
  if (marker.canvasNote) {
    const readView = await visibleElement(session, By.css("[data-note-element] [data-note-read-view]"));
    await session.wait(async () => (await readView.getText()).includes(marker.canvasNote.text), 10_000, "Canvas Note read view must survive desktop relaunch");
    const note = await requestLocal(`/api/notes/${encodeURIComponent(marker.canvasNote.noteId)}`);
    assert.match(JSON.stringify(note.document), new RegExp(marker.canvasNote.text), "Canonical Canvas Note must survive desktop relaunch");
  }
}

async function waitForLocalServerExit() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${activeOrigin}/api/health`, { signal: AbortSignal.timeout(1000) });
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
  // M6 authenticates the private API with an HttpOnly WebView session cookie.
  // A Node.js client must NOT bypass the security boundary. All fixture
  // requests go through the authenticated browser's same-origin transport.
  const payload = body === undefined ? null
    : body instanceof Uint8Array ? { kind: "binary", value: Array.from(body) }
    : { kind: "json", value: body };
  const response = await driver.executeAsyncScript(function(path, method, payload, headers, done) {
    (async () => {
      const request = { method, headers: { ...headers } };
      if (payload) {
        request.body = payload.kind === "binary"
          ? new Uint8Array(payload.value) : JSON.stringify(payload.value);
        if (payload.kind === "json") request.headers["Content-Type"] ??= "application/json";
      }
      const result = await window.fetch(path, request);
      const contentType = result.headers.get("Content-Type") ?? "";
      const isJson = contentType.includes("json");
      const binary = result.status !== 204 && !isJson;
      const value = result.status === 204 ? null : isJson
        ? await result.json() : Array.from(new Uint8Array(await result.arrayBuffer()));
      done({ status: result.status, ok: result.ok, binary, value });
    })().catch(error => done({ error: String(error) }));
  }, path, method, payload, headers);
  if (response.error) throw new Error(`${method} ${path}: ${response.error}`);
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}: ${JSON.stringify(response.value)}`);
  return response.binary ? new Uint8Array(response.value) : response.value;
}

async function seedDurableDomains(session) {
  const url = new URL(await session.getCurrentUrl());
  const match = url.pathname.match(/^\/workspaces\/([^/]+)$/);
  assert.ok(match, "upgrade seed must remain on authored Workspace");
  const workspaceId = decodeURIComponent(match[1]);
  const prefix = `/api/workspaces/${encodeURIComponent(workspaceId)}`;

  const assetId = `upgrade-proof-asset-${Date.now()}`;
  const originalAsset = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  await requestLocal(`${prefix}/assets/${assetId}`, "PUT", originalAsset, { "Content-Type": "image/png" });
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
  return { workspaceId, assetId, trashedId: trashed.id, canvasWorkspaceId: canvasWorkspace.id, canvasElementId };
}

async function assertDurableDomains(marker) {
  const prefix = `/api/workspaces/${encodeURIComponent(marker.workspaceId)}`;
  const workspace = await requestLocal(prefix);
  assert.equal(workspace.id, marker.workspaceId);
  const asset = await requestLocal(`${prefix}/assets/${encodeURIComponent(marker.assetId)}`);
  assert.deepEqual(Array.from(asset), [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const canvas = await requestLocal(`/api/workspaces/${encodeURIComponent(marker.canvasWorkspaceId)}/canvas`);
  assert.ok(canvas.canvas.data.elements.some(element => element.id === marker.canvasElementId), "Authored Canvas element must survive upgrade");
  const trash = await requestLocal("/api/trash");
  assert.ok(JSON.stringify(trash).includes(marker.trashedId), "Trashed workspace must survive upgrade");
}

async function closeDesktopWindow(session) {
  // WebDriver's synthetic Alt+F4 sometimes never reaches Windows as a native
  // close request. Invoke the Tauri window.close() command instead: it emits
  // the SAME native CloseRequested event as the OS close button and therefore
  // cannot bypass Notespace's flush/cancel handshake.
  const originalHandle = await session.getWindowHandle();
  await session.executeScript(`
    if (typeof window.__TAURI_INTERNALS__?.invoke !== "function") {
      throw new Error("Native Tauri IPC is unavailable before window close");
    }
    window.__notespaceCloseRequestError = null;
    void window.__TAURI_INTERNALS__.invoke("request_desktop_close").catch(error => {
      window.__notespaceCloseRequestError = String(error);
    });
    return true;
  `);

  const deadline = Date.now() + 30_000;
  let lastState = "no close status reported";
  while (Date.now() < deadline) {
    try {
      const handles = await session.getAllWindowHandles();
      if (!handles.includes(originalHandle)) return;
      const status = await session.executeScript(`
        const element = document.querySelector('[data-testid="desktop-close-status"]');
        return {
          error: window.__notespaceCloseRequestError || null,
          state: element?.getAttribute('data-desktop-close-state') || 'not-started',
          message: element?.textContent || ''
        };
      `);
      if (status === null) {
        // WebView2 can close between getAllWindowHandles() and executeScript().
        // A null script result is NOT success unless the window has vanished
        // and the sidecar's actual shutdown is independently confirmed.
        const remaining = await session.getAllWindowHandles();
        if (!remaining.includes(originalHandle)) {
          await waitForLocalServerExit();
          return;
        }
        lastState = "close status unavailable while window remains open";
        await delay(250);
        continue;
      }
      if (status.error) throw new Error(`Native desktop close command failed: ${status.error}`);
      lastState = `${status.state}: ${status.message}`;
      if (status.state === "error") {
        throw new Error(`Notespace refused to close because the durability flush failed: ${lastState}`);
      }
    } catch (error) {
      // WebView2 can tear down DevTools when its last native window exits.
      // Only a specifically recognized close-time driver error is allowed;
      // actual loopback shutdown must also be demonstrated before relaunch.
      if (!isExpectedNativeCloseDisconnect(error)) throw error;
      await waitForLocalServerExit();
      return;
    }
    await delay(250);
  }
  throw new Error(`Native desktop window did not close within 30 seconds (last flush status: ${lastState})`);
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

async function waitForWorkspaceSaved(session, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let lastStatus = "not mounted";
  while (Date.now() < deadline) {
    lastStatus = await session.executeScript(
      "return document.querySelector('[role=\"status\"][aria-label=\"Workspace save status\"]')?.textContent?.trim() ?? 'not mounted'",
    );
    if (lastStatus === "Saved") return;
    if (lastStatus === "Conflict" || lastStatus === "Not saved") {
      throw new Error(`Workspace autosave is not healthy after native navigation: ${lastStatus}`);
    }
    await delay(250);
  }
  throw new Error(`Workspace never reached Saved before native navigation (last: ${lastStatus})`);
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

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForDesktopRuntime(session) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const title = await session.getTitle();
      const url = await session.getCurrentUrl();
      if (title.includes("Notespace") && /^http:\/\/127\.0\.0\.1:\d+\//.test(url)) return;
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
