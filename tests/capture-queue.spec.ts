import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("@critical Legacy Captures remain editable but cannot be created from the Queue UI", async ({ page, request }) => {
  const content = `Legacy capture edit ${Date.now()}`;
  const response = await request.post("/api/captures", { data: { content } });
  expect(response.status()).toBe(201);
  const created = await response.json() as { id: string };
  try {
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "Capture Queue" })).toBeVisible();
    await expect(page.getByText(content, { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Capture an unorganized thought" })).toHaveCount(0);
    await expect(page.getByText("Legacy Capture recovery.")).toBeVisible();
    await page.getByRole("button", { name: `Edit capture ${created.id}` }).click();
    const dialog = page.getByRole("dialog", { name: "Edit capture" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: "Captured content" }).fill(content + " revised");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(content + " revised", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(content + " revised", { exact: true })).toBeVisible();
  } finally {
    const result = await request.get(`/api/captures/${created.id}`);
    if (result.ok()) {
      const item = await result.json() as { version: number; status: string };
      if (item.status === "pending") await request.delete(`/api/captures/${created.id}`, { headers: { "If-Match": `"${item.version}"` } });
    }
  }
});

test("Legacy Capture API still surfaces pending entries through the existing Queue deep link", async ({ page, request }) => {
  const content = `Historical capture ${Date.now()}`;
  const created = await request.post("/api/captures", { data: { content } });
  expect(created.status()).toBe(201);
  const item = await created.json() as { id: string; version: number };
  try {
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "Capture Queue" })).toBeVisible();
    await expect(page.getByText(content, { exact: true })).toBeVisible();
    const pending = await (await request.get("/api/captures")).json() as Array<{ id: string; content: string }>;
    expect(pending.some((capture) => capture.id === item.id && capture.content === content)).toBe(true);
  } finally {
    const current = await request.get(`/api/captures/${item.id}`);
    if (current.ok()) {
      const capture = await current.json() as { version: number; status: string };
      if (capture.status === "pending") await request.delete(`/api/captures/${item.id}`, { headers: { "If-Match": `"${capture.version}"` } });
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

test("@critical Capture edit reconciles a committed PATCH with a lost response", async ({ page, request }) => {
  const content = `Capture edit lost response ${Date.now()}`;
  const created = await request.post("/api/captures", { data: { content } });
  expect(created.status()).toBe(201);
  const capture = await created.json() as { id: string; version: number };
  const draft = content + " revised";
  let commits = 0;
  const routePattern = `**/api/captures/${capture.id}`;
  await page.route(routePattern, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    // Let the real server commit, then conceal the successful response from the UI.
    const result = await route.fetch();
    expect(result.status()).toBe(200);
    commits++;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Response unavailable" }) });
  });
  try {
    await page.goto("/inbox");
    await page.getByRole("button", { name: `Edit capture ${capture.id}` }).click();
    const dialog = page.getByRole("dialog", { name: "Edit capture" });
    await dialog.getByRole("textbox", { name: "Captured content" }).fill(draft);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(draft, { exact: true })).toBeVisible();
    expect(commits).toBe(1);
    const receipt = await (await request.get(`/api/captures/${capture.id}`)).json() as { content: string; version: number };
    expect(receipt).toMatchObject({ content: draft, version: capture.version + 1 });
  } finally {
    await page.unroute(routePattern);
    const existing = await request.get(`/api/captures/${capture.id}`);
    if (existing.ok()) {
      const latest = await existing.json() as { version: number; status: string };
      if (latest.status === "pending") await request.delete(`/api/captures/${capture.id}`, {
        headers: { "If-Match": `"${latest.version}"` },
      }).catch(() => undefined);
    }
  }
});

test("@critical Capture edit conflict preserves draft and requires explicit overwrite", async ({ page, request }) => {
  const label = `Capture conflict ${Date.now()}`;
  const created = await request.post("/api/captures", { data: { content: label } });
  expect(created.status()).toBe(201);
  const capture = await created.json() as { id: string; version: number };
  const localDraft = `${label} local draft`;
  const remoteChange = `${label} remote change`;
  try {
    await page.goto("/inbox");
    await page.getByRole("button", { name: `Edit capture ${capture.id}` }).click();
    const dialog = page.getByRole("dialog", { name: "Edit capture" });
    const field = dialog.getByRole("textbox", { name: "Captured content" });
    await field.fill(localDraft);
    const concurrent = await request.patch(`/api/captures/${capture.id}`, {
      data: { version: capture.version, content: remoteChange },
    });
    expect(concurrent.ok()).toBe(true);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog.getByRole("alert")).toContainText("changed in another session");
    await expect(field).toHaveValue(localDraft);
    await expect(dialog.getByText(`Latest saved: ${remoteChange}`)).toBeVisible();
    const beforeOverwrite = await (await request.get(`/api/captures/${capture.id}`)).json() as { content: string };
    expect(beforeOverwrite.content).toBe(remoteChange);

    await dialog.getByRole("button", { name: "Overwrite latest" }).click();
    await expect(dialog).toHaveCount(0);
    const saved = await (await request.get(`/api/captures/${capture.id}`)).json() as { content: string };
    expect(saved.content).toBe(localDraft);
  } finally {
    const current = await request.get(`/api/captures/${capture.id}`);
    if (current.ok()) {
      const item = await current.json() as { version: number; status: string };
      if (item.status === "pending") await request.delete(`/api/captures/${capture.id}`, {
        headers: { "If-Match": `"${item.version}"` },
      });
    }
  }
});

test("@critical Legacy Capture view ignores stale initial GET after external update", async ({ page, request }) => {
  const stamp = Date.now();
  const first = await request.post("/api/captures", { data: { content: `Old capture ${stamp}` } });
  expect(first.status()).toBe(201);
  const old = await first.json() as { id: string };
  const newer = `External capture ${stamp}`;
  let externalId = "";
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let reads = 0;
  await page.route("**/api/captures", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    reads++;
    if (reads === 1) {
      await pending;
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([{ id: old.id, content: `Old capture ${stamp}`, version: 1, status: "pending", createdAt: new Date().toISOString() }]),
      });
      return;
    }
    await route.continue();
  });
  try {
    await page.goto("/inbox");
    await expect(page.getByRole("status").filter({ hasText: "Loading Capture Queue" })).toBeVisible();
    const response = await request.post("/api/captures", { data: { content: newer } });
    expect(response.status()).toBe(201);
    externalId = (await response.json() as { id: string }).id;
    await page.evaluate(() => window.dispatchEvent(new Event("notespace:capture-queue-changed")));
    await expect(page.getByText(newer, { exact: true })).toBeVisible();
    release();
    await expect(page.getByText(newer, { exact: true })).toBeVisible();
    expect(reads).toBeGreaterThanOrEqual(2);
  } finally {
    release();
    for (const id of [old.id, externalId].filter(Boolean)) {
      const response = await request.get(`/api/captures/${id}`);
      if (!response.ok()) continue;
      const item = await response.json() as { status: string; version: number };
      if (item.status === "pending") await request.delete(`/api/captures/${id}`, { headers: { "If-Match": `"${item.version}"` } }).catch(() => undefined);
    }
  }
});

test("@critical Capture organize does not confirm a later-version conversion as its own lost response", async ({ page, request }) => {
  const stamp = Date.now();
  const created = await request.post("/api/workspaces", { data: { title: `Capture receipt owner ${stamp}` } });
  expect(created.status()).toBe(201);
  const workspace = await created.json() as { id: string };
  const content = `Capture receipt race ${stamp}`;
  const saved = await request.post("/api/captures", { data: { content } });
  expect(saved.status()).toBe(201);
  const capture = await saved.json() as { id: string; version: number };
  try {
    await page.goto("/inbox");
    const row = page.getByText(content, { exact: true }).locator("..").locator("..");
    await row.getByRole("button", { name: "Organize", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Organize capture" });
    await dialog.getByRole("combobox", { name: "Save as" }).selectOption("task");
    await dialog.getByRole("combobox", { name: /Workspace \(required\)/ }).selectOption(workspace.id);

    // Another client edits v1 to v2, then converts v2 to v3 using the
    // same destination and kind. A v1 submit must never claim that receipt.
    const remoteEdit = await request.patch(`/api/captures/${capture.id}`, {
      data: { version: capture.version, content: content + " remotely edited" },
    });
    expect(remoteEdit.status()).toBe(200);
    const updated = await remoteEdit.json() as { version: number };
    const remoteConvert = await request.post(`/api/captures/${capture.id}/organize`, {
      data: { version: updated.version, workspaceId: workspace.id, kind: "task" },
    });
    expect(remoteConvert.status()).toBe(200);
    const converted = await remoteConvert.json() as { version: number; targetId: string };
    expect(converted.version).toBe(capture.version + 2);

    await dialog.getByRole("button", { name: "Organize", exact: true }).click();
    await expect(page.getByText("Capture was organized elsewhere. Queue refreshed.")).toBeVisible();
    await expect(page.getByText("Capture already organized. No duplicate was created.")).toHaveCount(0);
    const current = await (await request.get(`/api/captures/${capture.id}`)).json() as { targetId: string };
    expect(current.targetId).toBe(converted.targetId);
    const plan = await (await request.get(`/api/workspaces/${workspace.id}/plan`)).json() as { tasks: Array<{ id: string }> };
    expect(plan.tasks.filter((task) => task.id === converted.targetId)).toHaveLength(1);
  } finally {
    await deleteWorkspace(request, workspace.id).catch(() => undefined);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});

test("Capture deletion keeps its confirmation when both DELETE and verification GET fail", async ({ page, request }) => {
  const content = `Capture deletion uncertainty ${Date.now()}`;
  const res = await request.post("/api/captures", { data: { content } });
  expect(res.status()).toBe(201);
  const capture = await res.json() as { id: string; version: number };
  try {
    await page.goto("/inbox");
    await expect(page.getByText(content, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Delete capture ${capture.id}` }).click();
    const confirm = page.getByRole("dialog", { name: "Delete capture?" });
    await expect(confirm).toBeVisible();

    await page.route(`**/api/captures/${capture.id}`, async (route) => {
      if (route.request().method() === "GET" || route.request().method() === "DELETE") {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Service unavailable" }) });
        return;
      }
      await route.continue();
    });
    await confirm.getByRole("button", { name: "Delete capture" }).click();
    await expect(page.getByText("Deletion status could not be verified. Refresh the queue before retrying.")).toBeVisible();
    await expect(confirm).toBeVisible();
    await expect(page.getByText(content, { exact: true })).toBeVisible();
    const current = await request.get(`/api/captures/${capture.id}`);
    expect(current.status()).toBe(200);
    const item = await current.json() as { status: string };
    expect(item.status).toBe("pending");
  } finally {
    await page.unroute(`**/api/captures/${capture.id}`);
    await request.delete(`/api/captures/${capture.id}`, {
      headers: { "If-Match": `"${capture.version}"` },
    }).catch(() => undefined);
  }
});
