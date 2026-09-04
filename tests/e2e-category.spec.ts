import { expect, test } from "@playwright/test";

test.describe("Category Workflows", () => {
  test("category: create category via sidebar inline form", async ({
    page,
    request,
  }) => {
    let createdCategoryId: string | undefined;

    try {
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Knowledge, organized." }),
      ).toBeVisible();

      // Click the '+' button in sidebar LIBRARY section to start inline creation
      await page.getByRole("button", { name: "New category" }).click();

      // Fill the inline category name input and submit
      const input = page.getByRole("textbox", { name: "Category title" });
      await input.fill("Physics");
      await page.getByRole("button", { name: "Create category" }).click();

      // Verify 'Physics' appears in sidebar
      await expect(
        page.getByRole("button", { name: /Physics/ }).first(),
      ).toBeVisible();
      await page.screenshot({
        path: "test-results/category-created.png",
        fullPage: true,
      });

      // Find the ID via API
      const response = await request.get("/api/categories");
      const categories = await response.json();
      const physics = categories.find(
        (c: { title: string }) => c.title === "Physics",
      );
      if (physics) createdCategoryId = physics.id;
    } finally {
      if (createdCategoryId) {
        await request.delete(`/api/categories/${createdCategoryId}`);
      }
    }
  });

  test("category: detail view shows category workspaces", async ({
    page,
    request,
  }) => {
    let categoryId: string | undefined;
    const workspaceIds: string[] = [];

    try {
      // Create category via API
      const catRes = await request.post("/api/categories", {
        data: { title: "Mathematics" },
      });
      const cat = await catRes.json();
      categoryId = cat.id;

      // Create 3 workspaces in that category
      for (let i = 1; i <= 3; i++) {
        const wsRes = await request.post("/api/projects", {
          data: { title: `Math Workspace ${i}`, categoryId },
        });
        const ws = await wsRes.json();
        workspaceIds.push(ws.id);
      }

      // Navigate to category view
      await page.goto(`/categories/${categoryId}`);
      await expect(
        page.getByRole("heading", { name: "Mathematics" }),
      ).toBeVisible();

      // Verify all 3 workspaces are listed
      await expect(
        page.getByRole("link", { name: /Math Workspace 1/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Math Workspace 2/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Math Workspace 3/ }),
      ).toBeVisible();

      await page.screenshot({
        path: "test-results/category-detail.png",
        fullPage: true,
      });
    } finally {
      for (const id of workspaceIds) {
        await request.delete(`/api/projects/${id}`);
      }
      if (categoryId) {
        await request.delete(`/api/categories/${categoryId}`);
      }
    }
  });

  test("category: workspace move between categories via API", async ({
    page,
    request,
  }) => {
    let catAId: string | undefined;
    let catBId: string | undefined;
    let wsId: string | undefined;

    try {
      const catARes = await request.post("/api/categories", {
        data: { title: "Category A" },
      });
      catAId = (await catARes.json()).id;

      const catBRes = await request.post("/api/categories", {
        data: { title: "Category B" },
      });
      catBId = (await catBRes.json()).id;

      const wsRes = await request.post("/api/projects", {
        data: { title: "Moving Workspace", categoryId: catAId },
      });
      wsId = (await wsRes.json()).id;

      // Move workspace to category B via API
      await request.patch(`/api/projects/${wsId}/category`, {
        data: { categoryId: catBId },
      });

      // Verify workspace appears in category B
      await page.goto(`/categories/${catBId}`);
      await expect(page.getByText("Moving Workspace")).toBeVisible();

      // Verify workspace is NOT in category A
      await page.goto(`/categories/${catAId}`);
      await expect(page.getByText("Moving Workspace")).not.toBeVisible();
    } finally {
      if (wsId) await request.delete(`/api/projects/${wsId}`);
      if (catAId) await request.delete(`/api/categories/${catAId}`);
      if (catBId) await request.delete(`/api/categories/${catBId}`);
    }
  });

  test("category: non-empty category cannot be deleted (409)", async ({
    request,
  }) => {
    let categoryId: string | undefined;
    let wsId: string | undefined;

    try {
      const catRes = await request.post("/api/categories", {
        data: { title: "Non-empty Category" },
      });
      categoryId = (await catRes.json()).id;

      const wsRes = await request.post("/api/projects", {
        data: { title: "Blocker Workspace", categoryId },
      });
      wsId = (await wsRes.json()).id;

      // Attempt to delete non-empty category → should be 409
      const delRes = await request.delete(`/api/categories/${categoryId}`);
      expect(delRes.status()).toBe(409);

      // Delete workspace first, then category succeeds
      await request.delete(`/api/projects/${wsId}`);
      wsId = undefined;

      const delRes2 = await request.delete(`/api/categories/${categoryId}`);
      expect(delRes2.status()).toBe(204);
      categoryId = undefined;
    } finally {
      if (wsId) await request.delete(`/api/projects/${wsId}`);
      if (categoryId) await request.delete(`/api/categories/${categoryId}`);
    }
  });

  test("category: workspace count is accurate", async ({
    page,
    request,
  }) => {
    let categoryId: string | undefined;
    const workspaceIds: string[] = [];

    try {
      const catRes = await request.post("/api/categories", {
        data: { title: "Count Category" },
      });
      categoryId = (await catRes.json()).id;

      for (let i = 1; i <= 5; i++) {
        const wsRes = await request.post("/api/projects", {
          data: { title: `Count WS ${i}`, categoryId },
        });
        workspaceIds.push((await wsRes.json()).id);
      }

      // Verify via API
      const catListRes = await request.get("/api/categories");
      const categories = await catListRes.json();
      const cat = categories.find(
        (c: { id: string }) => c.id === categoryId,
      );
      expect(cat.workspaceCount).toBe(5);

      // Verify on category detail page
      await page.goto(`/categories/${categoryId}`);
      await expect(
        page.getByRole("heading", { name: "Count Category" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Count WS 1/ }),
      ).toBeVisible();

      await page.screenshot({
        path: "test-results/category-workspace-count.png",
        fullPage: true,
      });
    } finally {
      for (const id of workspaceIds) {
        await request.delete(`/api/projects/${id}`);
      }
      if (categoryId) {
        await request.delete(`/api/categories/${categoryId}`);
      }
    }
  });
});
