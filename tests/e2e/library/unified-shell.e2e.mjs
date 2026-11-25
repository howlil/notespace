/* One shell: Welcome and Canvas share Explorer, inline tree editing, Quick Open, and Settings. */
import { after, before, test } from "node:test";
import {
  api, assert, back, box, click, clickAt, cleanupWorkspace, createCategory, createWorkspace, createWorkspaceViaUI,
  deleteCategory, deleteWorkspace, evaluate, expectAttribute, expectCount, expectFocused, fill, goto, injectFault,
  placeholder, press, purgeTrash, queryParam, reload, requestLog, resetViewport, rightClick, role, setViewport,
  start, stop, visible, waitFor, waitUrl,
} from "../support/harness.mjs";

before(start);
after(stop);

test("critical: Welcome and Canvas expose one shell with optional Explorer", async () => {
  await goto("/");
  await visible(role("complementary", "Category explorer"));
  const home = role("link", "Notespace home", { exact: true });
  await visible(home);
  await expectCount('#notespace-home-sidebar a[href="/"]', 1);
  await expectCount('#notespace-home-sidebar button[aria-label="New workspace"]', 0);
  await visible(role("button", "Open Notespace settings"));

  await press("Control+K");
  await expectFocused(placeholder("Search workspaces, notes, or categories…"));
  await press("Escape");

  await click(role("button", "New category"));
  await fill(role("textbox", "Category title"), "Preserved category draft");
  await press("Control+\\");
  await expectAttribute(role("button", "Hide Explorer", { exact: true }), "aria-expanded", "true");
  await click(role("button", "Hide Explorer", { exact: true }));
  await expectAttribute("#notespace-home-sidebar", "aria-hidden", "true");
  await expectAttribute("#notespace-home-sidebar", "data-notespace-library-explorer", "closed");
  assert.equal(await evaluate("html", () => document.querySelector("#notespace-home-sidebar").inert), true);
  await expectCount('#notespace-home-sidebar aside[aria-label="Category explorer"]', 1);
  await visible("[data-explorer-edge-trigger]");
  await evaluate("[data-explorer-edge-trigger]", (element) => {
    element.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
  });
  await expectAttribute("#notespace-home-sidebar", "data-notespace-library-explorer", "peeking");
  await click(role("button", "Show Explorer", { exact: true }));
  await visible(role("complementary", "Category explorer"));
  await expectAttribute("#notespace-home-sidebar", "data-notespace-library-explorer", "open");
  assert.equal(await evaluate(role("textbox", "Category title"), (element) => element.value), "Preserved category draft");
  await click(role("button", "Cancel new category"));
  await press("Control+\\");
  await expectAttribute("#notespace-home-sidebar", "data-notespace-library-explorer", "closed");
  await press("Control+\\");
  await visible(role("button", "Hide Explorer", { exact: true }));
  await click(role("button", "Hide Explorer", { exact: true }));
  await reload();
  await visible(role("button", "Hide Explorer", { exact: true }));

  const id = await createWorkspaceViaUI(`One shell ${Date.now()}`);
  try {
    await visible(".excalidraw__canvas.interactive");
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
  const beforeFetches = (await requestLog()).filter((entry) => entry.path.startsWith(`/api/categories/${category.id}/workspaces`)).length;
  await click(role("button", `Expand ${category.title}`, { scope: explorer }));
  await waitFor(async () => (await queryParam("category")) === null, "Disclosure must not change the URL");
  await visible(role("button", `Collapse ${category.title}`, { scope: explorer }));
  await expectCount(role("status", `Loading ${category.title}`), 0);
  const afterFetches = (await requestLog()).filter((entry) => entry.path.startsWith(`/api/categories/${category.id}/workspaces`)).length;
  assert.equal(afterFetches - beforeFetches, 1, "One expansion must issue exactly one Workspace fetch");

  const categoryName = role("button", category.title, { exact: true, scope: explorer });
  await click(categoryName);
  assert.equal(await queryParam("category"), null, "Category name only discloses");
  await rightClick(categoryName);
  await click(role("menuitem", "View category"));
  await waitFor(async () => (await queryParam("category")) === category.id, "Explicit View category owns the URL");
  await visible(role("heading", "No workspaces in this category", { exact: true }));
  await expectCount(role("heading", "No workspaces yet", { exact: true }), 0);
  await back();
  await waitFor(async () => (await queryParam("category")) === null, "Back clears the category filter");
});

test("sidebar tree preserves inline category rename drafts across responsive collapse", async () => {
  const title = `Inline Category ${Date.now()}`;
  const category = await createCategory(title);
  try {
    await goto("/");
    const button = role("button", new RegExp(title), { exclude: /^(Expand|Collapse)/ });
    await visible(button);
    await click(button);
    await press("F2");
    await visible(role("textbox", "Category title"));
    await fill(role("textbox", "Category title"), `${title} draft`);
    await setViewport(390, 780);
    await click(role("button", "Show Explorer", { exact: true }));
    assert.equal(await (await visible(role("textbox", "Category title"))).getValue(), `${title} draft`);
    assert.equal((await api("/api/categories")).find((item) => item.id === category.id).title, title, "Breakpoint collapse does not submit rename through blur");
    await resetViewport();
    await click(role("textbox", "Category title"));
    await press("Escape");

    await rightClick(button);
    await visible(role("menuitem", "New workspace"));
    await visible(role("menuitem", "Delete"));
  } finally {
    await resetViewport();
    await deleteCategory(category.id);
  }
});

test("critical: Settings opens in the shared shell", async () => {
  await goto("/");
  await click(role("button", "Open Notespace settings"));
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
    await expectAttribute("#notespace-home-sidebar", "data-notespace-library-explorer", "closed");
    await press("Control+\\");
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
  await expectCount(role("heading", "No workspaces yet", { exact: true }), 0);
  await expectCount(role("button", "Create Workspace"), 0);
  await click(role("button", "Retry", { scope: alert }));
  await expectCount(alert, 0);
});
