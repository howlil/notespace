/* Canvas HTML code-block previews are interactive, isolated and source-only. */
import { after, before, test } from "node:test";
import { api, assert, click, cleanupWorkspace, createWorkspace, doubleClick, execute, expectAttribute, expectCount, fill, openWorkspace, parentFrame, press, role, selectOptionValue, start, stop, switchFrame, visible, waitFor, waitSaved, within } from "../support/harness.mjs";

before(start);
after(stop);

const html = `<style>button{background:rgb(40,88,216);color:white}</style>
<button id="counter">Count <span id="count">0</span></button>
<script>document.querySelector('#counter').addEventListener('click', () => {
  const value = document.querySelector('#count');
  value.textContent = String(Number(value.textContent) + 1);
});</script>`;

async function editCanvasHtml(code) {
  await click(role("button", "Code block", { exact: true, scope: role("toolbar", "Canvas tools") }));
  const block = "[data-canvas-code-block]";
  await visible(block);
  await selectOptionValue(role("combobox", "Code language", { scope: role("toolbar", "Code block actions") }), "xml");
  await doubleClick(block);
  await fill(await within(block, '[aria-label="Edit code block"]'), code);
  await press("Escape");
}

test("Canvas HTML preview is interactive and source-only persistence survives refresh", async () => {
  const workspace = await createWorkspace(`HTML canvas ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    await click(role("button", "Code block", { exact: true, scope: role("toolbar", "Canvas tools") }));
    const block = "[data-canvas-code-block]";
    const actions = role("toolbar", "Code block actions");
    await visible(block);
    await selectOptionValue(role("combobox", "Code language", { scope: actions }), "xml");

    await doubleClick(block);
    const source = await within(block, '[aria-label="Edit code block"]');
    await fill(source, html);
    await press("Escape");

    const previewButton = role("button", "Preview HTML", { scope: actions });
    await visible(previewButton);
    await expectCount('iframe[title="Canvas interactive HTML preview"]', 0);
    await click(previewButton);

    const frameSelector = 'iframe[title="Canvas interactive HTML preview"]';
    await expectAttribute(frameSelector, "sandbox", "allow-scripts");
    await switchFrame(frameSelector);
    await waitFor(() => execute(() => Boolean(document.querySelector("#count"))), "Canvas preview renders inside the iframe");
    assert.equal((await execute(() => document.querySelector("#count").textContent)).trim(), "0");
    await execute(() => document.querySelector("#counter").click());
    assert.equal((await execute(() => document.querySelector("#count").textContent)).trim(), "1");
    await parentFrame();

    await click(role("button", "Hide HTML preview", { scope: actions }));
    await expectCount(frameSelector, 0);

    await waitSaved();
    const stored = await api(`/api/workspaces/${workspace.id}`);
    assert.equal((stored.canvas.data.elements ?? []).some((element) =>
      element.customData?.notespaceCodeBlock?.code === html), true);
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("HTML preview cannot access app DOM or call local API through fetch", async () => {
  const workspace = await createWorkspace(`HTML isolation ${Date.now()}`);
  const isolation = `<div id="state">init</div><script>
const root = document.querySelector('#state');
try { root.textContent = parent.document.title; } catch { root.textContent = 'parent-blocked'; }
fetch('/api/health').then(() => root.textContent = 'network-open').catch(() => root.dataset.net = 'blocked');
</script>`;
  try {
    await openWorkspace(workspace.id);
    await editCanvasHtml(isolation);

    const block = "[data-canvas-code-block]";
    await visible(block);
    await click(role("button", "Preview HTML", { scope: role("toolbar", "Code block actions") }));

    const frameSelector = 'iframe[title="Canvas interactive HTML preview"]';
    await expectAttribute(frameSelector, "srcdoc", /id="state"/);
    await switchFrame(frameSelector);
    await waitFor(() => execute(() => Boolean(document.querySelector("#state"))), "Isolation payload renders inside the iframe");
    const isolated = await execute(() => {
      const state = document.querySelector("#state");
      const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return {
        text: state.textContent,
        net: state.dataset.net ?? null,
        policy: policy?.getAttribute("content") ?? "",
      };
    });
    assert.equal(isolated.text, "parent-blocked");
    assert.equal(isolated.net, "blocked");
    assert.match(isolated.policy, /connect-src 'none'/);
    await parentFrame();
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});
