/* Library race: the latest category selection wins over a stale response. */
import { after, before, test } from "node:test";
import {
  assert, cleanupWorkspace, click, createCategory, createWorkspace, deleteCategory,
  expectCount, goto, injectFault, queryParam, role, start, stop, visible, waitFor,
} from "../support/harness.mjs";

before(start);
after(stop);

const categoryButton = (title) => role("button", new RegExp(title), { exclude: /^(Expand|Collapse)/ });

test("critical: latest Library category selection wins over stale responses", async () => {
  const suffix = Date.now();
  const categoryA = await createCategory(`Race A ${suffix}`);
  const categoryB = await createCategory(`Race B ${suffix}`);
  const workspaceA = await createWorkspace(`Workspace A ${suffix}`, { categoryId: categoryA.id });
  const workspaceB = await createWorkspace(`Workspace B ${suffix}`, { categoryId: categoryB.id });

  let held = false;
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });

  try {
    await goto("/");
    await visible(role("navigation", "Categories"));

    // Hold the first category fetch at the transport boundary; releasing it after
    // the second selection is what makes the stale response observable.
    await injectFault({
      method: "GET",
      path: new RegExp(`/api/categories/${categoryA.id}/workspaces\\?.*limit=50`),
      times: 1,
      respond: async () => {
        held = true;
        await gate;
        return null;
      },
    });

    await click(categoryButton(categoryA.title));
    await waitFor(() => held, "Category request must reach the transport boundary");

    await click(categoryButton(categoryB.title));
    await visible(role("link", `Open ${workspaceB.title}`));

    release();

    await waitFor(async () => (await queryParam("category")) === categoryB.id, "URL keeps the latest category selection");
    await visible(role("link", `Open ${workspaceB.title}`));
    await expectCount(role("link", `Open ${workspaceA.title}`), 0);
    assert.equal(await queryParam("category"), categoryB.id);
  } finally {
    release();
    await cleanupWorkspace(workspaceA.id);
    await cleanupWorkspace(workspaceB.id);
    await deleteCategory(categoryA.id);
    await deleteCategory(categoryB.id);
  }
});
