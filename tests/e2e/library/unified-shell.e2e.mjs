/* One shell: Welcome and Canvas share Explorer, Quick Open and Settings. */
import { after, before, test } from "node:test";
import { api, assert, back, box, click, clickAt, cleanupWorkspace, createWorkspace, createWorkspaceViaUI, deleteWorkspace, evaluate, expectAttribute, expectCount, expectFocused, fill, goto, injectFault, press, purgeTrash, queryParam, reload, resetViewport, rightClick, role, setViewport, start, stop, visible, waitFor, waitUrl } from "../support/harness.mjs";

before(start);
after(stop);

test("critical: Welcome and Canvas expose one shell with optional Explorer", async () => {
  await goto("/");
  await visible(role("complementary", "Category explorer"));
  const home = role("link", "Notespace home", { exact: true });
  await visible(home);
  await expectCount('#notespace-home-sidebar a[href="/"]', 0);
  await expectCount('#notespace-home-sidebar button[aria-label="New workspace"]', 0);
  await visible(role("button", "Open Notespace settings"));

  const before = await box(home);
  await click(role("button", "New category"));
  await fill(role("textbox", "Category title"), "Preserved category draft");
  await press("Control+\\");
  await expectAttribute(role("button", "Hide Explorer", { exact: true }), "aria-expanded", "true");
  await click(role("button", "Hide Explorer", { exact: true }));
  await expectAttribute("#notespace-home-sidebar", "aria-hidden", "true");
  assert.equal(await evaluate("html", () => document.querySelector("#notespace-home-sidebar").inert), true);
  await expectCount('#notespace-home-sidebar aside[aria-label="Category explorer"]', 1);
  await expectFocused(role("button", "Show Explorer", { exact: true }));
  const collapsed = await box(home);
  assert.equal(collapsed.x, before.x, "Fox does not move with dock collapse");
  await click(role("button", "Show Explorer", { exact: true }));
  await visible(role("complementary", "Category explorer"));
  assert.equal(await evaluate(role("textbox", "Category title"), (element) => element.value), "Preserved category draft");
  await click(role("button", "Cancel new category"));
  await press("Control+\\");
  await visible(role("button", "Show Explorer", { exact: true }));
  await press("Control+\\");
  await visible(role("button", "Hide Explorer", { exact: true }));
  await click(role("button", "Hide Explorer", { exact: true }));
  await reload();
  await visible(role("button", "Hide Explorer", { exact: true }));

  const id = await createWorkspaceViaUI(`One shell ${Date.now()}`);
  try {
    await visible(".excalidraw__canvas.interactive");
    await expectCount(role("navigation", "Workspace navigation"), 0);
    await expectCount('[data-testid="workspace-view-switcher"]', 0);
    await expectCount(role("button", "Focus mode"), 0);
    await visible(role("complementary", "Category explorer"));
    await click(home);
    await waitUrl(/\/$/);
  } finally {
    await deleteWorkspace(id).catch(() => undefined);
    await purgeTrash(id);
  }
});

test("critical: compact viewport keeps Explorer and Quick Open in one shell", async () => {
  const workspace = await createWorkspace(`Drawer navigation ${Date.now()}`);
  await setViewport(390, 780);
  try {
    await goto("/");
    await click(role("button", "Show Explorer", { exact: true }));
    await visible(role("complementary", "Category explorer"));
    await expectCount(role("dialog", "Workspace explorer"), 0);
    const before = await box("main");
    await click(role("button", /Search Notespace/));
    await visible(role("dialog", "Quick Open"));
    await press("Escape");
    await expectAttribute(role("button", "Hide Explorer", { exact: true }), "aria-expanded", "true");
    await press("Escape");
    await expectFocused(role("button", "Show Explorer", { exact: true }));
    await expectAttribute("#notespace-home-sidebar", "aria-hidden", "true");
    const after = await box("main");
    assert.equal(after.width, before.width, "Mobile drawer never shrinks content");
    await click(role("button", "Show Explorer", { exact: true }));
    const backdrop = await box(role("button", "Close Explorer", { exact: true }));
    await clickAt(backdrop.x + backdrop.width - 10, backdrop.y + 100);
    await expectFocused(role("button", "Show Explorer", { exact: true }));
    await click(role("button", "Show Explorer", { exact: true }));
    await click(role("link", "Notespace home", { exact: true }));
    await visible(role("button", "Show Explorer", { exact: true }));
    await resetViewport();
    await visible(role("button", "Hide Explorer", { exact: true }));
    await click(role("button", "Hide Explorer", { exact: true }));
    await setViewport(390, 780);
    await click(role("button", "Show Explorer", { exact: true }));
    await press("Escape");
    await resetViewport();
    await visible(role("button", "Show Explorer", { exact: true }));
    await click(role("button", "Show Explorer", { exact: true }));
    await setViewport(390, 780);
    await click(role("button", "Show Explorer", { exact: true }));
    const category = (await api("/api/categories")).find((item) => item.id === workspace.categoryId);
    await click(role("button", category.title, { exact: true }));
    await click(role("link", workspace.title, { exact: true }));
    await waitUrl(new RegExp(`/workspaces/${workspace.id}$`));
    await visible(role("button", "Show Explorer", { exact: true }));
    await expectAttribute("#notespace-home-sidebar", "aria-hidden", "true");
    await resetViewport();
    await visible(role("button", "Hide Explorer", { exact: true }));
  } finally {
    await cleanupWorkspace(workspace.id);
    await resetViewport();
  }
});

test("critical: category disclosure stays local; View category owns URL", async () => {
  const categories = await api("/api/categories");
  const category = categories[0];
  assert.ok(category);
  await goto("/");
  const explorer = role("navigation", "Categories");
  await click(role("button", `Expand ${category.title}`, { scope: explorer }));
  await waitFor(async () => (await queryParam("category")) === null, "Disclosure must not change the URL");
  const categoryName = role("button", category.title, { exact: true, scope: explorer });
  await click(categoryName);
  assert.equal(await queryParam("category"), null, "Category name only discloses");
  await rightClick(categoryName);
  await click(role("menuitem", "View category"));
  await waitFor(async () => (await queryParam("category")) === category.id, "Explicit View category owns the URL");
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

test("titlebar activation failure keeps one visible Home and Explorer toggle", async () => {
  const { browser } = await start();
  const script = await browser.addInitScript(() => {
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      transformCallback: () => 0,
      unregisterCallback: () => {},
      invoke: () => Promise.reject(new Error("Injected titlebar activation failure")),
    };
  });
  try {
    await reload();
    await visible(".desktop-shell--native");
    await expectCount(role("link", "Notespace home", { exact: true }), 1);
    await expectCount("[data-explorer-toggle]", 1);
    await click(role("button", "Hide Explorer", { exact: true }));
    await visible(role("link", "Notespace home", { exact: true }));
    await click(role("button", "Show Explorer", { exact: true }));
    await visible(role("complementary", "Category explorer"));
  } finally {
    await script.remove();
    await reload();
    await visible(role("button", "Create Workspace", { exact: true }));
  }
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
