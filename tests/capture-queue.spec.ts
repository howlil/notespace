import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("@critical Capture Queue creates and edits pending items without standalone Tasks", async ({ page, request }) => {
  const first = `M2 Queue ${Date.now()}`;
  let id = "";
  try {
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "Capture Queue" })).toBeVisible();
    const field = page.getByRole("textbox", { name: "Capture an unorganized thought" });
    await field.fill(first);
    await page.getByRole("button", { name: "Capture", exact: true }).click();
    await expect(page.getByText(first, { exact: true })).toBeVisible();
    const data = await (await request.get("/api/captures")).json() as Array<{ id: string; content: string; version: number }>;
    id = data.find((item) => item.content === first)?.id ?? "";
    expect(id).not.toBe("");

    await page.getByRole("button", { name: `Edit capture ${id}` }).click();
    const dialog = page.getByRole("dialog", { name: "Edit capture" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: "Captured content" }).fill(first + " revised");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(first + " revised", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(first + " revised", { exact: true })).toBeVisible();
  } finally {
    if (id) {
      const res = await request.get(`/api/captures/${id}`);
      if (res.ok()) {
        const item = await res.json() as { version: number; status: string };
        if (item.status === "pending") await request.delete(`/api/captures/${id}`, { headers: { "If-Match": `"${item.version}"` } });
      }
    }
  }
});

test("Quick Capture can save to Queue without a Workspace", async ({ page, request }) => {
  const content = `Queue from quick capture ${Date.now()}`;
  let id = "";
  try {
    await page.goto("/");
    await page.keyboard.press("Control+Shift+N");
    const dialog = page.getByRole("dialog", { name: "Quick capture" });
    await dialog.getByRole("combobox", { name: "Destination" }).selectOption("queue");
    await dialog.getByRole("textbox", { name: "Capture", exact: true }).fill(content);
    await dialog.getByRole("button", { name: "Save to Queue" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("link", { name: "Capture Queue", exact: true }).click();
    await expect(page.getByText(content, { exact: true })).toBeVisible();
    const pending = await (await request.get("/api/captures")).json() as Array<{ id: string; content: string; version: number }>;
    id = pending.find((x) => x.content === content)?.id ?? "";
    expect(id).not.toBe("");
  } finally {
    if (id) {
      const res = await request.get(`/api/captures/${id}`);
      if (res.ok()) {
        const item = await res.json() as { version: number; status: string };
        if (item.status === "pending") await request.delete(`/api/captures/${id}`, { headers: { "If-Match": `"${item.version}"` } });
      }
    }
  }
});

test("Organizing Markdown Capture creates one Workspace-owned rich Note", async ({ page, request }) => {
  const title = `M2 Rich Note ${Date.now()}`;
  const markdown = `# Heading ${title}\n\n**Important** details`;
  const created = await request.post("/api/workspaces", { data: { title } });
  expect(created.ok()).toBe(true);
  const workspace = await created.json() as { id: string };
  const captured = await request.post("/api/captures", { data: { content: markdown } });
  expect(captured.ok()).toBe(true);
  const item = await captured.json() as { id: string };
  try {
    await page.goto("/inbox");
    const row = page.getByText(markdown, { exact: true }).locator("..").locator("..");
    await row.getByRole("button", { name: "Organize" }).click();
    const dialog = page.getByRole("dialog", { name: "Organize capture" });
    await dialog.getByRole("combobox", { name: "Save as" }).selectOption("note");
    await dialog.getByRole("combobox", { name: /Workspace \(required\)/ }).selectOption(workspace.id);
    await dialog.getByRole("button", { name: "Organize" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(markdown, { exact: true })).toHaveCount(0);

    const result = await request.get(`/api/workspaces/${workspace.id}`);
    expect(result.ok()).toBe(true);
    const hydrated = await result.json() as { notes: Array<{ document: { data: { content: Array<{ type: string }> } } }> };
    expect(hydrated.notes.some((note) => note.document.data.content.some((block) => block.type === "heading"))).toBe(true);
    const receiptResponse = await request.get(`/api/captures/${item.id}`);
    const receipt = await receiptResponse.json() as { status: string; targetWorkspaceId: string };
    expect(receipt).toMatchObject({ status: "converted", targetWorkspaceId: workspace.id });
  } finally {
    const current = await request.get(`/api/workspaces/${workspace.id}`);
    if (current.ok()) {
      const ws = await current.json() as { version: number };
      await request.delete(`/api/workspaces/${workspace.id}`, { headers: { "If-Match": `"${ws.version}"` } }).catch(() => undefined);
    }
    // Converted receipts intentionally remain immutable; this fixture uses a unique ID.
  }
});

test("Organize cannot submit a Workspace hidden by a changed search filter", async ({ page, request }) => {
  const id = Date.now();
  const alpha = await request.post("/api/workspaces", { data: { title: `Alpha destination ${id}` } });
  const beta = await request.post("/api/workspaces", { data: { title: `Beta destination ${id}` } });
  expect(alpha.status()).toBe(201);
  expect(beta.status()).toBe(201);
  const first = await alpha.json() as { id: string };
  const second = await beta.json() as { id: string };
  const capture = await request.post("/api/captures", { data: { content: `Unorganized selection ${id}` } });
  expect(capture.status()).toBe(201);
  const item = await capture.json() as { id: string; version: number };
  try {
    await page.goto("/inbox");
    const row = page.getByText(`Unorganized selection ${id}`, { exact: true }).locator("..").locator("..");
    await row.getByRole("button", { name: "Organize", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Organize capture" });
    const select = dialog.getByRole("combobox", { name: /Workspace \(required\)/ });
    await select.selectOption(first.id);
    await expect(dialog.getByRole("button", { name: "Organize", exact: true })).toBeEnabled();
    await dialog.getByRole("searchbox", { name: "Find Workspace" }).fill(`Beta destination ${id}`);
    await expect(select).toHaveValue("");
    await expect(dialog.getByRole("button", { name: "Organize", exact: true })).toBeDisabled();
    await select.selectOption(second.id);
    await expect(dialog.getByRole("button", { name: "Organize", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();
  } finally {
    await request.delete(`/api/captures/${item.id}`, { headers: { "If-Match": `"${item.version}"` } }).catch(() => undefined);
    for (const workspaceId of [first.id, second.id]) {
      await deleteWorkspace(request, workspaceId).catch(() => undefined);
      await request.delete(`/api/trash/${workspaceId}`).catch(() => undefined);
    }
  }
});
