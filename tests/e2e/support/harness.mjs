import { startServer, stopServer } from "./server.mjs";
import { connect } from "./browser.mjs";
/* WebdriverIO standalone harness for Notespace browser proof.
 *
 * Ownership:
 *   - this module owns Chrome/WebDriver, the isolated Go/SQLite server, the
 *     fault-injection proxy, and the UI/HTTP observation helpers;
 *   - each spec file owns its journeys and data;
 *   - node:test owns assertions and lifecycle.
 *
 * Every spec file gets its own server, database, proxy and browser session, so
 * files stay independent and may run in parallel.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createFaultProxy } from "./proxy.mjs";
import { resolveInPage } from "./resolve.mjs";

export const DEFAULT_TIMEOUT = 12_000;

let state = null;
let starting = null;

function current() {
  if (!state) throw new Error("Browser environment is not started; call start() from a before() hook.");
  return state;
}

/** The active command surface: the page, or the frame context it is scoped to. */
function driver() {
  const active = current();
  return active.context ?? active.browser;
}

export async function start() {
  if (state) return state;
  if (starting) return starting;
  const pending = (async () => {
    let workDir;
    let server = null;
    let proxy = null;
    try {
      workDir = mkdtempSync(join(tmpdir(), "notespace-e2e-"));
      mkdirSync(join(workDir, "screenshots"), { recursive: true });
      server = process.env.NOTESPACE_TEST_URL ? null : await startServer(workDir);
      const target = process.env.NOTESPACE_TEST_URL ?? server.origin;
      proxy = await createFaultProxy(target);
      // The browser sees one stable origin. API assertions talk to the real server
      // directly so a simulated transport failure can never hide durable state.
      const { browser, page } = await connect(proxy.origin, DEFAULT_TIMEOUT);
      state = {
        browser,
        page,
        context: page,
        proxy,
        server,
        workDir,
        serverOrigin: target,
        origin: proxy.origin,
        getOutput: () => server?.getOutput() ?? "",
      };
      return state;
    } catch (error) {
      await dispose({ proxy, server, workDir });
      throw error;
    }
  })();
  starting = pending;
  try {
    return await pending;
  } catch (error) {
    if (starting === pending) starting = null;
    throw error;
  }
}

async function dispose({ browser, proxy, server, workDir }) {
  // Clear the unsaved-edit guard before the page detaches, otherwise Chrome
  // raises a beforeunload prompt that races with the BiDi session teardown.
  await browser?.execute(() => { window.onbeforeunload = null; }).catch(() => {});
  await browser?.deleteSession().catch(() => {});
  await proxy?.close().catch(() => {});
  await stopServer(server);
  if (!workDir) return;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      rmSync(workDir, { recursive: true, force: true });
      break;
    } catch {
      await sleep(100);
    }
  }
}

export async function stop() {
  const active = state;
  state = null;
  starting = null;
  if (active) await dispose(active);
}

/* ---------------------------------------------------------------- API client */

export function apiUrl(pathname) {
  return new URL(pathname, current().serverOrigin).href;
}

export async function apiResponse(pathname, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  let body = init.body;
  if (body !== undefined && typeof body !== "string" && !(body instanceof Uint8Array)) {
    headers["Content-Type"] ??= "application/json";
    body = JSON.stringify(body);
  }
  return fetch(apiUrl(pathname), { ...init, headers, body });
}

export async function api(pathname, init = {}) {
  const response = await apiResponse(pathname, init);
  if (!response.ok) throw new Error(`API ${init.method ?? "GET"} ${pathname}: HTTP ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}

export async function createWorkspace(title, extra = {}) {
  const response = await apiResponse("/api/workspaces", { method: "POST", body: { title, ...extra } });
  assert.equal(response.status, 201, `create Workspace ${title}`);
  return response.json();
}

export async function createCategory(title) {
  const response = await apiResponse("/api/categories", { method: "POST", body: { title } });
  assert.equal(response.status, 201, `create Category ${title}`);
  return response.json();
}

export async function workspaceState(id) {
  return api(`/api/workspaces/${id}`);
}

export async function canvasElements(id) {
  const workspace = await api(`/api/workspaces/${id}`);
  return (workspace.canvas?.data?.elements ?? []).filter((element) => !element.isDeleted);
}

export async function deleteWorkspace(id) {
  if (!id) return;
  const loaded = await apiResponse(`/api/workspaces/${id}`);
  if (loaded.status === 404) return;
  assert.ok(loaded.ok, `load Workspace ${id} before cleanup`);
  const workspace = await loaded.json();
  const removed = await apiResponse(`/api/workspaces/${id}`, {
    method: "DELETE",
    headers: { "If-Match": `"${workspace.version}"` },
  });
  assert.ok(removed.ok || removed.status === 404, `delete Workspace ${id}: HTTP ${removed.status}`);
}

export async function purgeTrash(id) {
  if (!id) return;
  await apiResponse(`/api/trash/${id}`, { method: "DELETE" }).catch(() => undefined);
}

export async function deleteCategory(id) {
  if (!id) return;
  await apiResponse(`/api/categories/${id}`, { method: "DELETE" }).catch(() => undefined);
}

export async function cleanupWorkspace(id) {
  await deleteWorkspace(id).catch(() => undefined);
  await purgeTrash(id);
}

/* ------------------------------------------------------------- DOM resolution */

let nonce = 0;

const REGEXP_SPECIALS = new Set(["\\", "^", "$", ".", "*", "+", "?", "(", ")", "[", "]", "{", "}", "|"]);

function escapeRegExp(value) {
  return value.split("").map((character) => (REGEXP_SPECIALS.has(character) ? `\\${character}` : character)).join("");
}

function specFrom(roleName, name, options) {
  const { exact = false, level = null, kind = "role", exclude = null, hasText = null } = options;
  let pattern = null;
  let flags = null;
  if (name instanceof RegExp) {
    pattern = name.source;
    flags = name.flags;
  } else if (typeof name === "string") {
    pattern = name;
  }
  let excludePattern = null;
  let excludeFlags = null;
  if (exclude instanceof RegExp) {
    excludePattern = exclude.source;
    excludeFlags = exclude.flags;
  }
  let hasTextPattern = null;
  let hasTextFlags = null;
  if (hasText instanceof RegExp) {
    hasTextPattern = hasText.source;
    hasTextFlags = hasText.flags;
  } else if (typeof hasText === "string") {
    hasTextPattern = escapeRegExp(hasText);
  }
  return {
    role: roleName, pattern, flags, exact, level, kind,
    exclude: excludePattern, excludeFlags, hasText: hasTextPattern, hasTextFlags,
  };
}

function descriptor(roleName, name, options = {}) {
  const { scope = null, index = 0 } = options;
  const spec = specFrom(roleName, name, options);
  const label = spec.kind === "text"
    ? `text(${String(name)})`
    : `role(${roleName}, ${String(name)}${spec.exact ? ", exact" : ""})`;
  const labelWithScope = scope ? `${label} inside ${describe(scope)}` : label;
  return {
    label: labelWithScope,
    spec,
    scope: scope && scope.scope !== undefined ? scope.scope : null,
    resolve: async () => {
      const browser = driver();
      const scopeChain = [];
      for (let node = scope; node; node = node.scope) {
        if (!node.spec) break;
        scopeChain.unshift(node.spec);
      }
      nonce += 1;
      const { found } = await browser.execute(resolveInPage, { spec, scopeChain, nonce });
      if (!found) throw new Error(`No element matches ${labelWithScope}`);
      if (index >= found) {
        throw new Error(`Only ${found} match(es) for ${labelWithScope}; index ${index} requested`);
      }
      return `[data-wdio-${nonce}="${index}"]`;
    },
  };
}

async function resolveTarget(target) {
  if (typeof target === "string") return target;
  if (target && typeof target.resolve === "function") return target.resolve();
  return String(await target);
}

function describe(target) {
  if (typeof target === "string") return target;
  return target?.label ?? String(target);
}

export function role(roleName, name = null, options = {}) {
  return descriptor(roleName, name, options);
}

export function text(value, options = {}) {
  return descriptor(null, value, { ...options, kind: "text" });
}

export function placeholder(value) {
  return `[placeholder="${value}"]`;
}

export function ariaLabel(value) {
  return `[aria-label="${value}"]`;
}

export function hasText(value) {
  return value;
}

/** Compose a CSS descendant selector inside a resolved scope descriptor. */
export async function within(scope, selector) {
  return `${await resolveTarget(scope)} ${selector}`;
}

export function byTestId(id) {
  return `[data-testid="${id}"]`;
}

/* ------------------------------------------------------------------- waiting */

export async function waitFor(predicate, message = "condition", timeout = DEFAULT_TIMEOUT) {
  const browser = driver();
  try {
    await browser.waitUntil(async () => Boolean(await predicate()), { timeout, timeoutMsg: message });
  } catch (error) {
    throw new Error(`${message} (timeout ${timeout}ms)`, { cause: error });
  }
}

export async function poll(read, check, message = "polled value", timeout = DEFAULT_TIMEOUT) {
  await waitFor(async () => check(await read()), message, timeout);
}

/* ---------------------------------------------------------------- navigation */

export async function goto(pathname) {
  const state = current();
  const page = await state.browser.url(new URL(pathname, state.origin).href);
  state.page = page;
  state.context = page;
}

export async function currentUrl() {
  return new URL(await driver().getUrl());
}

export async function path() {
  const parsed = await currentUrl();
  return `${parsed.pathname}${parsed.search}`;
}

export async function queryParam(name) {
  return (await currentUrl()).searchParams.get(name);
}

export async function waitUrl(pattern, timeout = DEFAULT_TIMEOUT) {
  const browser = driver();
  const expected = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  await browser.waitUntil(async () => expected.test(await browser.getUrl()), {
    timeout,
    timeoutMsg: `URL never matched ${expected}`,
  });
}

export async function reload() {
  const state = current();
  const page = await state.browser.refresh();
  if (page && typeof page === "object") {
    state.page = page;
    state.context = page;
  }
}

export async function back() {
  const state = current();
  const page = await state.browser.back();
  if (page && typeof page === "object") {
    state.page = page;
    state.context = page;
  }
}

/** Restore the default desktop viewport after a compact-layout journey. */
export async function resetViewport() {
  await setViewport(1440, 960);
}

export async function setViewport(width, height) {
  const { browser } = current();
  await browser.setViewport({ width, height });
  await waitFor(async () => {
    const size = await browser.execute(() => ({ width: innerWidth, height: innerHeight }));
    return size.width === width && size.height === height;
  }, `viewport ${width}x${height}`);
}

/* ------------------------------------------------------------- interactions */

async function findEventually(target, timeout = DEFAULT_TIMEOUT, { displayed = false } = {}) {
  const browser = driver();
  const deadline = Date.now() + timeout;
  let lastError = new Error(`No element matches ${describe(target)}`);
  for (;;) {
    try {
      const found = await browser.$(await resolveTarget(target));
      if (await found.isExisting()) {
        if (!displayed || await found.isDisplayed()) return found;
        lastError = new Error(`Element ${describe(target)} exists but is not displayed`);
      }
    } catch (error) {
      lastError = error;
    }
    if (Date.now() > deadline) {
      const context = await driver()
        .execute(() => `${location.pathname}${location.search} :: ${document.body.innerText.slice(0, 400)}`)
        .catch(() => "unavailable");
      lastError.message += `
page: ${context}`;
      throw lastError;
    }
    await sleep(100);
  }
}

/** Resolve immediately; throws when absent. Use for present-tense checks. */
export async function element(target) {
  return findEventually(target, DEFAULT_TIMEOUT, { displayed: false });
}

/** Resolve and require visibility, retrying until the timeout. */
export async function visible(target, timeout = DEFAULT_TIMEOUT) {
  return findEventually(target, timeout, { displayed: true });
}

export async function exists(target) {
  const browser = driver();
  try {
    return (await browser.$(await resolveTarget(target))).isExisting();
  } catch {
    return false;
  }
}

/** Wait until one of the given targets is displayed; returns its index. */
export async function waitAny(targets, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  for (;;) {
    for (const [position, target] of targets.entries()) {
      if (await exists(target)) {
        const found = await driver().$(await resolveTarget(target));
        if (await found.isDisplayed()) return position;
      }
    }
    if (Date.now() > deadline) throw new Error(`None of the expected elements appeared: ${targets.map(describe).join(", ")}`);
    await sleep(100);
  }
}

export async function hidden(target, timeout = DEFAULT_TIMEOUT) {
  const browser = driver();
  await browser.waitUntil(async () => !(await exists(target)), {
    timeout,
    timeoutMsg: `Expected ${describe(target)} to be absent`,
  });
}

/** Wait until the target is absent or no longer displayed. */
export async function notVisible(target, timeout = DEFAULT_TIMEOUT) {
  const browser = driver();
  await browser.waitUntil(async () => {
    try {
      const found = await browser.$(await resolveTarget(target));
      return !(await found.isExisting()) || !(await found.isDisplayed());
    } catch {
      return true;
    }
  }, { timeout, timeoutMsg: `Expected ${describe(target)} to be hidden or absent` });
}

export async function count(target) {
  const browser = driver();
  try {
    return (await browser.$$(await resolveTarget(target))).length;
  } catch {
    return 0;
  }
}

export async function expectCount(target, expected, timeout = DEFAULT_TIMEOUT) {
  await waitFor(async () => (await count(target)) === expected, `Expected ${expected} match(es) for ${describe(target)}`, timeout);
}

/** Click like Playwright: wait for actionability, retry while intercepted. */
export async function click(target, { timeout = DEFAULT_TIMEOUT } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const found = await findEventually(target, Math.max(500, deadline - Date.now()), { displayed: true });
    try {
      await found.click();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await sleep(150);
    }
  }
}

export async function hover(target, { timeout = DEFAULT_TIMEOUT } = {}) {
  const found = await findEventually(target, timeout, { displayed: true });
  await found.moveTo();
}

export async function focus(target) {
  const found = await visible(target);
  await found.click();
}

export async function dispatchClick(target) {
  await evaluate(target, (element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
}

export async function uploadFile(target, { name, mimeType = "application/octet-stream", buffer }) {
  await element(target);
  const selector = await resolveTarget(target);
  const { browser } = current();
  // The app owns a styled control over a visually hidden input, so the file is
  // attached through the same change event the control raises.
  await browser.execute((cssSelector, fileName, type, bytes) => {
    const input = document.querySelector(cssSelector);
    if (!input) throw new Error(`File input not found: ${cssSelector}`);
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], fileName, { type }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector, name, mimeType, [...buffer]);
}

/** Scope subsequent commands to an iframe (WebDriver BiDi browsing context). */
export async function switchFrame(target) {
  await visible(target);
  const selector = await resolveTarget(target);
  const state = current();
  state.context = await state.context.frame(selector);
  return state.context;
}

export async function parentFrame() {
  const state = current();
  state.context = state.page;
}

export async function selectOptionValue(target, optionValue) {
  const found = await visible(target);
  await found.selectByAttribute("value", optionValue);
}

/** Click only if the target is present right now; returns whether it clicked. */
export async function clickIfPresent(target) {
  const browser = driver();
  try {
    const found = await browser.$(await resolveTarget(target));
    if (!(await found.isExisting()) || !(await found.isDisplayed())) return false;
    await found.click();
    return true;
  } catch {
    return false;
  }
}

export async function rightClick(target, { timeout = DEFAULT_TIMEOUT } = {}) {
  const found = await findEventually(target, timeout, { displayed: true });
  await found.click({ button: "right" });
}

export async function doubleClick(target, { timeout = DEFAULT_TIMEOUT } = {}) {
  const found = await findEventually(target, timeout, { displayed: true });
  await found.doubleClick();
}

export async function textOf(target) {
  const found = await visible(target);
  return found.getText();
}

export async function expectText(target, expected, timeout = DEFAULT_TIMEOUT) {
  await waitFor(async () => {
    const found = await driver().$(await resolveTarget(target));
    if (!await found.isExisting()) return false;
    const value = await found.getText();
    if (expected instanceof RegExp) return expected.test(value);
    return value.trim() === expected.trim();
  }, `Expected text ${String(expected)} for ${describe(target)}`, timeout);
}

export async function containsText(target, expected, timeout = DEFAULT_TIMEOUT) {
  await waitFor(async () => {
    const found = await driver().$(await resolveTarget(target));
    if (!await found.isExisting()) return false;
    const value = await found.getText();
    if (expected instanceof RegExp) return expected.test(value);
    return value.includes(expected);
  }, `Expected text containing ${String(expected)} for ${describe(target)}`, timeout);
}

export async function attribute(target, name) {
  const found = await findEventually(target, DEFAULT_TIMEOUT, { displayed: false });
  return found.getAttribute(name);
}

export async function expectAttribute(target, name, expected, timeout = DEFAULT_TIMEOUT) {
  await waitFor(async () => {
    const found = await driver().$(await resolveTarget(target));
    if (!await found.isExisting()) return false;
    const value = await found.getAttribute(name);
    if (expected instanceof RegExp) return expected.test(value ?? "");
    return (value ?? "") === expected;
  }, `Expected ${name}=${String(expected)} for ${describe(target)}`, timeout);
}

export async function expectClass(target, pattern, timeout = DEFAULT_TIMEOUT) {
  const expected = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  await waitFor(async () => {
    const found = await driver().$(await resolveTarget(target));
    if (!await found.isExisting()) return false;
    return expected.test((await found.getAttribute("class")) ?? "");
  }, `Expected class ${String(pattern)} for ${describe(target)}`, timeout);
}

export async function css(target, property) {
  const found = await visible(target);
  return found.getCSSProperty(property);
}

export async function expectEnabled(target, timeout = DEFAULT_TIMEOUT) {
  await waitFor(async () => {
    const found = await driver().$(await resolveTarget(target));
    if (!await found.isExisting()) return false;
    return found.isEnabled();
  }, `Expected ${describe(target)} to be enabled`, timeout);
}

export async function expectDisabled(target, timeout = DEFAULT_TIMEOUT) {
  await waitFor(async () => {
    const found = await driver().$(await resolveTarget(target));
    if (!await found.isExisting()) return false;
    return !await found.isEnabled();
  }, `Expected ${describe(target)} to be disabled`, timeout);
}

export async function expectFocused(target, timeout = DEFAULT_TIMEOUT) {
  await waitFor(async () => {
    const found = await driver().$(await resolveTarget(target));
    if (!await found.isExisting()) return false;
    return found.isFocused();
  }, `Expected ${describe(target)} to be focused`, timeout);
}

export async function box(target) {
  const found = await visible(target);
  const { width, height } = await found.getSize();
  const { x, y } = await found.getLocation();
  return { x, y, width, height };
}

export async function value(target) {
  return (await element(target)).getValue();
}

export async function fill(target, next) {
  // Wait for the field first: editors mount behind Suspense inside dialogs.
  await visible(target);
  const selector = await resolveTarget(target);
  const browser = driver();
  const found = await browser.$(selector);
  await found.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  const tag = await found.getTagName();
  if (tag === "input" || tag === "textarea") {
    await found.click();
    // Set the value through the native setter so React's controlled input sees
    // one ordinary input event, exactly like a person pasting text.
    await browser.execute((cssSelector, text) => {
      const node = document.querySelector(cssSelector);
      const prototype = node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, String(text));
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    }, selector, String(next));
    return;
  }
  // Tiptap/ProseMirror: replace the whole document through the input pipeline so
  // editor state, history and autosave observe one authored change.
  await found.click();
  await browser.execute((cssSelector, text) => {
    const node = document.querySelector(cssSelector);
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const lines = String(text).split(String.fromCharCode(10));
    lines.forEach((line, position) => {
      if (line) document.execCommand("insertText", false, line);
      if (position < lines.length - 1) document.execCommand("insertParagraph", false);
    });
  }, selector, String(next));
}

const MODIFIER_KEYS = {
  Control: String.fromCharCode(0xE009),
  ControlOrMeta: String.fromCharCode(0xE009),
  Alt: String.fromCharCode(0xE00A),
  Shift: String.fromCharCode(0xE008),
  Meta: String.fromCharCode(0xE03D),
};

const NAMED_KEYS = {
  Enter: String.fromCharCode(0xE007),
  Escape: String.fromCharCode(0xE00C),
  F2: String.fromCharCode(0xE032),
  Tab: String.fromCharCode(0xE004),
  Backspace: String.fromCharCode(0xE003),
  Delete: String.fromCharCode(0xE017),
  ArrowLeft: String.fromCharCode(0xE012),
  ArrowUp: String.fromCharCode(0xE013),
  ArrowRight: String.fromCharCode(0xE014),
  ArrowDown: String.fromCharCode(0xE015),
  Home: String.fromCharCode(0xE011),
  End: String.fromCharCode(0xE010),
  Space: " ",
};

/** Send a real key chord, e.g. "Control+K" or "Alt+ArrowRight". */
export async function press(chord) {
  const { browser } = current();
  const parts = chord.split("+");
  const values = parts.map((part) => MODIFIER_KEYS[part] ?? NAMED_KEYS[part] ?? part);
  const actions = [
    ...values.map((value) => ({ type: "keyDown", value })),
    ...[...values].reverse().map((value) => ({ type: "keyUp", value })),
  ];
  await browser.performActions([{ type: "key", id: "keyboard", actions }]);
  await browser.releaseActions();
}

export async function typeText(value) {
  const { browser } = current();
  await browser.keys([...value]);
}

export async function selectByIndex(target, index) {
  const found = await visible(target);
  await found.selectByIndex(index);
}

export async function selectByText(target, label) {
  const found = await visible(target);
  await found.selectByVisibleText(label);
}

export async function execute(script, ...args) {
  return driver().execute(script, ...args);
}

/** Run `fn(element, ...args)` against a resolved element inside the page. */
export async function evaluate(target, fn, ...args) {
  await visible(target);
  const selector = await resolveTarget(target);
  return driver().execute((cssSelector, source, callArgs) => {
    const node = document.querySelector(cssSelector);
    if (!node) throw new Error(`Element not found: ${cssSelector}`);
    return new Function("element", "args", `return (${source})(element, ...args)`)(node, callArgs);
  }, selector, fn.toString(), args);
}

export async function movePointer(x, y) {
  const { browser } = current();
  await browser.performActions([{
    type: "pointer",
    id: "mouse",
    parameters: { pointerType: "mouse" },
    actions: [{ type: "pointerMove", duration: 0, x: Math.round(x), y: Math.round(y) }],
  }]);
  await browser.releaseActions();
}

/** Real pointer click at viewport coordinates (Canvas hit-testing, no element focus). */
export async function clickAt(x, y, { button = 0, clicks = 1 } = {}) {
  const { browser } = current();
  const actions = [{ type: "pointerMove", duration: 0, x: Math.round(x), y: Math.round(y) }];
  for (let click = 0; click < clicks; click += 1) {
    actions.push({ type: "pointerDown", button });
    actions.push({ type: "pointerUp", button });
  }
  await browser.performActions([{ type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions }]);
  await browser.releaseActions();
}

export async function drag(from, to, steps = 8) {
  const { browser } = current();
  await browser.performActions([{
    type: "pointer",
    id: "mouse",
    parameters: { pointerType: "mouse" },
    actions: [
      { type: "pointerMove", duration: 0, x: Math.round(from.x), y: Math.round(from.y) },
      { type: "pointerDown", button: 0 },
      ...Array.from({ length: steps }, (_, step) => ({
        type: "pointerMove",
        duration: 20,
        x: Math.round(from.x + ((to.x - from.x) * (step + 1)) / steps),
        y: Math.round(from.y + ((to.y - from.y) * (step + 1)) / steps),
      })),
      { type: "pointerUp", button: 0 },
    ],
  }]);
  await browser.releaseActions();
}

/* -------------------------------------------------------------------- windows */

export async function newTab(pathname) {
  const state = current();
  const previous = { context: state.page, windowHandle: await state.browser.getWindowHandle() };
  const handles = new Set(await state.browser.getWindowHandles());
  const context = await state.browser.newWindow(new URL(pathname, state.origin).href);
  let windowHandle;
  await waitFor(async () => {
    windowHandle = (await state.browser.getWindowHandles()).find((handle) => !handles.has(handle));
    return Boolean(windowHandle);
  }, "New browser tab exposes its window handle");
  await state.browser.switchToWindow(windowHandle);
  const page = { context, windowHandle };
  state.page = context;
  state.context = context;
  return { page, previous };
}

/** Focus an open tab. Frames are scoped to the tab, so they reset here. */
export async function useTab(page) {
  const state = current();
  // Script execution uses a scoped BiDi context; element commands use Classic's
  // active window. Switch both surfaces rather than silently calling an absent API.
  await state.browser.switchToWindow(page.windowHandle);
  state.page = page.context;
  state.context = page.context;
}

/* ------------------------------------------------------------ fault injection */

export async function injectFault(rule) {
  return current().proxy.inject(rule);
}

export async function clearFault(id) {
  return current().proxy.clear(id);
}

export async function clearFaults() {
  return current().proxy.reset();
}

export async function requestLog() {
  return current().proxy.requests;
}

/* -------------------------------------------------------------------- capture */

export async function capture(name) {
  if (!process.env.CAPTURE_SCREENSHOTS) return;
  const { workDir } = current();
  const browser = driver();
  await browser.saveScreenshot(join(workDir, "screenshots", `${name.replaceAll(/[^\w.-]+/g, "-")}.png`));
}

/* ------------------------------------------------------------------ fixtures */

/** Create a Workspace through the UI and stay on its Canvas. */
export async function createWorkspaceViaUI(title) {
  await goto("/");
  const firstRun = role("button", "Create Workspace", { exact: true });
  const card = role("button", "New workspace", { exact: true, scope: role("group", "All workspaces", { exact: true }) });
  const which = await waitAny([firstRun, card]);
  if (which === 0) {
    await click(firstRun);
    await fill(role("textbox", "Workspace name"), title);
  } else {
    await click(card);
    await fill(role("textbox", "New workspace name"), title);
  }
  await click(role("button", "Create", { exact: true }));
  await waitUrl(/\/workspaces\/[^/]+$/);
  await visible(".excalidraw__canvas.interactive");
  return (await currentUrl()).pathname.split("/").filter(Boolean).at(-1);
}

/** Open a Workspace created through the API and wait for the Canvas. */
export async function openWorkspace(id) {
  await goto(`/workspaces/${id}`);
  await visible(".excalidraw__canvas.interactive");
}

export async function waitSaved(timeout = DEFAULT_TIMEOUT) {
  await expectText(role("status", "Workspace save status"), "Saved", timeout);
}

export { assert, sleep };
