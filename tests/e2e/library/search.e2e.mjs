/* Global search opens the matching Workspace Canvas. */
import { after, before, test } from "node:test";
import {
  api, assert, click, cleanupWorkspace, createWorkspace, fill, goto,
  placeholder, role, start, stop, visible, waitUrl,
} from "../support/harness.mjs";
before(start);
after(stop);

test("critical: global search finds a Workspace and opens its Canvas", async () => {
  const token = `Search${Date.now()}`;
  const workspace = await createWorkspace(`Distributed systems ${token}`);
  try {
    await goto("/");
    await click(role("button", "Search Notespace", { exact: true }));
    const field = placeholder("Open workspace or category…");
    await fill(field, token);
    await click(role("button", new RegExp(token), { scope: role("dialog", "Quick Open"), index: 0 }));
    await waitUrl(new RegExp(`/workspaces/${workspace.id}$`));
    await visible(".excalidraw__canvas.interactive");
    assert.equal((await api(`/api/workspaces/${workspace.id}`)).title, workspace.title);
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});
