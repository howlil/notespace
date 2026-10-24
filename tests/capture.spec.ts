import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("Quick Capture creates a durable Markdown note and remembers its target workspace", async ({ page, request }) => {
  const title = `Capture target ${Date.now()}`;
  const createdResponse = await request.post("/api/workspaces", { data: { title } });
  expect(createdResponse.status()).toBe(201);
  const workspace = await createdResponse.json() as { id: string; title: string };

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByRole("menuitem", { name: "Quick capture" }).click();

    const dialog = page.getByRole("dialog", { name: "Quick capture" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox", { name: "Capture Workspace" }).selectOption(workspace.id);
    await dialog.getByRole("textbox", { name: "Note" }).fill(
      "## MVCC in PostgreSQL\n\nSnapshots keep readers isolated from concurrent writers.",
    );
    await dialog.getByRole("button", { name: "Capture", exact: true }).click();

    await expect(page.getByText(`Captured to ${workspace.title}.`, { exact: true })).toBeVisible();

    await expect.poll(async () => {
      const response = await request.get(`/api/workspaces/${workspace.id}`);
      if (!response.ok()) return null;
      const current = await response.json() as {
        notes: Array<{ title: string; document: unknown }>;
      };
      return current.notes.find((note) => note.title === "MVCC in PostgreSQL") ?? null;
    }).not.toBeNull();

    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByRole("menuitem", { name: "Quick capture" }).click();
    const reopened = page.getByRole("dialog", { name: "Quick capture" });
    await expect(reopened).toBeVisible();
    await expect(reopened.getByRole("combobox", { name: "Capture Workspace" })).toHaveValue(workspace.id);
  } finally {
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});

test("Queue size limit does not restrict direct Workspace Quick Capture", async ({ page, request }) => {
  const created = await request.post("/api/workspaces", { data: { title: `Capture validation ${Date.now()}` } });
  expect(created.status()).toBe(201);
  const workspace = await created.json() as { id: string };
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByRole("menuitem", { name: "Quick capture" }).click();
    const dialog = page.getByRole("dialog", { name: "Quick capture" });
    await dialog.getByRole("combobox", { name: "Capture Workspace" }).selectOption(workspace.id);
    await dialog.getByRole("textbox", { name: "Note" }).fill("a".repeat(65537));
    await expect(dialog.getByRole("button", { name: "Capture", exact: true })).toBeEnabled();
    await dialog.getByRole("combobox", { name: "Destination" }).selectOption("queue");
    await expect(dialog.getByRole("button", { name: "Save to Queue" })).toBeDisabled();
    await expect(dialog.getByText("Content must fit within 64 KiB.")).toBeVisible();
    await dialog.getByRole("combobox", { name: "Destination" }).selectOption("workspace");
    await expect(dialog.getByRole("button", { name: "Capture", exact: true })).toBeEnabled();
  } finally {
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
