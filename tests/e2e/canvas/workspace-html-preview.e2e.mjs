/* HTML stays editable as source while browser-safe execution isolation is unresolved. */
import { after, before, test } from "node:test";
import { api, assert, click, cleanupWorkspace, createWorkspace, doubleClick, expectCount, fill, openWorkspace, press, reload, role, start, stop, visible, waitSaved, within } from "../support/harness.mjs";

before(start);
after(stop);

const html = `<button id="counter">Count <span id="count">0</span></button>
<script>document.querySelector('#counter').addEventListener('click', () => {
  const count = document.querySelector('#count');
  count.textContent = String(Number(count.textContent) + 1);
});</script>`;

test("HTML code remains editable and persisted while browser preview is disabled", async () => {
  const workspace = await createWorkspace(`HTML source ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    await click(role("button", "Code block", { exact: true, scope: role("toolbar", "Canvas tools") }));
    const block = "[data-canvas-code-block]";
    const actions = role("toolbar", "Code block settings");
    await visible(block);
    await click(role("button", "Code language", { scope: actions }));
    await fill(role("textbox", "Search code languages"), "HTML");
    await click(role("button", "HTML / XML", { exact: true, scope: role("dialog", "Code language") }));
    await visible(role("button", "HTML preview disabled: browser and WebView2 isolation is not verified", { scope: actions }));
    await doubleClick(block);
    await fill(await within(block, '[aria-label="Edit code block"]'), html);
    await press("Escape");

    await expectCount(role("button", "Preview HTML", { scope: actions }), 0);
    await expectCount('iframe[title="Canvas interactive HTML preview"]', 0);
    await waitSaved();
    const stored = await api(`/api/workspaces/${workspace.id}`);
    assert.equal((stored.canvas.data.elements ?? []).some((element) =>
      element.customData?.notespaceCodeBlock?.code === html), true);

    await reload();
    await visible(block);
    await expectCount(role("button", "Preview HTML", { scope: role("toolbar", "Code block settings") }), 0);
    const reloaded = await api(`/api/workspaces/${workspace.id}`);
    assert.equal((reloaded.canvas.data.elements ?? []).some((element) =>
      element.customData?.notespaceCodeBlock?.code === html), true);
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});
