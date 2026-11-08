/* Library flow: create a Category and Workspace, rename the Category, survive reload. */
import { after, before, test } from "node:test";
import {
  api, assert, click, createWorkspace, deleteCategory, deleteWorkspace, doubleClick, fill, goto,
  currentUrl, injectFault, press, purgeTrash, reload, requestLog, role, start, stop, text,
  visible, waitFor, waitUrl,
} from "../support/harness.mjs";

before(start);
after(stop);

test("critical: Library creates a category and Workspace, renames the category, and restores the tree after reload", async () => {
  const suffix = Date.now();
  const categoryTitle = `E2E Category ${suffix}`;
  const renamedCategoryTitle = `${categoryTitle} renamed`;
  const workspaceTitle = `E2E Workspace ${suffix}`;
  let categoryId = "";
  let workspaceId = "";
  let existingId = "";
  let finishCreate;
  let finishRename;

  try {
    await goto("/");
    await click(role("button", "New category"));
    await fill(role("textbox", "Category title"), categoryTitle);
    await press("Enter");
    await visible(text(categoryTitle));

    const categories = await api("/api/categories");
    categoryId = categories.find((item) => item.title === categoryTitle)?.id ?? "";
    assert.notEqual(categoryId, "", "Category must be persisted through the Library UI");

    const existing = await createWorkspace(`Existing ${suffix}`, { categoryId });
    existingId = existing.id;
    await doubleClick(text(categoryTitle));
    await fill(role("textbox", "Category title"), renamedCategoryTitle);
    await press("Enter");
    await visible(text(renamedCategoryTitle));

    await click(role("button", `New workspace in ${renamedCategoryTitle}`, { exact: true }));
    await visible(role("link", existing.title, { exact: true }));
    await fill(role("textbox", "Workspace title"), workspaceTitle);
    const createBaseline = (await requestLog()).filter((entry) => entry.method === "POST" && entry.path === "/api/workspaces").length;
    await injectFault({ method: "POST", path: "/api/workspaces", times: 1,
      respond: () => new Promise((resolve) => { finishCreate = () => resolve({ status: 503, body: JSON.stringify({ error: "Creation temporarily unavailable" }) }); }),
    });
    await press("Enter");
    await waitFor(() => Boolean(finishCreate), "Create reaches the server");
    assert.equal(await (await visible(role("button", "Create workspace", { exact: true }))).isEnabled(), false);
    assert.equal(await (await visible(role("button", "Cancel new workspace"))).isEnabled(), false);
    await press("Enter");
    const creates = (await requestLog()).filter((entry) => entry.method === "POST" && entry.path === "/api/workspaces").slice(createBaseline);
    assert.equal(creates.length, 1, "Pending Enter cannot send a duplicate create");
    finishCreate();
    await visible(text("Creation temporarily unavailable"));
    assert.equal(await (await visible(role("textbox", "Workspace title"))).getValue(), workspaceTitle);

    await injectFault({ method: "GET", path: `/api/categories/${categoryId}/workspaces`, times: 1,
      respond: () => ({ status: 503, body: JSON.stringify({ error: "Listing temporarily unavailable" }) }),
    });
    await click(role("button", "Create workspace", { exact: true }));

    await waitUrl(/\/workspaces\/[^/]+$/);
    workspaceId = (await currentUrl()).pathname.split("/").at(-1) ?? "";
    assert.notEqual(workspaceId, "", "Workspace link must address a Workspace id");
    const retriedCreates = (await requestLog()).filter((entry) => entry.method === "POST" && entry.path === "/api/workspaces").slice(createBaseline);
    assert.equal(JSON.parse(retriedCreates[0].body).id, JSON.parse(retriedCreates[1].body).id, "Retry reuses the same Workspace identity");
    await visible(text("Could not load Workspaces."));
    await visible(role("link", existing.title, { exact: true }));
    await click(role("button", "Retry", { exact: true }));
    await visible(role("link", workspaceTitle, { exact: true }));

    // Enter and blur before the response belong to one rename operation.
    const renamedWorkspaceTitle = `${workspaceTitle} renamed`;
    await doubleClick(role("link", workspaceTitle, { exact: true }));
    await fill(role("textbox", "Workspace title", { exact: true }), renamedWorkspaceTitle);
    const renamePath = `/api/workspaces/${workspaceId}/title`;
    const renameBaseline = (await requestLog()).filter((entry) => entry.method === "PATCH" && entry.path === renamePath).length;
    await injectFault({ method: "PATCH", path: renamePath, times: 1,
      respond: () => new Promise((resolve) => { finishRename = () => resolve(null); }),
    });
    await press("Enter");
    await waitFor(() => Boolean(finishRename), "Rename reaches the server");
    await press("Tab");
    const renames = (await requestLog()).filter((entry) => entry.method === "PATCH" && entry.path === renamePath).slice(renameBaseline);
    assert.equal(renames.length, 1, "Enter followed by blur must send only one rename");
    assert.equal(JSON.parse(renames[0].body).expectedTitle, workspaceTitle);
    finishRename();
    await visible(role("link", renamedWorkspaceTitle, { exact: true }));

    await doubleClick(role("link", renamedWorkspaceTitle, { exact: true }));
    const retryTitle = `${renamedWorkspaceTitle} retry`;
    await fill(role("textbox", "Workspace title", { exact: true }), retryTitle);
    await injectFault({ method: "PATCH", path: renamePath, times: 1,
      respond: () => ({ status: 503, body: JSON.stringify({ error: "Rename temporarily unavailable" }) }),
    });
    await press("Enter");
    await visible(text("Rename temporarily unavailable"));
    const draft = await visible(role("textbox", "Workspace title", { exact: true }));
    assert.equal(await draft.getValue(), retryTitle);
    assert.equal((await api(`/api/workspaces/${workspaceId}`)).title, renamedWorkspaceTitle);
    await draft.click();
    await press("Enter");
    await visible(role("link", retryTitle, { exact: true }));

    await reload();
    await visible(text(renamedCategoryTitle));
    await visible(role("link", retryTitle, { exact: true }));
  } finally {
    finishCreate?.();
    finishRename?.();
    if (workspaceId) {
      await deleteWorkspace(workspaceId).catch(() => undefined);
      await purgeTrash(workspaceId);
    }
    if (existingId) {
      await deleteWorkspace(existingId).catch(() => undefined);
      await purgeTrash(existingId);
    }
    if (categoryId) await deleteCategory(categoryId);
  }
});
