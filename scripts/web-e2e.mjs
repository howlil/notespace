/* WebdriverIO standalone: critical browser journeys only.
 * Node's test runner owns assertions; WDIO owns Chrome/WebDriver.
 * Persistence is proved against the real Go/SQLite API, not mock state.
 */
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { remote } from "webdriverio";

const root = resolve(import.meta.dirname, "..");
const origin = process.env.NOTESPACE_TEST_URL ?? "http://127.0.0.1:8081";
const isolated = process.env.NOTESPACE_TEST_URL ? null : mkdtempSync(join(tmpdir(), "notespace-wdio-"));
let server, browser;

async function api(path, init = {}) {
  const response = await fetch(new URL(path, origin), init);
  if (!response.ok) throw new Error(`API ${init.method ?? "GET"} ${path}: HTTP ${response.status}`);
  return response.json();
}

async function displayed(selector, timeout = 12_000) {
  const element = await browser.$(selector);
  await element.waitForDisplayed({ timeout });
  return element;
}

async function waitUrl(pattern) {
  await browser.waitUntil(async () => pattern.test(await browser.getUrl()), {
    timeout: 12_000, timeoutMsg: `Expected URL ${pattern}`,
  });
}

async function removeWorkspace(id) {
  if (!id) return;
  const response = await fetch(new URL(`/api/workspaces/${id}`, origin));
  if (response.status === 404) return;
  assert.equal(response.ok, true);
  const current = await response.json();
  const removed = await fetch(new URL(`/api/workspaces/${id}`, origin), {
    method: "DELETE", headers: { "If-Match": `"${current.version}"` },
  });
  assert.ok(removed.ok || removed.status === 404, `cleanup Workspace ${id}: HTTP ${removed.status}`);
}

before(async () => {
  if (isolated) {
    server = spawn("go", ["run", "./cmd/notespace"], {
      cwd: join(root, "apps/server"), detached: true, stdio: "ignore",
      env: {
        ...process.env,
        NOTESPACE_DB: join(isolated, "notespace.db"),
        NOTESPACE_ADDR: "127.0.0.1:8081",
        NOTESPACE_WEB_DIR: "../web/dist/client",
      },
    });
  }
  let ready = false;
  for (let i = 0; i < 240; i++) {
    try {
      const response = await fetch(new URL("/api/health", origin));
      if (response.ok) { ready = true; break; }
    } catch { /* server still starting */ }
    if (server?.exitCode !== null && server?.exitCode !== undefined) break;
    await sleep(250);
  }
  assert.ok(ready, "Go/SQLite server must start with an isolated database");
  browser = await remote({
    logLevel: "error",
    waitforTimeout: 12_000,
    capabilities: {
      browserName: "chrome",
      "goog:chromeOptions": {
        args: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,960"],
      },
    },
  });
  await browser.setWindowSize(1440, 960);
});

after(async () => {
  if (browser) await browser.deleteSession().catch(() => {});
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  }
  if (isolated) rmSync(isolated, { recursive: true, force: true });
});

test("critical: Welcome creates a Workspace and opens a drawable Canvas", { timeout: 45_000 }, async () => {
  let workspaceId;
  try {
    await browser.url(origin);
    const firstRun = await displayed('//main//button[normalize-space()="Create Workspace"]');
    await firstRun.click();
    await (await displayed('input[aria-label="Workspace name"]')).setValue("WDIO welcome Workspace");
    await (await displayed('//main//button[normalize-space()="Create"]')).click();
    await waitUrl(/\/workspaces\/[^/]+/);
    workspaceId = new URL(await browser.getUrl()).pathname.split("/").at(-1);
    const canvas = await displayed(".excalidraw__canvas.interactive");
    const rect = await canvas.getSize();
    assert.ok(rect.width > 350 && rect.height > 250, `Canvas must be drawable: ${JSON.stringify(rect)}`);
    assert.equal((await api(`/api/workspaces/${workspaceId}`)).id, workspaceId);
  } finally { await removeWorkspace(workspaceId); }
});

test("critical: Note deep link, Tiptap save, Done, and refresh preserve content", { timeout: 45_000 }, async () => {
  const created = await api("/api/workspaces", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "WDIO Note persistence" }),
  });
  try {
    const initial = await api(`/api/workspaces/${created.id}`);
    const id = initial.notes[0].id;
    await browser.url(`${origin}/workspaces/${created.id}?note=${id}`);
    await displayed('[data-notespace-note-editor]');
    const editor = await displayed('[data-notespace-note-editor] [role="textbox"][aria-label="Workspace document"]');
    const marker = "WebdriverIO durable Note content";
    await editor.click();
    await editor.addValue(marker);
    await (await displayed('//*[@data-notespace-note-editor]//button[normalize-space()="Done"]')).click();
    await browser.waitUntil(async () => !(await browser.getUrl()).includes("note="), { timeout: 12_000 });
    await browser.waitUntil(async () => {
      const saved = await api(`/api/workspaces/${created.id}`);
      return JSON.stringify(saved.notes.find(note => note.id === id)?.document).includes(marker);
    }, { timeout: 12_000, interval: 350, timeoutMsg: "Note never persisted in SQLite" });
    await browser.refresh();
    assert.equal(await (await browser.$('[data-notespace-note-editor]')).isExisting(), false);
    await (await displayed('select[aria-label="Open an existing Note"]')).selectByIndex(1);
    const reopened = await displayed('[data-notespace-note-editor] [role="textbox"][aria-label="Workspace document"]');
    assert.match(await reopened.getText(), /WebdriverIO durable Note content/);
  } finally { await removeWorkspace(created.id); }
});

test("critical: New Note is placed as a linked Canvas artifact", { timeout: 45_000 }, async () => {
  const created = await api("/api/workspaces", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "WDIO Note artifact" }),
  });
  try {
    const initial = await api(`/api/workspaces/${created.id}`);
    const originalNoteId = initial.notes[0].id;
    await browser.url(`${origin}/workspaces/${created.id}`);
    await (await displayed('button[aria-label="New Note"]')).click();
    await displayed('[data-notespace-note-editor]');
    await (await displayed('//*[@data-notespace-note-editor]//button[normalize-space()="Done"]')).click();
    await browser.waitUntil(async () => {
      const ws = await api(`/api/workspaces/${created.id}`);
      const newNote = ws.notes.find(note => note.id !== originalNoteId);
      if (!newNote) return false;
      return ws.canvas?.data?.elements?.some(element =>
        !element.isDeleted && element.customData?.notespaceNoteArtifact?.noteId === newNote.id);
    }, { timeout: 15_000, interval: 400, timeoutMsg: "New Note was not placed and persisted on Canvas" });
  } finally { await removeWorkspace(created.id); }
});

test("critical: shared shell retains Explorer and Quick Open", { timeout: 25_000 }, async () => {
  await browser.url(origin);
  await (await displayed('button[aria-label="Hide Explorer"]')).click();
  await browser.waitUntil(async () => !(await (await browser.$("#notespace-home-sidebar")).isExisting()));
  await (await displayed('button[aria-label="Show Explorer"]')).click();
  await displayed("#notespace-home-sidebar");
  await (await displayed('button[aria-label="Search Notespace"]')).click();
  await displayed('[role="dialog"][aria-label="Quick Open"], [role="dialog"][data-state="open"]');
});
