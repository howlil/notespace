/* Global search opens the matching Workspace Canvas and recovers from pending/failed queries. */
import { after, before, test } from "node:test";
import {
  api, assert, click, cleanupWorkspace, createWorkspace, expectCount, fill, goto,
  injectFault, placeholder, requestLog, role, sleep, start, stop, text, visible, waitUrl,
} from "../support/harness.mjs";

before(start);
after(stop);

test("critical: global search finds a Workspace and opens its Canvas", async () => {
  const token = `Search${Date.now()}`;
  const workspace = await createWorkspace(`Distributed systems ${token}`);
  try {
    await goto("/");
    await click(role("button", "Search Notespace", { exact: true }));
    const field = placeholder("Search workspaces or notes…");
    await fill(field, token);
    await click(role("button", new RegExp(token), { scope: role("dialog", "Quick Open"), index: 0 }));
    await waitUrl(new RegExp(`/workspaces/${workspace.id}$`));
    await visible(".excalidraw__canvas.interactive");
    assert.equal((await api(`/api/workspaces/${workspace.id}`)).title, workspace.title);
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("Quick Open does not report an empty result during pending search or retryable failure", async () => {
  await injectFault({
    method: "GET",
    path: /\/api\/search\?q=/,
    times: 1,
    respond: async () => {
      await sleep(600);
      return { status: 503, body: '{"error":"offline"}' };
    },
  });

  await goto("/");
  await click(role("button", /Search Notespace/));

  const quickOpen = role("dialog", "Quick Open");
  await visible(quickOpen);
  const search = placeholder("Search workspaces or notes…");
  await visible(search);
  await fill(search, "no-results-for-quick-open-query");

  await visible(role("status", null, { scope: quickOpen, hasText: /Searching Notespace/ }));
  await expectCount(text("No matching knowledge.", { scope: quickOpen }), 0);
  await visible(role("alert", null, { scope: quickOpen, hasText: /Search could not be loaded\./ }));
  const beforeRetry = (await requestLog()).filter((entry) => entry.path.startsWith("/api/search?q=")).length;
  await click(role("button", "Retry", { scope: quickOpen }));
  await visible(text("No matching knowledge.", { scope: quickOpen }));
  const afterRetry = (await requestLog()).filter((entry) => entry.path.startsWith("/api/search?q=")).length;
  assert.equal(afterRetry - beforeRetry, 1, "Retry must issue exactly one additional search request");
});
