import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function create(page: Page, title: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New project", exact: true })
    .last()
    .click();
  await page.getByRole("textbox", { name: "Project title" }).fill(title);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Project document" }),
  ).toBeVisible();
  return page.url().split("/").at(-1)!;
}

async function waitSaved(page: Page) {
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
}

test("references navigate both ways, survive edits and switching, and expose orphans", async ({
  page,
  request,
}) => {
  const title = `Reference ${Date.now()}`;
  const id = await create(page, title);
  let second = "";
  try {
    const editor = page.getByRole("textbox", { name: "Project document" });
    await editor.fill("Linked thought");
    await waitSaved(page);

    await page.getByTestId("toolbar-rectangle").locator("..").click();
    const bounds = await page
      .locator(".excalidraw__canvas.interactive")
      .boundingBox();
    if (!bounds) throw new Error("Canvas did not render");
    const x = bounds.x + 230;
    const y = bounds.y + 180;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 150, y + 80, { steps: 8 });
    await page.mouse.up();
    await page.getByTestId("toolbar-selection").locator("..").click();
    await page.mouse.click(x + 70, y + 40);

    const link = page.getByRole("button", { name: "Link selections" });
    await expect(link).toBeEnabled();
    await link.click();
    await waitSaved(page);

    const read = async () =>
      (await (await request.get(`/api/projects/${id}`)).json()) as {
        version: number;
        document: { data: { content: Array<{ attrs?: { blockId?: string } }> } };
        canvas: {
          data: {
            elements: Array<{ id: string; type: string; isDeleted?: boolean }>;
          };
        };
        references: Array<{ id: string; blockId: string; elementId: string }>;
      };
    const linked = await read();
    expect(linked.references).toHaveLength(1);
    const reference = linked.references[0];
    expect(reference.blockId).toBe(linked.document.data.content[0].attrs?.blockId);
    expect(reference.elementId).toBe(
      linked.canvas.data.elements.find(
        (element) => element.type === "rectangle" && !element.isDeleted,
      )?.id,
    );

    const goToNote = page.getByRole("button", {
      name: "Go to linked document block",
    });
    const goToCanvas = page.getByRole("button", {
      name: "Go to linked canvas object",
    });
    await expect(goToNote).toBeVisible();
    await goToNote.click();
    await expect(editor).toBeFocused();

    await editor.press("End");
    await editor.pressSequentially(" updated");
    await waitSaved(page);
    expect((await read()).references[0]).toEqual(reference);

    await page.getByTestId("toolbar-selection").locator("..").click();
    await page.mouse.click(bounds.x + 20, bounds.y + 20);
    await expect(goToNote).toHaveCount(0);
    await expect(goToCanvas).toBeVisible();
    await goToCanvas.click();
    await expect(goToNote).toBeVisible();

    await page.reload();
    await expect(editor).toContainText("Linked thought updated");
    await editor.click();
    await expect(goToCanvas).toBeVisible();

    await page
      .getByRole("link", { name: "Back to projects", exact: true })
      .click();
    second = await create(page, `Other ${Date.now()}`);
    await page
      .getByRole("navigation", { name: "Recent projects" })
      .getByRole("link", { name: title, exact: true })
      .click();
    await expect(editor).toContainText("Linked thought updated");
    await editor.click();
    await expect(goToCanvas).toBeVisible();

    await goToCanvas.click();
    await expect(goToNote).toBeVisible();
    const restoredBounds = await page
      .locator(".excalidraw__canvas.interactive")
      .boundingBox();
    if (!restoredBounds) throw new Error("Canvas did not render after switching");
    await page.mouse.click(
      restoredBounds.x + restoredBounds.width / 2,
      restoredBounds.y + restoredBounds.height / 2,
    );
    await page.keyboard.press("Delete");
    await expect
      .poll(async () => {
        const project = await read();
        return project.canvas.data.elements.find(
          (element) => element.id === reference.elementId,
        )?.isDeleted;
      })
      .toBe(true);

    await editor.click();
    await goToCanvas.click();
    await expect(page.getByRole("alert")).toContainText(
      "Linked canvas object no longer exists",
    );
    expect((await read()).references).toEqual([reference]);

    await page
      .getByRole("button", { name: "Remove broken link", exact: true })
      .click();
    await waitSaved(page);
    await expect.poll(async () => (await read()).references.length).toBe(0);
    await page.reload();
    await editor.click();
    await expect(goToCanvas).toHaveCount(0);
  } finally {
    await request.delete(`/api/projects/${id}`);
    if (second) await request.delete(`/api/projects/${second}`);
  }
});
