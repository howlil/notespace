/* Library-first navigation: disclosure does not navigate, selection owns the URL,
 * one fetch per expansion, Quick Open never reports a false empty result. */
import { after, before, test } from "node:test";
import {
  api, assert, cleanupWorkspace, click, createCategory, createWorkspace, deleteCategory,
  evaluate, expectCount, goto, injectFault, placeholder, queryParam, requestLog,
  back, expectAttribute, expectClass, fill, resetViewport, rightClick, role, setViewport, sleep, start, stop, text,
  visible, waitFor,
} from "../support/harness.mjs";

before(start);
after(stop);

const categoryButton = (title) => role("button", title, { exact: true });

test("critical: categories disclose without navigation and View category filters Home", async () => {
  const [category] = await api("/api/categories");
  assert.ok(category);
  await goto("/");
  const explorer = role("navigation", "Categories");
  await click(role("button", `Expand ${category.title}`, { scope: explorer }));
  await waitFor(async () => (await queryParam("category")) === null, "Disclosure must not change the URL");
  await visible(role("button", `Collapse ${category.title}`, { scope: explorer }));
  await click(categoryButton(category.title));
  assert.equal(await queryParam("category"), null, "Title activation is disclosure only");
  await rightClick(categoryButton(category.title));
  await click(role("menuitem", "View category"));
  await waitFor(async () => (await queryParam("category")) === category.id, "Explicit category navigation owns the URL");
});

test("critical: mobile Home opens categories from the separate Explorer toggle", async () => {
  await setViewport(390, 780);
  try {
    await goto("/");
    await expectAttribute("#notespace-home-sidebar", "aria-hidden", "true");
    await click(role("button", "Show Explorer", { exact: true }));
    await visible(role("navigation", "Categories"));
    await expectCount(role("dialog", "Workspace explorer"), 0);
    await click(role("button", "Hide Explorer", { exact: true }));
    await expectAttribute("#notespace-home-sidebar", "aria-hidden", "true");
  } finally {
    await resetViewport();
  }
});

test("Expanding one category issues one Workspace fetch and shows its loading state", async () => {
  const [category] = await api("/api/categories");
  assert.ok(category);

  await goto("/");
  const before = (await requestLog()).filter((entry) => entry.path.startsWith(`/api/categories/${category.id}/workspaces`)).length;
  const explorer = role("navigation", "Categories");
  await click(role("button", `Expand ${category.title}`, { scope: explorer }));
  await visible(role("button", `Collapse ${category.title}`, { scope: explorer }));
  await expectCount(role("status", `Loading ${category.title}`), 0);

  const requests = (await requestLog()).filter((entry) => entry.path.startsWith(`/api/categories/${category.id}/workspaces`));
  assert.equal(requests.length - before, 1, "One expansion must issue exactly one Workspace fetch");
});

test("Quick Open does not report an empty result during pending search or retryable failure", async () => {
  await injectFault({
    method: "GET",
    path: /\/api\/search\?q=/,
    times: 1,
    // Hold long enough for the pending state to be observable, then fail.
    respond: async () => {
      await sleep(600);
      return { status: 503, body: '{"error":"offline"}' };
    },
  });

  await goto("/");
  await click(role("button", /Search Notespace/));

  const quickOpen = role("dialog", "Quick Open");
  await visible(quickOpen);
  const search = placeholder("Open workspace or category…");
  await visible(search);
  await fill(search, "no-results-for-quick-open-m6");

  await visible(role("status", null, { scope: quickOpen, hasText: /Searching Notespace/ }));
  await expectCount(text("No matching knowledge.", { scope: quickOpen }), 0);
  await visible(role("alert", null, { scope: quickOpen, hasText: /Search could not be loaded\./ }));
  await click(role("button", "Retry", { scope: quickOpen }));
  await visible(text("No matching knowledge.", { scope: quickOpen }));
  const searches = (await requestLog()).filter((entry) => entry.path.startsWith("/api/search?q=")).length;
  assert.equal(searches, 2, "Retry must issue exactly one additional search request");
});

test("Switching categories replaces the visible workspaces without stale results", async () => {
  const suffix = Date.now();
  const categoryA = await createCategory(`Filter Source ${suffix}`);
  const categoryB = await createCategory(`Filter Target ${suffix}`);
  const workspaceA = await createWorkspace(`Source Workspace ${suffix}`, { categoryId: categoryA.id });
  const workspaceB = await createWorkspace(`Target Workspace ${suffix}`, { categoryId: categoryB.id });
  const highlight = (link) => evaluate(link, (element) => element.querySelector("article")?.className ?? "");

  try {
    await goto(`/?category=${categoryA.id}`);
    await visible(role("link", `Open ${workspaceA.title}`));
    assert.match(await highlight(role("link", `Open ${workspaceA.title}`)), /bg-accent/);
    await visible(role("group", "Category workspaces"));
    await expectCount(role("link", `Open ${workspaceB.title}`), 0);

    await rightClick(categoryButton(categoryB.title));
    await click(role("menuitem", "View category"));
    await waitFor(async () => (await queryParam("category")) === categoryB.id, "Selection switches category");
    await expectClass(role("link", `Open ${workspaceB.title}`), /./);
    assert.match(await highlight(role("link", `Open ${workspaceB.title}`)), /bg-accent/);
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
