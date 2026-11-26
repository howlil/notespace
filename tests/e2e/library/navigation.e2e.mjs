/* Production-safe navigation: Home roots/all view, parent/child hierarchy, Canvas breadcrumb, and reload safety. */
import { after, before, test } from "node:test";
import {
  apiResponse, assert, capture, cleanupWorkspace, click, createWorkspace,
  currentUrl, expectCount, fill, goto, injectFault, reload,
  role, start, stop, visible, waitFor, waitUrl,
} from "../support/harness.mjs";

before(start);
after(stop);

test("Workspace Map shows root workspaces with nested sub-workspaces and creates root Workspaces", async () => {
  const stamp = Date.now();
  const root = await createWorkspace(`Root Nav ${stamp}`);
  const child = await createWorkspace(`Child Nav ${stamp}`, { parentId: root.id });
  try {
    await goto("/map");
    const rootsGrid = role("group", "Root workspaces");
    await visible(role("link", `Open ${root.title}`, { scope: rootsGrid }));
    await expectCount(role("link", `Open ${child.title}`, { scope: rootsGrid }), 0);
    // Child workspace appears as a nested mapping chip inside its parent card.
    await visible(role("link", child.title, { exact: true, scope: rootsGrid }));

    await click(role("button", "New workspace", { scope: rootsGrid }));
    const createdTitle = `Created root ${stamp}`;
    await fill(role("textbox", "New workspace name", { scope: rootsGrid }), createdTitle);
    await click(role("button", "Create", { exact: true, scope: rootsGrid }));

    await waitUrl(/\/workspaces\/[^/]+$/);
    const createdId = (await currentUrl()).pathname.split("/").at(-1);
    try {
      const created = await apiResponse(`/api/workspaces/${createdId}`);
      assert.equal(created.ok, true);
      assert.equal((await created.json()).parentId, null);
    } finally {
      await cleanupWorkspace(createdId);
    }
  } finally {
    await cleanupWorkspace(child.id);
    await cleanupWorkspace(root.id);
  }
});

test("direct navigation, breadcrumb, tab history, and reload on workspace (/workspaces/:id)", async () => {
  const stamp = Date.now();
  const parent = await createWorkspace(`Parent Direct ${stamp}`);
  const childA = await createWorkspace(`Child Alpha ${stamp}`, { parentId: parent.id });
  const childB = await createWorkspace(`Child Beta ${stamp}`, { parentId: parent.id });
  let finishLoad;

  const assertWorkspaceLoaded = async (title) => {
    await visible(".excalidraw__canvas.interactive");
    await visible(role("link", "Notespace home", { exact: true }));
    await visible(`main [aria-label="${title}"]`);
    await expectCount(role("status", "Workspace save status"), 1);
  };

  try {
    await goto(`/workspaces/${childA.id}`);
    await assertWorkspaceLoaded(childA.title);

    const breadcrumb = role("navigation", "Workspace breadcrumb");
    await visible(role("link", "Workspace Map", { exact: true, scope: breadcrumb }));
    await visible(role("link", parent.title, { exact: true, scope: breadcrumb }));

    // Navigate to parent via Canvas breadcrumb.
    await click(role("link", parent.title, { exact: true, scope: breadcrumb }));
    await waitUrl(new RegExp(`/workspaces/${parent.id}$`));
    await assertWorkspaceLoaded(parent.title);

    // Back button beside Canvas breadcrumb returns to childA.
    await click(role("button", "Back", { exact: true }));
    await waitUrl(new RegExp(`/workspaces/${childA.id}$`));
    await assertWorkspaceLoaded(childA.title);

    // Navigate to childB via Workspace Map (/map) nested sub-workspace chip with delayed load.
    await click(role("link", "Workspace Map", { exact: true, scope: breadcrumb }));
    await waitUrl(/\/map$/);
    await visible(role("link", childB.title, { exact: true }));

    await injectFault({
      method: "GET",
      path: `/api/workspaces/${childB.id}`,
      times: 1,
      respond: () => new Promise((resolve) => { finishLoad = () => resolve(null); }),
    });
    await click(role("link", childB.title, { exact: true }));
    await waitFor(() => Boolean(finishLoad), "Destination data begins loading");
    finishLoad();
    await waitUrl(new RegExp(`/workspaces/${childB.id}$`));
    await assertWorkspaceLoaded(childB.title);
    await capture("workspace-navigation");

    await reload();
    await assertWorkspaceLoaded(childB.title);
  } finally {
    finishLoad?.();
    await cleanupWorkspace(childA.id);
    await cleanupWorkspace(childB.id);
    await cleanupWorkspace(parent.id);
  }
});
