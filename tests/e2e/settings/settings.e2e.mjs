/* Settings owns theme, data and backup; the modal cannot dismiss mid-restore. */
import { after, before, test } from "node:test";
import {
  assert, click, createWorkspace, deleteWorkspace, expectCount,
  expectDisabled, expectEnabled, goto, hidden, injectFault, press, purgeTrash, role,
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

test("Settings owns the single Data & Backup surface in Navigation v8", async () => {
  await goto("/");
  await expectCount(role("button", "Backups", { exact: true }), 0);
  await expectCount(role("switch", "Theme"), 0);

  const settings = await openSettings();
  await visible(role("heading", "Appearance", { scope: settings }));
  await visible(role("switch", "Theme", { scope: settings }));
  await click(role("button", "Data & backup", { scope: settings }));
  await visible(role("heading", "Data & backup", { scope: settings }));
  const exportLink = role("link", "Export ZIP", { scope: settings });
  await visible(exportLink);
  assert.equal(await (await visible(exportLink)).getAttribute("href"), "/api/backup");
  await visible(role("button", "Restore library backup", { scope: settings }));
  await expectCount(role("heading", "Import Markdown vault", { scope: settings }), 0);
  await visible(role("heading", "Trash", { scope: settings }));
  await visible(text(/Device recovery snapshots are available in the Windows desktop app\./, { scope: settings }));
  await expectCount(role("dialog", "Data & Recovery"), 0);
  await expectCount(role("button", "Data and recovery"), 0);

  await click(role("button", "Close settings", { scope: settings }));
  await expectCount(settings, 0);

  const reopened = await openSettings();
  await visible(role("heading", "Appearance", { scope: reopened }));
  await click(role("button", "Close settings", { scope: reopened }));
  await expectCount(reopened, 0);
});

test("critical: Settings cannot dismiss while portable restore is in flight", async () => {
  await goto("/");
  const settings = await openSettings();
  await click(role("button", "Data & backup", { scope: settings }));
  await expectEnabled(role("button", "Restore library backup", { scope: settings }));

  // The request is held at the transport boundary. It must never reach SQLite:
  // this proves modal ownership and mutation lifecycle, not backup semantics.
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
    await expectCount(role("heading", "Historical recovery", { scope: settings }), 0);
    await expectCount(role("link", "Review scheduled Tasks", { scope: settings }), 0);
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

test("Workspace keeps Settings in Library without duplicating the Workspace rail", async () => {
  const workspace = await createWorkspace(`Settings navigation ${Date.now()}`);
  try {
    await goto(`/workspaces/${workspace.id}`);
    await visible(".excalidraw__canvas.interactive");
    await expectCount(role("button", "Settings", { exact: true }), 0);
    await expectCount('[aria-label="Desktop backup and recovery"]', 0);
    await click(role("link", "Notespace home", { exact: true }));
    await goto("/");
    await openSettings();
    await visible(settingsDialog());
  } finally {
    await deleteWorkspace(workspace.id).catch(() => undefined);
    await purgeTrash(workspace.id);
  }
});

test("Theme is only inside Settings on Home", async () => {
  await goto("/");
  await expectCount(role("switch", "Theme"), 0);
  const settings = await openSettings();
  await visible(role("heading", "Appearance", { scope: settings }));
  const toggle = role("switch", "Theme", { scope: settings });
  const initial = await (await visible(toggle)).getAttribute("aria-checked");
  await click(toggle);
  await waitFor(async () => (await visible(toggle)).getAttribute("aria-checked") !== initial, "Theme switch changes state");
  await click(role("button", "Close settings", { scope: settings }));
  await expectCount(settings, 0);
});
