import { test, expect, createViaAPI, cleanupWorkspace, selectView } from "./fixtures";

const html = `<style>button{background:rgb(40,88,216);color:white}</style>
<button id="counter">Count <span id="count">0</span></button>
<script>document.querySelector('#counter').addEventListener('click', () => {
  const value = document.querySelector('#count');
  value.textContent = String(Number(value.textContent) + 1);
});</script>`;


async function pastePlainText(page: import("@playwright/test").Page, source: import("@playwright/test").Locator, value: string) {
  // Dispatching a synthetic ClipboardEvent is untrusted and ProseMirror may
  // legitimately ignore it. Exercise a genuine browser clipboard paste.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), value);
  await source.click();
  await source.press("ControlOrMeta+V");
}


test("Note HTML code block previews interactive inline markup in an isolated iframe", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `HTML note ${Date.now()}`);
  try {
    await selectView(page, "Note");
    await page.getByRole("textbox", { name: "Workspace document" }).fill("/code");
    await page.getByRole("listbox", { name: "Insert block" }).getByRole("option", { name: /Code block/ }).click();
    const block = page.locator("[data-note-code-block]").first();
    await block.getByRole("combobox", { name: "Code language" }).selectOption("xml");
    const source = block.getByLabel("Edit code block");
    await pastePlainText(page, source, html);
    await expect(source).toContainText('id="counter"');

    await expect(block.getByRole("button", { name: "Preview HTML" })).toBeVisible();
    await expect(block.locator("iframe")).toHaveCount(0);
    await block.getByRole("button", { name: "Preview HTML" }).click();
    const iframe = block.locator('iframe[title="Interactive HTML preview"]');
    await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
    await expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(iframe).toHaveAttribute("srcdoc", /id="counter"/);
    const preview = block.frameLocator('iframe[title="Interactive HTML preview"]');
    await expect(preview.locator("#count")).toHaveText("0");
    await preview.locator("#counter").click();
    await expect(preview.locator("#count")).toHaveText("1");
    await expect(block.getByLabel("Edit code block")).toContainText("counter");

    await block.getByRole("button", { name: "Hide HTML preview" }).click();
    await expect(iframe).toHaveCount(0);
    await expect(page.getByRole("status", { name: "Workspace save status" })).toHaveText("Saved");
    const saved = await (await request.get(`/api/workspaces/${id}`)).json();
    const code = saved.notes[0].document.data.content.find((node: { type?: string }) => node.type === "codeBlock");
    expect(code.content.map((n: { text?: string }) => n.text ?? "").join("")).toBe(html);
    expect(JSON.stringify(saved.notes[0].document.data)).not.toContain("previewOpen");
  } finally {
    await cleanupWorkspace(request, id);
    await request.delete(`/api/trash/${id}`).catch(() => undefined);
  }
});

test("Canvas HTML preview is interactive and source-only persistence survives refresh", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `HTML canvas ${Date.now()}`);
  try {
    await selectView(page, "Canvas");
    await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "Code block", exact: true }).click();
    const block = page.locator("[data-canvas-code-block]").first();
    const actions = page.getByRole("toolbar", { name: "Code block actions" });
    await expect(block).toBeVisible();
    await actions.getByRole("combobox", { name: "Code language" }).selectOption("xml");

    const box = await block.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await block.getByRole("textbox", { name: "Edit code block" }).fill(html);
    await block.getByRole("textbox", { name: "Edit code block" }).press("Escape");
    await expect(actions.getByRole("button", { name: "Preview HTML" })).toBeVisible();
    await expect(page.locator('iframe[title="Canvas interactive HTML preview"]')).toHaveCount(0);
    await actions.getByRole("button", { name: "Preview HTML" }).click();
    const iframe = page.locator('iframe[title="Canvas interactive HTML preview"]');
    await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
    const preview = page.frameLocator('iframe[title="Canvas interactive HTML preview"]');
    await expect(preview.locator("#count")).toHaveText("0");
    await preview.locator("#counter").click();
    await expect(preview.locator("#count")).toHaveText("1");
    await actions.getByRole("button", { name: "Hide HTML preview" }).click();
    await expect(iframe).toHaveCount(0);

    await expect.poll(async () => {
      const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
        canvas: { data: { elements: Array<{ customData?: { notespaceCodeBlock?: { code?: string } } }> } };
      };
      return stored.canvas.data.elements.some((e) => e.customData?.notespaceCodeBlock?.code === html);
    }).toBe(true);
  } finally {
    await cleanupWorkspace(request, id);
    await request.delete(`/api/trash/${id}`).catch(() => undefined);
  }
});

test("HTML preview cannot access app DOM or call local API through fetch", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `HTML isolation ${Date.now()}`);
  try {
    await selectView(page, "Note");
    await page.getByRole("textbox", { name: "Workspace document" }).fill("/code");
    await page.getByRole("listbox", { name: "Insert block" }).getByRole("option", { name: /Code block/ }).click();
    const block = page.locator("[data-note-code-block]").first();
    await block.getByRole("combobox", { name: "Code language" }).selectOption("xml");
    const source = block.getByLabel("Edit code block");
    await pastePlainText(page, source, `<div id="state">init</div><script>
const root = document.querySelector('#state');
try { root.textContent = parent.document.title; } catch { root.textContent = 'parent-blocked'; }
fetch('/api/health').then(() => root.textContent = 'network-open').catch(() => root.dataset.net = 'blocked');
</script>`);
    await expect(source).toContainText('id="state"');
    await block.getByRole("button", { name: "Preview HTML" }).click();
    await expect(block.locator('iframe[title="Interactive HTML preview"]')).toHaveAttribute('srcdoc', /id="state"/);
    const frame = page.frameLocator('iframe[title="Interactive HTML preview"]');
    await expect(frame.locator("#state")).toHaveText("parent-blocked");
    await expect(frame.locator("#state")).toHaveAttribute("data-net", "blocked");
    await expect(frame.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute("content", /connect-src 'none'/);
  } finally {
    await cleanupWorkspace(request, id);
    await request.delete(`/api/trash/${id}`).catch(() => undefined);
  }
});
