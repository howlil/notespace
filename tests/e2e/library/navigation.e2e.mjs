/* Production-safe navigation: category detail shares the Library grid, and a
 * Workspace is reachable, switchable and reload-safe. */
import { after, before, test } from "node:test";
import {
  apiResponse, assert, cleanupWorkspace, click, createCategory, createWorkspace,
  capture, containsText, currentUrl, deleteCategory, expectCount, fill, goto, injectFault,
  reload, requestLog, role, start, stop, visible, waitFor, waitUrl,
} from "../support/harness.mjs";

before(start);
after(stop);

test("category detail shares the Workspaces card grid and create action", async () => {
  const category = await createCategory(`Browse Category ${Date.now()}`);
  const stamp = Date.now();
  const names = [`Beta Navigation ${stamp}`, `Alpha Navigation ${stamp}`];
  const workspaces = [];
  try {
    for (const title of names) {
      workspaces.push(await createWorkspace(title, { categoryId: category.id }));
    }

    await goto(`/?category=${category.id}`);
    const list = role("group", "Category workspaces");
    await visible(role("link", `Open ${names[0]}`, { scope: list }));
    await visible(role("link", `Open ${names[1]}`, { scope: list }));

    await visible(role("heading", category.title, { exact: true, level: 2 }));
    await expectCount(role("searchbox", "Search category workspaces"), 0);
    await expectCount(role("combobox", "Sort category workspaces"), 0);
    await expectCount(role("button", "Has notes"), 0);
    await expectCount(role("button", "Has canvas"), 0);

    await click(role("button", "New workspace", { scope: list }));
    const createdTitle = `Created in category ${stamp}`;
    await fill(role("textbox", "New workspace name", { scope: list }), createdTitle);
    await click(role("button", "Create", { exact: true, scope: list }));

    // Creating from the category grid opens the new Workspace directly.
    await waitUrl(/\/workspaces\/[^/]+$/);
    const createdId = (await currentUrl()).pathname.split("/").at(-1);
    workspaces.push({ id: createdId });

    const created = await apiResponse(`/api/workspaces/${createdId}`);
    assert.equal(created.ok, true);
    assert.equal((await created.json()).categoryId, category.id);
  } finally {
    for (const workspace of workspaces) await cleanupWorkspace(workspace.id);
    await deleteCategory(category.id);
  }
});

test("direct navigation, sibling switching, and reload on workspace (/workspaces/:id)", async () => {
  const workspace = await createWorkspace(`Workspace Direct ${Date.now()}`);
  const sibling = await createWorkspace(`Workspace Sibling ${Date.now()}`, { categoryId: workspace.categoryId });
  const extra = [];
  let finishLoad;

  const assertWorkspaceLoaded = async (title) => {
    await visible(".excalidraw__canvas.interactive");
    await visible(role("link", "All workspaces", { exact: true }));
    await visible(role("group", "Current workspace"));
    await containsText(role("group", "Current workspace"), title);
    await visible('header [aria-label="Current workspace"]');
    await expectCount('main [aria-label="Current workspace"]', 0);
    await expectCount(role("status", "Workspace save status"), 1);
    await expectCount(".workspace-header", 0);
    await expectCount(role("navigation", "Workspace navigation"), 0);
  };

  try {
    for (let index = 0; index < 5; index++) extra.push(await createWorkspace(`Preview ${index} ${Date.now()}`, { categoryId: workspace.categoryId }));
    await goto(`/workspaces/${workspace.id}`);
    await assertWorkspaceLoaded(workspace.title);
    const explorer = role("navigation", "Categories");
    await visible(role("link", workspace.title, { exact: true, scope: explorer }));
    // The active item remains reachable even beyond the category's five-item preview.
    await visible(role("button", "View all", { exact: true, scope: explorer }));
    // Switch to an item from the cached preview rather than an omitted sibling.
    await click(role("button", "View all", { exact: true, scope: explorer }));
    await click(role("link", `Open ${sibling.title}`, { exact: true }));
    await waitUrl(new RegExp(`/workspaces/${sibling.id}$`));
    await click(role("link", extra[0].title, { exact: true, scope: explorer }));
    await waitUrl(new RegExp(`/workspaces/${extra[0].id}$`));
    const previewSibling = extra[1];
    await visible(role("link", previewSibling.title, { exact: true, scope: explorer }));
    const before = (await requestLog()).filter((entry) => entry.path.startsWith(`/api/categories/${workspace.categoryId}/workspaces`)).length;

    // Switching keeps the cached Explorer and fetches fresh authored data only.
    await injectFault({ method: "GET", path: `/api/workspaces/${previewSibling.id}`, times: 1,
      respond: () => new Promise((resolve) => { finishLoad = () => resolve(null); }),
    });
    await click(role("link", previewSibling.title, { exact: true, scope: explorer }));
    await waitFor(() => Boolean(finishLoad), "Destination data begins loading");
    await assertWorkspaceLoaded(extra[0].title);
    await visible(role("link", extra[0].title, { exact: true, scope: explorer }));
    finishLoad();
    await waitUrl(new RegExp(`/workspaces/${previewSibling.id}$`));
    await assertWorkspaceLoaded(previewSibling.title);
    await visible(role("link", extra[0].title, { exact: true, scope: explorer }));
    const after = (await requestLog()).filter((entry) => entry.path.startsWith(`/api/categories/${workspace.categoryId}/workspaces`)).length;
    assert.equal(after, before, "Route switching must reuse the Explorer's current listing");
    await capture("workspace-navigation");

    await click(role("link", "All workspaces", { exact: true }));
    const siblingLink = role("link", `Open ${sibling.title}`);
    await visible(siblingLink);
    await click(siblingLink);
    await waitUrl(new RegExp(`/workspaces/${sibling.id}$`));
    await assertWorkspaceLoaded(sibling.title);

    await goto(`/workspaces/${workspace.id}`);
    await reload();
    await assertWorkspaceLoaded(workspace.title);

  } finally {
    finishLoad?.();
    await cleanupWorkspace(workspace.id);
    await cleanupWorkspace(sibling.id);
    for (const item of extra) await cleanupWorkspace(item.id);
  }
});
