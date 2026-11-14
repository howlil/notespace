/* Canvas HTML preview renders lazily in a two-layer opaque-origin srcdoc sandbox with full navigation and API containment. */
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import {
  api,
  assert,
  click,
  cleanupWorkspace,
  containsText,
  createWorkspace,
  doubleClick,
  execute,
  expectAttribute,
  expectCount,
  fill,
  openWorkspace,
  parentFrame,
  press,
  reload,
  role,
  sleep,
  start,
  stop,
  switchFrame,
  visible,
  waitFor,
  waitSaved,
  within,
} from "../support/harness.mjs";

before(start);
after(stop);

const HOST_FRAME = 'iframe[name="notespace-html-preview-host"][title="Canvas interactive HTML preview host"]';
const CONTENT_FRAME = 'iframe[name="notespace-html-preview"][title="Canvas interactive HTML preview"]';

const INTERACTIVE_HTML = `<style>button{background:rgb(40,88,216);color:white}</style>
<button id="counter">Count <span id="count">0</span></button>
<script>document.querySelector('#counter').addEventListener('click', () => {
  const count = document.querySelector('#count');
  count.textContent = String(Number(count.textContent) + 1);
});</script>`;

async function withTrapServer(run) {
  const leaks = [];
  const server = createServer((req, res) => {
    leaks.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<html><body>trap-leaked</body></html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`, leaks);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function createHtmlBlock(code) {
  await click(role("button", "Code block", { exact: true, scope: role("toolbar", "Canvas tools") }));
  const block = "[data-canvas-code-block]";
  const actions = role("toolbar", "Code block settings");
  await visible(block);
  await click(role("button", "Code language", { scope: actions }));
  await fill(role("textbox", "Search code languages"), "HTML");
  await click(role("button", "HTML / XML", { exact: true, scope: role("dialog", "Code language") }));
  await visible(role("button", "Preview HTML", { scope: actions }));
  await doubleClick(block);
  await fill(await within(block, '[aria-label="Edit code block"]'), code);
  await press("Escape");
  return { block, actions };
}

test("Canvas HTML preview is opt-in, interactive, ephemeral, and source-only in API persistence", async () => {
  const workspace = await createWorkspace(`HTML preview ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const { block, actions } = await createHtmlBlock(INTERACTIVE_HTML);

    // Lazy execution: neither source editing nor opening code output runs HTML until opted in.
    await expectCount(HOST_FRAME, 0);
    await click(role("button", "Show code output", { scope: actions }));
    await containsText(await within(block, '[aria-label="Code output"]'), "Preview HTML to render isolated output");
    await expectCount(HOST_FRAME, 0);

    await click(role("button", "Preview HTML", { scope: actions }));
    await expectAttribute(HOST_FRAME, "sandbox", "allow-scripts");
    await expectAttribute(HOST_FRAME, "referrerpolicy", "no-referrer");

    await switchFrame(HOST_FRAME);
    await expectAttribute(CONTENT_FRAME, "sandbox", "allow-scripts");
    await expectAttribute(CONTENT_FRAME, "referrerpolicy", "no-referrer");
    await switchFrame(CONTENT_FRAME);
    await waitFor(() => execute(() => Boolean(document.querySelector("#count"))), "Interactive HTML renders inside inner sandbox frame");
    assert.equal((await execute(() => document.querySelector("#count").textContent)).trim(), "0");
    await execute(() => document.querySelector("#counter").click());
    assert.equal((await execute(() => document.querySelector("#count").textContent)).trim(), "1");
    await parentFrame();

    await click(role("button", "Hide HTML preview", { scope: actions }));
    await expectCount(HOST_FRAME, 0);

    await waitSaved();
    const stored = await api(`/api/workspaces/${workspace.id}`);
    const savedElements = (stored.canvas.data.elements ?? []).filter((element) => !element.isDeleted);
    assert.equal(savedElements.some((element) => element.customData?.notespaceCodeBlock?.code === INTERACTIVE_HTML), true);
    assert.equal(savedElements.some((element) => "previewHtml" in (element.customData?.notespaceCodeBlock ?? {})), false);

    // Reload never auto-executes HTML previews.
    await reload();
    await visible(block);
    await expectCount(HOST_FRAME, 0);
    await expectCount(role("button", "Preview HTML", { scope: role("toolbar", "Code block settings") }), 0);
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("Canvas HTML preview blocks DOM, storage, worker, API fetch, popup, form, nested frame, and navigation escapes", async () => {
  await withTrapServer(async (trapOrigin, leaks) => {
    const workspace = await createWorkspace(`HTML isolation ${Date.now()}`);
    const escapeHtml = `<pre id="report">pending</pre>
<a id="self-link" href="${trapOrigin}/leak-anchor-self">self</a>
<a id="top-link" href="${trapOrigin}/leak-anchor-top" target="_top">top</a>
<a id="dl-link" href="data:text/plain,evil" download="leak.txt">dl</a>
<form id="trap-form" action="${trapOrigin}/leak-form" method="GET"><button id="submit-trap" type="submit">Go</button></form>
<iframe id="nested-trap" src="${trapOrigin}/leak-nested-iframe"></iframe>
<script>
(async () => {
  const out = { origin: window.origin };
  try { void parent.document.title; out.parentDoc = 'LEAKED'; } catch { out.parentDoc = 'blocked'; }
  try { void top.document.title; out.topDoc = 'LEAKED'; } catch { out.topDoc = 'blocked'; }
  try { localStorage.setItem('x', '1'); out.storage = 'LEAKED'; } catch { out.storage = 'blocked'; }
  try { out.cookies = document.cookie || 'none'; } catch { out.cookies = 'blocked'; }
  try { new Worker('/code-runner-worker.js'); out.worker = 'LEAKED'; } catch { out.worker = 'blocked'; }
  try { const popup = window.open('${trapOrigin}/leak-popup', '_blank'); out.popup = popup ? 'LEAKED' : 'blocked'; } catch { out.popup = 'blocked'; }
  try { await fetch('/api/health'); out.fetchApi = 'LEAKED'; } catch { out.fetchApi = 'blocked'; }
  try { await fetch('${trapOrigin}/leak-fetch'); out.fetchTrap = 'LEAKED'; } catch { out.fetchTrap = 'blocked'; }
  const report = document.querySelector('#report');
  report.textContent = JSON.stringify(out);
  report.dataset.done = '1';
})();
</script>`;
    try {
      await openWorkspace(workspace.id);
      const workspacePath = `/workspaces/${workspace.id}`;
      const { block, actions } = await createHtmlBlock(escapeHtml);
      await click(role("button", "Preview HTML", { scope: actions }));

      await switchFrame(HOST_FRAME);
      await switchFrame(CONTENT_FRAME);
      await waitFor(
        () => execute(() => document.querySelector("#report")?.dataset.done === "1"),
        "Adversarial probe script completed inside preview sandbox",
      );
      const report = JSON.parse(await execute(() => document.querySelector("#report").textContent));
      assert.equal(report.origin, "null");
      assert.equal(report.parentDoc, "blocked");
      assert.equal(report.topDoc, "blocked");
      assert.equal(report.storage, "blocked");
      assert.equal(report.cookies, "blocked");
      assert.equal(report.worker, "blocked");
      assert.equal(report.popup, "blocked");
      assert.equal(report.fetchApi, "blocked");
      assert.equal(report.fetchTrap, "blocked");

      await execute(() => {
        document.querySelector("#submit-trap").click();
        document.querySelector("#dl-link").click();
        document.querySelector("#top-link").click();
        document.querySelector("#self-link").click();
      });
      await parentFrame();
      await sleep(350);

      assert.equal(await execute(() => location.pathname), workspacePath);
      await visible(block);
      assert.deepEqual(leaks, []);

      // Replace with immediate automatic navigation attempts (<meta refresh> + location.href).
      const navTrapHtml = `<meta http-equiv="refresh" content="0;url=${trapOrigin}/leak-meta-refresh">
<script>setTimeout(() => { try { location.href = '${trapOrigin}/leak-loc-href'; } catch {} }, 30);</script>`;
      await doubleClick(await within(block, '[aria-label="Code source"]'));
      await fill(await within(block, '[aria-label="Edit code block"]'), navTrapHtml);
      await press("Escape");
      // Wait longer than HtmlPreviewFrame debounce (450ms) + navigation settlement.
      await sleep(900);

      assert.equal(await execute(() => location.pathname), workspacePath);
      await visible(block);
      assert.deepEqual(leaks, []);
    } finally {
      await cleanupWorkspace(workspace.id);
    }
  });
});
