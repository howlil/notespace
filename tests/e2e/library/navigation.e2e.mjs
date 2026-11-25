/* Production-safe navigation: category filtering, switching, direct entry, and reload safety. */
import { after, before, test } from "node:test";
import {
  apiResponse, assert, back, capture, cleanupWorkspace, click, containsText, createCategory, createWorkspace,
  currentUrl, deleteCategory, expectCount, fill, goto, injectFault, queryParam, reload, requestLog,
  rightClick, role, start, stop, visible, waitFor, waitUrl,
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

    await click(role("button", "New workspace", { scope: list }));
    const createdTitle = `Created in category ${stamp}`;
    await fill(role("textbox", "New workspace name", { scope: list }), createdTitle);
    await click(role("button", "Create", { exact: true, scope: list }));

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

test("Switching categories replaces the visible workspaces without stale results", async () => {
  const suffix = Date.now();
  const categoryA = await createCategory(`Filter Source ${suffix}`);
  const categoryB = await createCategory(`Filter Target ${suffix}`);
  const workspaceA = await createWorkspace(`Source Workspace ${suffix}`, { categoryId: categoryA.id });
  const workspaceB = await createWorkspace(`Target Workspace ${suffix}`, { categoryId: categoryB.id });

  try {
    await goto(`/?category=${categoryA.id}`);
    await visible(role("link", `Open ${workspaceA.title}`));
    await visible(role("group", "Category workspaces"));
    await expectCount(role("link", `Open ${workspaceB.title}`), 0);

    await rightClick(role("button", categoryB.title, { exact: true }));
    await click(role("menuitem", "View category"));
    await waitFor(async () => (await queryParam("category")) === categoryB.id, "Selection switches category");
    await visible(role("link", `Open ${workspaceB.title}`));
    await expectCount(role("link", `Open ${workspaceA.title}`), 0);

    await back();
    await waitFor(async () => (await queryParam("category")) === categoryA.id, "Back restores the previous selection");
    await visible(role("link", `Open ${workspaceA.title}`));
  } finally {
    await cleanupWorkspace(workspaceA.id);
    await cleanupWorkspace(workspaceB.id);
    await deleteCategory(categoryA.id);
    await deleteCategory(categoryB.id);
  }
});

test("direct navigation, sibling switching, and reload on workspace (/workspaces/:id)", async () => {
  const workspace = await createWorkspace(`Workspace Direct ${Date.now()}`);
  const sibling = await createWorkspace(`Workspace Sibling ${Date.now()}`, { categoryId: workspace.categoryId });
  const extra = [];
  let finishLoad;

  const assertWorkspaceLoaded = async (title) => {
    await visible(".excalidraw__canvas.interactive");
    await visible(role("link", "Notespace home", { exact: true }));
    await visible(`main [aria-label="${title}"]`);
    await expectCount(role("status", "Workspace save status"), 1);
  };

  try {
    for (let index = 0; index < 5; index++) extra.push(await createWorkspace(`Preview ${index} ${Date.now()}`, { categoryId: workspace.categoryId }));
    await goto(`/workspaces/${workspace.id}`);
    await assertWorkspaceLoaded(workspace.title);
    const explorer = role("navigation", "Categories");
    await visible(role("link", workspace.title, { exact: true, scope: explorer }));
    await visible(role("button", "View all", { exact: true, scope: explorer }));
    await click(role("button", "View all", { exact: true, scope: explorer }));
    await click(role("link", `Open ${sibling.title}`, { exact: true }));
    await waitUrl(new RegExp(`/workspaces/${sibling.id}$`));
    await click(role("link", extra[0].title, { exact: true, scope: explorer }));
    await waitUrl(new RegExp(`/workspaces/${extra[0].id}$`));
    const previewSibling = extra[1];
    await visible(role("link", previewSibling.title, { exact: true, scope: explorer }));
    const before = (await requestLog()).filter((entry) => entry.path.startsWith(`/api/categories/${workspace.categoryId}/workspaces`)).length;

    await injectFault({
      method: "GET",
      path: `/api/workspaces/${previewSibling.id}`,
      times: 1,
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

    await click(role("link", "Notespace home", { exact: true }));
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
