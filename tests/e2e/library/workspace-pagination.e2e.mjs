/* Root workspace pagination keeps one listing snapshot across a remote rename and
 * restarts cleanly when the snapshot token expires. */
import { after, before, test } from "node:test";
import {
  apiResponse, assert, cleanupWorkspace, click, containsText, clearFault,
  createWorkspace, expectCount, goto, injectFault, reload, role, start, stop, visible,
} from "../support/harness.mjs";

before(start);
after(stop);

test("Root workspace page navigation retains one listing snapshot across a remote rename", async () => {
  const suffix = Date.now();
  const workspaces = [];
  try {
    for (let index = 0; index < 51; index += 1) {
      workspaces.push(await createWorkspace(`Page ${String(index).padStart(3, "0")} ${suffix}`));
    }

    await goto("/map");
    const pagination = role("navigation", "Workspace pages");
    const firstLink = role("link", `Open ${workspaces[50].title}`);
    const lastLink = role("link", `Open ${workspaces[0].title}`);
    await visible(firstLink);
    await containsText(pagination, "1–50 of 51");

    await click(role("button", "Next", { scope: pagination }));
    await visible(lastLink);
    await containsText(pagination, "51–51 of 51");

    // Rename the off-page entry; snapshot keeps page 1 stable until restart.
    const renamed = await apiResponse(`/api/workspaces/${workspaces[50].id}/title`, {
      method: "PATCH",
      body: { title: `Page Renamed ${suffix}`, expectedTitle: workspaces[50].title },
    });
    assert.equal(renamed.status, 200);

    await click(role("button", "Previous", { scope: pagination }));
    await visible(firstLink);
    await containsText(pagination, "1–50 of 51");
    await click(role("button", "Next", { scope: pagination }));
    await visible(lastLink);
    await containsText(pagination, "51–51 of 51");

    // A 409 when returning to offset zero must restart, not trap the UI with a
    // stale token and a Retry button that repeats the same request.
    let expiredOnce = false;
    const fault = await injectFault({
      method: "GET",
      path: /\/api\/workspaces\?/,
      respond: async (request) => {
        const params = new URL(request.path, "http://localhost").searchParams;
        const snapshot = params.get("snapshot");
        if (!expiredOnce && snapshot && snapshot !== "start" && !params.get("offset")) {
          expiredOnce = true;
          return { status: 409, body: '{"error":"Snapshot expired"}' };
        }
        return null;
      },
    });

    await click(role("button", "Previous", { scope: pagination }));
    await visible(role("link", `Open Page Renamed ${suffix}`));
    assert.equal(expiredOnce, true, "Expired snapshot must be simulated exactly once");
    await clearFault(fault);

    await reload();
    await visible(role("link", `Open Page Renamed ${suffix}`));
    await expectCount(role("alert", /could not be loaded/), 0);
  } finally {
    for (const workspace of workspaces) await cleanupWorkspace(workspace.id);
  }
});
