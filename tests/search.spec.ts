import { expect, test } from "@playwright/test";

test("global search finds note content and navigates to exact context", async ({
  page,
  request,
}) => {
  const uniqueToken = `Token${Date.now()}`;
  const title = `Search Test ${uniqueToken}`;
  const res = await request.post("/api/workspaces", {
    data: { title },
  });
  expect(res.status()).toBe(201);
  const workspace = await res.json();

  try {
    const update = await request.patch(`/api/workspaces/${workspace.id}`, {
      data: {
        title,
        version: workspace.version,
        document: {
          format: "tiptap",
          version: 1,
          data: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                attrs: { blockId: `block-${uniqueToken}` },
                content: [{ type: "text", text: `Finding ${uniqueToken} inside note` }],
              },
            ],
          },
        },
        canvas: workspace.canvas,
        notes: [
          {
            id: `note-${uniqueToken}`,
            title: `Note ${uniqueToken}`,
            document: {
              format: "tiptap",
              version: 1,
              data: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    attrs: { blockId: `block-${uniqueToken}` },
                    content: [{ type: "text", text: `Finding ${uniqueToken} inside note` }],
                  },
                ],
              },
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        references: [],
        splitRatio: 0.5,
      },
    });
    expect(update.status()).toBe(200);

    await page.goto("/");
    const search = page.getByRole("textbox", { name: "Search Notespace" });
    await search.fill(uniqueToken);

    const result = page.locator(".search-result").first();
    await expect(result).toBeVisible();
    await result.click();

    await expect(page).toHaveURL(new RegExp(workspace.id));
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
  } finally {
    await request.delete(`/api/workspaces/${workspace.id}`);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
