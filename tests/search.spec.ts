import { expect, test } from "@playwright/test";

test("global search finds note content and navigates to exact context", async ({
  page,
  request,
}) => {
  const uniqueToken = `Token${Date.now()}`;
  const title = `Search Test ${uniqueToken}`;
  const res = await request.post("/api/projects", {
    data: { title },
  });
  expect(res.status()).toBe(201);
  const workspace = await res.json();

  try {
    // Add unique note content via API
    await request.patch(`/api/projects/${workspace.id}`, {
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
        splitRatio: 0.5,
      },
    });

    // Go Home and search
    await page.goto("/");
    const search = page.getByRole("textbox", { name: "Search Notespace" });
    await search.fill(uniqueToken);

    // Wait for results
    const result = page.locator(".search-result").first();
    await expect(result).toBeVisible();
    await result.click();

    // Verify exact context rendered
    await expect(page).toHaveURL(new RegExp(workspace.id));
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
  } finally {
    await request.delete(`/api/projects/${workspace.id}`);
  }
});
