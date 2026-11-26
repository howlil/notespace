/* One shell: Welcome and Canvas share Explorer, inline tree editing, Quick Open, and Settings. */
import { after, before, test } from "node:test";
import {
  assert, back, box, click, clickAt, cleanupWorkspace, createWorkspace, createWorkspaceViaUI,
  deleteWorkspace, evaluate, expectAttribute, expectCount, expectFocused, goto, injectFault,
  placeholder, press, purgeTrash, reload, resetViewport, role, setViewport,
  start, stop, visible, waitFor, waitUrl,
} from "../support/harness.mjs";

before(start);
after(stop);

test("critical: Welcome and Canvas expose one shell with optional Explorer", async () => {
  await goto("/");
  await visible(role("complementary", "Workspace explorer"));
  const home = role("link", "Notespace home", { exact: true });
  await visible(home);
  await expectCount('#notespace-home-sidebar a[href="/"]', 1);
  await expectCount('#notespace-home-sidebar a[href="/map"]', 1);
  await expectCount('#notespace-home-sidebar a[href="/cards"]', 1);
  await expectCount('#notespace-home-sidebar button[aria-label="New workspace"]', 0);
  await expectCount(role("navigation", "Workspace context"), 0);
  await visible(role("button", "Open Notespace settings"));

  await press("Control+K");
  await expectFocused(placeholder("Search workspaces or notes…"));
  await press("Escape");

  await expectAttribute(role("button", "Hide Explorer", { exact: true }), "aria-expanded", "true");
  await click(role("button", "Hide Explorer", { exact: true }));
  await expectAttribute("#notespace-home-sidebar", "aria-hidden", "true");
  await expectAttribute("#notespace-home-sidebar", "data-notespace-library-explorer", "closed");
  assert.equal(await evaluate("html", () => document.querySelector("#notespace-home-sidebar").inert), true);
  await expectCount('#notespace-home-sidebar aside[aria-label="Workspace explorer"]', 1);
  await visible("[data-explorer-edge-trigger]");
  await evaluate("[data-explorer-edge-trigger]", (element) => {
    element.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  });
  await expectAttribute("#notespace-home-sidebar", "data-notespace-library-explorer", "peeking");
  await waitFor(async () => (await box("#notespace-home-sidebar")).width >= 220, "Peeked Explorer finishes expanding");
  await click(role("button", "Show Explorer", { exact: true, scope: "#notespace-home-sidebar" }));
  await visible(role("complementary", "Workspace explorer"));
  await expectAttribute("#notespace-home-sidebar", "data-notespace-library-explorer", "open");
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
    await visible(role("complementary", "Workspace explorer"));
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
    await visible(role("complementary", "Workspace explorer"));
    await expectCount(role("dialog", "Workspace explorer"), 0);
    const before = await box("main");
    await click(role("button", /Search Notespace/));
    await visible(role("dialog", "Quick Open"));
    await press("Escape");
    await expectAttribute(role("button", "Hide Explorer", { exact: true }), "aria-expanded", "true");
    await press("Escape");
    await visible(role("button", "Show Explorer", { exact: true }));
    await expectAttribute("#notespace-home-sidebar", "aria-hidden", "true");
    await waitFor(async () => (await box("main")).width === before.width, "Mobile drawer never shrinks content");
    await click(role("button", "Show Explorer", { exact: true }));
    const backdrop = await box(role("button", "Close Explorer", { exact: true }));
    await clickAt(backdrop.x + backdrop.width - 10, backdrop.y + 100);
    await visible(role("button", "Show Explorer", { exact: true }));
    await expectAttribute("#notespace-home-sidebar", "aria-hidden", "true");
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
    await expectAttribute("#notespace-home-sidebar", "data-notespace-library-explorer", "closed");
    await press("Control+\\");
    await visible(role("button", "Hide Explorer", { exact: true }));
    await setViewport(390, 780);
    await click(role("button", "Show Explorer", { exact: true }));
    await click(role("link", "Workspace Map", { exact: true, scope: "#notespace-home-sidebar" }));
    await waitUrl(/\/map$/);
    await click(role("link", `Open ${workspace.title}`, { exact: true }));
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

test("critical: Heptabase sidebar links to Workspace Map and Cards while Canvas breadcrumb tracks ancestors", async () => {
  const stamp = Date.now();
  const root = await createWorkspace(`CS ${stamp}`);
  const child = await createWorkspace(`Networking ${stamp}`, { parentId: root.id });
  const unrelated = await createWorkspace(`Biology ${stamp}`);
  try {
    await goto(`/workspaces/${child.id}`);
    await expectCount(role("navigation", "Workspace context"), 0);
    const breadcrumb = role("navigation", "Workspace breadcrumb");
    await visible(role("link", "Workspace Map", { exact: true, scope: breadcrumb }));
    await visible(role("link", root.title, { exact: true, scope: breadcrumb }));

    await click(role("link", "Workspace Map", { exact: true, scope: "#notespace-home-sidebar" }));
    await waitUrl(/\/map$/);
    await click(role("link", `Open ${unrelated.title}`, { exact: true }));
    await waitUrl(new RegExp(`/workspaces/${unrelated.id}$`));
    await back();
    await waitUrl(/\/map$/);

    await goto("/?category=legacy");
    await waitUrl(/\/$/);
  } finally {
    await cleanupWorkspace(child.id);
    await cleanupWorkspace(root.id);
    await cleanupWorkspace(unrelated.id);
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
    await visible(role("complementary", "Workspace explorer"));
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

  await goto("/map");
  const alert = role("alert", null, { hasText: /Workspaces could not be loaded/ });
  await visible(alert);
  await expectCount(role("heading", "No workspaces yet", { exact: true }), 0);
  await expectCount(role("button", "Create Workspace"), 0);
  await click(role("button", "Retry", { scope: alert }));
  await expectCount(alert, 0);
});
