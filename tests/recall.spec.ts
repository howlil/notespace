import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("Deliberate Recall hides source until reveal and never writes the response into the Note", async ({ page, request }) => {
  const createdResponse = await request.post("/api/workspaces", {
    data: { title: `Recall workspace ${Date.now()}` },
  });
  expect(createdResponse.status()).toBe(201);
  const workspace = await createdResponse.json() as { id: string };

  try {
    const loaded = await request.get(`/api/workspaces/${workspace.id}`);
    expect(loaded.ok()).toBe(true);
    const initial = await loaded.json() as {
      notes: Array<{ id: string; version: number }>;
    };
    const note = initial.notes[0];
    expect(note).toBeTruthy();

    const sourceText = "MVCC gives each transaction a consistent snapshot.";
    const updated = await request.patch(
      `/api/workspaces/${workspace.id}/notes/${note.id}`,
      {
        data: {
          title: "Recall source",
          document: {
            format: "tiptap",
            version: 1,
            data: {
              type: "doc",
              content: [{
                type: "paragraph",
                attrs: { blockId: "recall-source-block" },
                content: [{ type: "text", text: sourceText }],
              }],
            },
          },
          version: note.version,
        },
      },
    );
    expect(updated.ok()).toBe(true);

    await page.goto(`/workspaces/${workspace.id}`);
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
    await page.keyboard.press("Control+K");

    const quickOpen = page.getByRole("dialog", { name: "Quick Open" });
    await expect(quickOpen).toBeVisible();
    await quickOpen.getByRole("button", { name: "Recall · Recall source" }).click();

    const recallDialog = page.getByRole("dialog", { name: "Recall · Recall source" });
    await expect(recallDialog).toBeVisible();
    await expect(recallDialog.getByRole("region", { name: "Source note" })).toHaveCount(0);

    const responseText = "I remember that readers see a stable version.";
    await recallDialog.getByRole("textbox", { name: "From memory" }).fill(responseText);
    await recallDialog.getByRole("button", { name: "Reveal source" }).click();

    const source = recallDialog.getByRole("region", { name: "Source note" });
    await expect(source).toBeVisible();
    await expect(source).toContainText(sourceText);
    await recallDialog.getByRole("button", { name: "Done" }).click();
    await expect(recallDialog).toHaveCount(0);

    const afterResponse = await request.get(`/api/workspaces/${workspace.id}`);
    const after = await afterResponse.json() as { notes: Array<{ id: string; document: unknown }> };
    const durable = after.notes.find((candidate) => candidate.id === note.id);
    expect(JSON.stringify(durable?.document)).toContain(sourceText);
    expect(JSON.stringify(durable?.document)).not.toContain(responseText);
  } finally {
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
