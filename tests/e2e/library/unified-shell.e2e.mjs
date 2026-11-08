/* One shell: Welcome and Canvas share Explorer, Quick Open and Settings. */
import { after, before, test } from "node:test";
import { api, assert, back, click, createWorkspaceViaUI, deleteWorkspace, expectCount, goto, injectFault, purgeTrash, queryParam, resetViewport, role, setViewport, start, stop, visible, waitFor, waitUrl } from "../support/harness.mjs";

before(start);
after(stop);

test("critical: Welcome and Canvas expose one shell with optional Explorer", async () => {
  await goto("/");
  await visible(role("complementary", "Category explorer"));
  await visible(role("link", "All workspaces", { exact: true }));
  await visible(role("button", "Open Notespace settings"));

  // The logo toggles the same Explorer without leaving the current surface.
  await visible("#notespace-home-sidebar");
  await click(role("button", "Hide Explorer", { exact: true }));
  await expectCount(role("complementary", "Category explorer"), 0);
  await click(role("button", "Show Explorer", { exact: true }));
  await visible(role("complementary", "Category explorer"));

  const id = await createWorkspaceViaUI(`One shell ${Date.now()}`);
  try {
    await visible(".excalidraw__canvas.interactive");
    await expectCount(role("navigation", "Workspace navigation"), 0);
    await expectCount('[data-testid="workspace-view-switcher"]', 0);
    await expectCount(role("button", "Focus mode"), 0);
    await visible(role("complementary", "Category explorer"));
    await click(role("link", "All workspaces", { exact: true }));
    await waitUrl(/\/$/);
  } finally {
    await deleteWorkspace(id).catch(() => undefined);
    await purgeTrash(id);
  }
});

test("critical: compact viewport keeps Explorer and Quick Open in one shell", async () => {
  await setViewport(390, 780);
  try {
    await goto("/");
    await click(role("button", "Show Explorer", { exact: true }));
    await visible(role("complementary", "Category explorer"));
    await expectCount(role("dialog", "Workspace explorer"), 0);
    await click(role("button", /Search Notespace/));
    await visible(role("dialog", "Quick Open"));
  } finally {
    await resetViewport();
  }
});

test("critical: category selection owns URL; category disclosure does not", async () => {
  const categories = await api("/api/categories");
  const category = categories[0];
  assert.ok(category);
  await goto("/");
  const explorer = role("navigation", "Categories");
  await click(role("button", `Expand ${category.title}`, { scope: explorer }));
  await waitFor(async () => (await queryParam("category")) === null, "Disclosure must not change the URL");
  await click(role("button", new RegExp(category.title), { scope: explorer, exclude: /^(Expand|Collapse)/ }));
  await waitFor(async () => (await queryParam("category")) === category.id, "Selection owns the URL");
  await back();
  await waitFor(async () => (await queryParam("category")) === null, "Back clears the category filter");
});

test("critical: Quick Open can open Settings in the shared shell", async () => {
  await goto("/");
  await click(role("button", "Search Notespace"));
  const quick = role("dialog", "Quick Open");
  await visible(quick);
  await click(role("button", "Settings & Data", { scope: quick }));
  const settings = role("dialog", "Settings", { exact: true });
  await visible(settings);
  await click(role("button", "Data & backup", { scope: settings }));
  const exportLink = role("link", "Export ZIP", { scope: settings });
  await visible(exportLink);
  assert.equal(await (await visible(exportLink)).getAttribute("href"), "/api/backup");
});

test("critical: failed library load remains recoverable, not first-run", async () => {
  let failures = 0;
  await injectFault({
    method: "GET",
    path: /\/api\/workspaces\?/,
    respond: async (request) => {
      const params = new URL(request.path, "http://localhost").searchParams;
      const isInitialLoad = params.get("snapshot") === "start" && params.get("limit") === "50";
      if (isInitialLoad && failures === 0) {
        failures += 1;
        return { status: 503, body: '{"error":"offline"}' };
      }
      return null;
    },
  });

  await goto("/");
  const alert = role("alert", null, { hasText: /Workspaces could not be loaded/ });
  await visible(alert);
  await expectCount(role("button", "Create Workspace"), 0);
  await click(role("button", "Retry", { scope: alert }));
  await expectCount(alert, 0);
});
