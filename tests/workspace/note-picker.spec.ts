import { test, expect, createViaAPI, cleanupWorkspace } from "./fixtures";

test("@critical New Note creates a durable Canvas artifact and can be deleted without touching other Notes", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Note artifact ${Date.now()}`);
  try {
    await page.getByRole("button", { name: "New Note" }).click();
    const editor = page.getByRole("dialog", { name: "Note editor" });
    await expect(editor).toBeVisible();
    await editor.getByRole("textbox", { name: "Note title" }).fill("Database notes");
    await editor.getByRole("textbox", { name: "Note title" }).press("Enter");
    await editor.getByRole("textbox", { name: "Workspace document" }).fill("MVCC snapshots");
    await editor.getByRole("button", { name: "Done" }).click();
    await expect(editor).toHaveCount(0);

    let placedNoteId = "";
    await expect.poll(async () => {
      const response = await request.get(`/api/workspaces/${id}`);
      const value = await response.json() as {
        notes: Array<{ id: string; title: string }>;
        canvas: { data: { elements: Array<{ isDeleted?: boolean; customData?: { notespaceNoteArtifact?: { noteId: string } } }> } };
      };
      const created = value.notes.find((note) => note.title === "Database notes");
      placedNoteId = created?.id ?? "";
      return value.canvas.data.elements.filter((element) =>
        !element.isDeleted && element.customData?.notespaceNoteArtifact?.noteId === created?.id).length;
    }).toBe(1);

    await page.reload();
    await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
    await page.getByRole("combobox", { name: "Open an existing Note" }).selectOption(placedNoteId);
    await expect(editor.getByRole("textbox", { name: "Workspace document" })).toContainText("MVCC snapshots");
    await editor.getByRole("button", { name: "Delete Note", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Delete Note confirmation" });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Delete Note" }).click();
    await expect(editor).toHaveCount(0);
    await expect.poll(async () => {
      const response = await request.get(`/api/workspaces/${id}`);
      const value = await response.json() as { notes: Array<{ id: string }> };
      return value.notes.some((note) => note.id === placedNoteId);
    }).toBe(false);
  } finally {
    await cleanupWorkspace(request, id);
  }
});

test("@critical Note deep link opens the editor and Done clears the URL without losing content", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Note deep link ${Date.now()}`);
  try {
    const response = await request.get(`/api/workspaces/${id}`);
    const workspace = await response.json() as { notes: Array<{ id: string }> };
    const noteId = workspace.notes[0].id;
    await page.goto(`/workspaces/${id}?note=${noteId}`);
    const editor = page.getByRole("dialog", { name: "Note editor" });
    await expect(editor).toBeVisible();
    await editor.getByRole("textbox", { name: "Workspace document" }).fill("Deep link contents");
    await editor.getByRole("button", { name: "Done" }).click();
    await expect(editor).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has("note")).toBe(false);
    await page.reload();
    await expect(editor).toHaveCount(0);
    await page.getByRole("combobox", { name: "Open an existing Note" }).selectOption(noteId);
    await expect(editor.getByRole("textbox", { name: "Workspace document" })).toContainText("Deep link contents");
  } finally {
    await cleanupWorkspace(request, id);
  }
});
