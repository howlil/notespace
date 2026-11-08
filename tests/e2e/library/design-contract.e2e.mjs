/* Design contract: Library tree, inline editing, contextual actions, focused Canvas shell. */
import { after, before, test } from "node:test";
import {
  assert, click, count, createCategory, createWorkspace, deleteCategory, deleteWorkspace,
  doubleClick, expectCount, expectFocused, goto, placeholder, press, purgeTrash,
  rightClick, role, start, stop, visible, within,
} from "../support/harness.mjs";

before(start);
after(stop);

test("design contract: Library keeps a persistent category tree and global quick search", async () => {
  const seeded = await createWorkspace(`Design seed ${Date.now()}`);
  try {
    await goto("/");
    await visible(role("heading", "All workspaces"));

    const categories = role("navigation", "Categories");
    await visible(categories);
    await visible(role("button", "New category"));
    await visible(role("button", "New workspace", { exact: true }));
    await expectCount(role("navigation", "Primary navigation"), 0);
    await expectCount(role("button", "Collapse sidebar"), 0);
    await expectCount(role("button", "Expand sidebar"), 0);

    const trigger = role("button", /Search Notespace/);
    await visible(trigger);
    await click(trigger);
    const search = placeholder("Open workspace or category…");
    await expectFocused(search);
    await press("Escape");

    await press("Control+K");
    await expectFocused(search);
    await press("Escape");

    const collapsed = await within(categories, 'button[aria-expanded="false"]');
    if (await count(collapsed) > 0) {
      await click(collapsed);
      await visible(await within(categories, 'button[aria-expanded="true"]'));
    }

    await visible(role("main"));
  } finally {
    await deleteWorkspace(seeded.id).catch(() => undefined);
    await purgeTrash(seeded.id);
  }
});

test("design contract: sidebar tree keeps inline editing and contextual actions", async () => {
  const title = `Design Category ${Date.now()}`;
  const category = await createCategory(title);
  try {
    await goto("/");
    const button = role("button", new RegExp(title), { exclude: /^(Expand|Collapse)/ });
    await visible(button);
    await doubleClick(button);
    await visible(role("textbox", "Category title"));
    await press("Escape");

    await rightClick(button);
    await visible(role("menuitem", "New workspace"));
    await visible(role("menuitem", "Delete"));
  } finally {
    await deleteCategory(category.id);
  }
});

test("design contract: workspace creation stays in Library and authoring shell is focused", async () => {
  const workspace = await createWorkspace(`M10 design contract ${Date.now()}`);
  try {
    await goto(`/workspaces/${workspace.id}`);
    await visible(".notespace-canvas-surface");
    await visible(role("toolbar", "Canvas tools"));
    await expectCount(".workspace-header", 0);
    await expectCount(".workspace-rail", 0);
    await expectCount(role("navigation", "Workspace navigation"), 0);
    await expectCount(role("heading", "Capture source URL", { exact: true }), 0);
    await expectCount(role("button", "History", { exact: true }), 0);
    assert.equal(await count(".workspace-header"), 0);
  } finally {
    await deleteWorkspace(workspace.id).catch(() => undefined);
    await purgeTrash(workspace.id);
  }
});
