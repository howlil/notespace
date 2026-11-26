/* Library flow: create root and sub-workspace via Workspace Map, rename, and guard parent delete. */
import { after, before, test } from "node:test";
import {
  api, assert, cleanupWorkspace, click, createWorkspace, currentUrl, expectCount, fill,
  goto, injectFault, press, reload, requestLog, rightClick, role, start, stop, text, visible, waitAny, waitFor, waitUrl,
} from "../support/harness.mjs";

before(start);
after(stop);

test("critical: Library creates root and child Workspaces, renames inline, and guards parent delete", async () => {
  const suffix = Date.now();
  const rootTitle = `E2E Root ${suffix}`;
  const renamedRootTitle = `${rootTitle} renamed`;
  const childTitle = `E2E Child ${suffix}`;
  let rootId = "";
  let childId = "";
  let finishCreate;

  try {
    await goto("/map");
    const emptyBtn = role("button", "Create Workspace", { exact: true });
    const gridBtn = role("button", "New workspace", { exact: true, scope: role("group", "Root workspaces") });
    const which = await waitAny([emptyBtn, gridBtn]);
    if (which === 0) {
      await click(emptyBtn);
      await fill(role("textbox", "Workspace name"), rootTitle);
    } else {
      await click(gridBtn);
      await fill(role("textbox", "New workspace name", { scope: role("group", "Root workspaces") }), rootTitle);
    }
    await press("Enter");
    await waitUrl(/\/workspaces\/[^/]+$/);
    rootId = (await currentUrl()).pathname.split("/").at(-1) ?? "";
    assert.notEqual(rootId, "", "Root workspace must be created via Workspace Map");

    const existingSibling = await createWorkspace(`Existing Child ${suffix}`, { parentId: rootId });
    try {
      await goto("/map");
      await visible(role("link", existingSibling.title, { exact: true }));

      await rightClick(role("link", `Open ${rootTitle}`));
      await click(role("menuitem", "New sub-workspace"));
      await fill(role("textbox", "Sub-workspace name"), childTitle);

      const createBaseline = (await requestLog()).filter((entry) => entry.method === "POST" && entry.path === "/api/workspaces").length;
      await injectFault({
        method: "POST",
        path: "/api/workspaces",
        times: 1,
        respond: () => new Promise((resolve) => {
          finishCreate = () => resolve({ status: 503, body: JSON.stringify({ error: "Creation temporarily unavailable" }) });
        }),
      });
      await press("Enter");
      await waitFor(() => Boolean(finishCreate), "Create reaches the server");
      await press("Enter");
      assert.equal(await (await visible(role("button", "Creating…", { exact: true }))).isEnabled(), false);
      const creates = (await requestLog()).filter((entry) => entry.method === "POST" && entry.path === "/api/workspaces").slice(createBaseline);
      assert.equal(creates.length, 1, "Pending Enter cannot send a duplicate create");
      finishCreate();
      await visible(text("Creation temporarily unavailable"));
      assert.equal(await (await visible(role("textbox", "Sub-workspace name"))).getValue(), childTitle);

      await click(role("button", "Create", { exact: true }));
      await waitUrl(/\/workspaces\/[^/]+$/);
      await waitFor(async () => ((await currentUrl()).pathname.split("/").at(-1) ?? "") !== rootId, "Navigates to created child workspace");
      childId = (await currentUrl()).pathname.split("/").at(-1) ?? "";
      const retriedCreates = (await requestLog()).filter((entry) => entry.method === "POST" && entry.path === "/api/workspaces").slice(createBaseline);
      assert.equal(JSON.parse(retriedCreates[0].body).id, JSON.parse(retriedCreates[1].body).id, "Retry reuses the same Workspace identity");

      // Deleting a non-empty parent prompts to move sub-workspaces first.
      await goto("/map");
      await rightClick(role("link", `Open ${rootTitle}`));
      await click(role("menuitem", "Delete"));
      await visible(role("heading", "Move sub-workspaces first"));
      await click(role("button", "Move sub-workspaces to top level"));
      await expectCount(role("heading", "Move sub-workspaces first"), 0);
      assert.equal((await api(`/api/workspaces/${childId}`)).parentId, null);

      // Rename root and reload to confirm persistence.
      await rightClick(role("link", `Open ${rootTitle}`));
      await click(role("menuitem", "Edit title"));
      await fill(role("textbox", "Workspace title"), renamedRootTitle);
      await press("Enter");
      await reload();
      await visible(role("link", `Open ${renamedRootTitle}`));
    } finally {
      await cleanupWorkspace(existingSibling.id);
    }
  } finally {
    finishCreate?.();
    if (childId) await cleanupWorkspace(childId);
    if (rootId) await cleanupWorkspace(rootId);
  }
});
