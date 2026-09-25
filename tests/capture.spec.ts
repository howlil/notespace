import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("Quick Capture creates a durable Markdown note and remembers its target workspace", async ({ page, request }) => {
  const title = `Capture target ${Date.now()}`;
  const createdResponse = await request.post("/api/workspaces", { data: { title } });
  expect(createdResponse.status()).toBe(201);
  const workspace = await createdResponse.json() as { id: string; title: string };

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Quick capture" }).click();

    const dialog = page.getByRole("dialog", { name: "Quick capture" });
    await expect(dialog).toBeVisible();
    await dialog.locator("select").selectOption(workspace.id);
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

    await page.getByRole("button", { name: "Quick capture" }).click();
    const reopened = page.getByRole("dialog", { name: "Quick capture" });
    await expect(reopened).toBeVisible();
    await expect(reopened.locator("select")).toHaveValue(workspace.id);
  } finally {
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
