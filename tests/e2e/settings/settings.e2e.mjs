/* Settings owns color palette, backup, and trash; the modal cannot dismiss mid-restore. */
import { after, before, test } from "node:test";
import {
  assert, click, createWorkspace, deleteWorkspace, execute, expectCount,
  expectDisabled, expectEnabled, goto, hidden, injectFault, press, purgeTrash, reload, role,
  start, stop, text, uploadFile, visible, waitFor, within,
} from "../support/harness.mjs";

before(start);
after(stop);

const settingsDialog = () => role("dialog", "Settings", { exact: true });

async function openSettings() {
  await click(role("button", /Search Notespace/));
  await click(role("button", "Settings & Data"));
  await visible(settingsDialog());
  return settingsDialog();
}

test("Settings owns palette preferences, portable backup, and trash", async () => {
  await goto("/");
  const settings = await openSettings();
  await visible(role("radiogroup", "Color theme", { scope: settings }));
  await click(role("button", "Data & backup", { scope: settings }));
  await visible(role("heading", "Portable library backup", { scope: settings }));
  const exportLink = role("link", "Export ZIP", { scope: settings });
  await visible(exportLink);
  assert.equal(await (await visible(exportLink)).getAttribute("href"), "/api/backup");
  await visible(role("button", "Restore library backup", { scope: settings }));
  await visible(role("heading", "Trash", { scope: settings }));
  await visible(text(/SQLite snapshots are available in the Windows desktop app\./, { scope: settings }));

  await click(role("button", "Close settings", { scope: settings }));
  await expectCount(settings, 0);

  const reopened = await openSettings();
  await visible(role("radiogroup", "Color theme", { scope: reopened }));
  await click(role("button", "Close settings", { scope: reopened }));
  await expectCount(reopened, 0);
});

test("critical: Settings cannot dismiss while portable restore is in flight", async () => {
  await goto("/");
  const settings = await openSettings();
  await click(role("button", "Data & backup", { scope: settings }));
  await expectEnabled(role("button", "Restore library backup", { scope: settings }));

  let restoreStarted = false;
  let release = () => {};
  const pending = new Promise((resolve) => { release = resolve; });
  await injectFault({
    method: "POST",
    path: "/api/backup/restore",
    times: 1,
    respond: async () => {
      restoreStarted = true;
      await pending;
      return { status: 503, body: JSON.stringify({ error: "Simulated restore unavailable" }) };
    },
  });

  await uploadFile(await within(settings, 'input[type="file"][accept*=".zip"]'), {
    name: "restore-in-flight.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("not a real archive; intercepted before persistence"),
  });

  const confirmation = role("dialog", "Replace the entire library?");
  await visible(confirmation);
  await click(role("button", "Replace library", { scope: confirmation }));

  try {
    await waitFor(() => restoreStarted, "Restore reaches the server");
    await expectDisabled(role("button", "Close settings", { scope: settings }));
    await visible(settings);
    await press("Escape");
    await visible(settings);
    await expectDisabled(role("button", "General", { scope: settings }));
  } finally {
    release();
  }

  await expectEnabled(role("button", "Close settings", { scope: settings }));
  await expectEnabled(role("button", "General", { scope: settings }));
  await click(role("button", "Close settings", { scope: settings }));
  await hidden(settings);
});

test("Settings remains accessible from Home after navigating back from a Workspace", async () => {
  const workspace = await createWorkspace(`Settings navigation ${Date.now()}`);
  try {
    await goto(`/workspaces/${workspace.id}`);
    await visible(".excalidraw__canvas.interactive");
    await expectCount(role("button", "Settings", { exact: true }), 0);
    await click(role("link", "Notespace home", { exact: true }));
    await goto("/");
    await openSettings();
    await visible(settingsDialog());
  } finally {
    await deleteWorkspace(workspace.id).catch(() => undefined);
    await purgeTrash(workspace.id);
  }
});

test("Color palette lives inside Settings and persists across reload", async () => {
  await goto("/");
  const settings = await openSettings();
  await visible(role("radiogroup", "Color theme", { scope: settings }));

  const sageOption = await within(settings, 'button[role="radio"][data-theme-palette="sage"]');
  await click(sageOption);
  await waitFor(async () => (await execute(() => document.documentElement.dataset.palette)) === "sage", "Selected color theme applies to document root");

  await click(role("button", "Close settings", { scope: settings }));
  await expectCount(settings, 0);

  await reload();
  await waitFor(async () => (await execute(() => document.documentElement.dataset.palette)) === "sage", "Selected color theme persists after reload");

  const reopened = await openSettings();
  await click(await within(reopened, 'button[role="radio"][data-theme-palette="graphite"]'));
  await waitFor(async () => (await execute(() => document.documentElement.dataset.palette)) === "graphite", "Default palette can be restored");
  await click(role("button", "Close settings", { scope: reopened }));
  await expectCount(reopened, 0);
});
