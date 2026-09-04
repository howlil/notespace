import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function create(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /New workspace/ }).first().click();
  const titleInput = page.getByRole("textbox", { name: "Workspace title" });
  await titleInput.fill(title);
  await titleInput.press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: title }).first().click();
  await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
  return page.url().split("/").at(-1)!;
}

async function waitSaved(page: Page) {
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
}

test("contextual note and Canvas references navigate both ways and survive reload", async ({
  page,
  request,
}) => {
  const id = await create(page, `Reference ${Date.now()}`);
  try {
    const editor = page.getByRole("textbox", { name: "Workspace document" });
    await editor.click();
    await editor.fill("Linked thought");
    await editor.click();
    await waitSaved(page);

    await page.getByRole("button", { name: "Send to Canvas", exact: true }).click();
    await waitSaved(page);
    await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();

    const read = async () =>
      (await (await request.get(`/api/projects/${id}`)).json()) as {
        document: { data: { content: Array<{ attrs?: { blockId?: string } }> } };
        references: Array<{ id: string; blockId: string; elementId: string }>;
      };
    const linked = await read();
    expect(linked.references).toHaveLength(1);

    const goToNote = page.getByRole("button", { name: "Go to linked note", exact: true });
    const goToCanvas = page.getByRole("button", { name: "Go to linked Canvas", exact: true });
    await expect(goToNote).toBeVisible();
    await expect(goToCanvas).toBeVisible();
    await goToCanvas.click();
    await goToNote.click();
    await expect(editor).toBeVisible();

    await editor.fill("Linked thought updated");
    await waitSaved(page);
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toContainText("Linked thought updated");
    expect((await read()).references).toEqual(linked.references);
  } finally {
    await request.delete(`/api/projects/${id}`);
  }
});
