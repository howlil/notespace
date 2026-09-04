import { expect, test } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";

// ---------------------------------------------------------------------------
// Inline helpers
// ---------------------------------------------------------------------------

async function createWorkspace(page: Page, title: string): Promise<string> {
  await page.goto("/");
  await page
    .getByRole("button", { name: /New workspace/ })
    .first()
    .click();
  const titleInput = page.getByRole("textbox", { name: "Workspace title" });
  await titleInput.fill(title);
  await titleInput.press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: title }).first().click();
  await expect(
    page.getByRole("textbox", { name: "Workspace document" }),
  ).toBeVisible();
  return page.url().split("/").at(-1)!;
}

async function waitSaved(page: Page) {
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Study Activity
// ---------------------------------------------------------------------------

test.describe("Study Activity", () => {
  test("study: session indicator appears in workspace header", async ({
    page,
    request,
  }) => {
    const id = await createWorkspace(page, `Study ${Date.now()}`);
    try {
      await expect(page.locator(".workspace-header")).toBeVisible();

      // Look for the study indicator
      const indicator = page.locator(".study-indicator, [data-study]").first();
      if (await indicator.isVisible()) {
        await indicator.click();
        await expect(page.getByText(/Today/i).first()).toBeVisible();
        await capture(page, "study-indicator-popover");
      }
    } finally {
      await request.delete(`/api/projects/${id}`);
    }
  });

  test("study: activity dashboard renders on home", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Knowledge, organized." }),
    ).toBeVisible();

    // The compact study dashboard heading on Home is "Learning activity"
    await expect(
      page.getByRole("heading", { name: "Learning activity" }),
    ).toBeVisible();
    await expect(
      page.locator(".heatmap"),
    ).toBeVisible();

    await capture(page, "study-dashboard");
  });

  test("study: heartbeat records and API responds", async ({ request }) => {
    let id = "";
    try {
      const createRes = await request.post("/api/projects", {
        data: { title: "Heartbeat Test" },
      });
      expect(createRes.ok()).toBeTruthy();
      const project = await createRes.json();
      id = project.id;

      const sessionId = `session-${Date.now()}`;
      const dateStr = today();

      const hbRes = await request.put(
        `/api/workspaces/${id}/study-sessions/${sessionId}`,
        {
          data: {
            activityDate: dateStr,
            activeSeconds: 120,
            finish: false,
          },
        },
      );
      expect(hbRes.ok()).toBeTruthy();

      const statsRes = await request.get(
        `/api/workspaces/${id}/study?date=${dateStr}`,
      );
      expect(statsRes.ok()).toBeTruthy();
      const stats = await statsRes.json();
      expect(stats.todaySeconds).toBeGreaterThanOrEqual(120);

      const activityRes = await request.get(
        `/api/study/activity?from=${dateStr}&to=${dateStr}`,
      );
      expect(activityRes.ok()).toBeTruthy();
      const activity = await activityRes.json();
      expect(activity.todaySeconds).toBeGreaterThanOrEqual(120);
    } finally {
      if (id) await request.delete(`/api/projects/${id}`);
    }
  });
});

// ---------------------------------------------------------------------------
// History & Checkpoint
// ---------------------------------------------------------------------------

test.describe("History & Checkpoint", () => {
  test("history: workspace has creation checkpoint via API", async ({
    request,
  }) => {
    let id = "";
    try {
      const createRes = await request.post("/api/projects", {
        data: { title: "API History Test" },
      });
      const project = await createRes.json();
      id = project.id;

      const historyRes = await request.get(`/api/projects/${id}/history`);
      expect(historyRes.ok()).toBeTruthy();
      const entries = await historyRes.json();
      expect(entries.length).toBeGreaterThanOrEqual(1);

      const snapRes = await request.get(
        `/api/projects/${id}/history/${entries[0].id}`,
      );
      expect(snapRes.ok()).toBeTruthy();
      const snapshot = await snapRes.json();
      expect(snapshot).toHaveProperty("document");
      expect(snapshot).toHaveProperty("canvas");
    } finally {
      if (id) await request.delete(`/api/projects/${id}`);
    }
  });

  test("history: drawer opens from workspace menu", async ({
    page,
    request,
  }) => {
    const id = await createWorkspace(page, `History ${Date.now()}`);
    try {
      const editor = page.getByRole("textbox", { name: "Workspace document" });
      await editor.click();
      await editor.fill("Content for history");
      await waitSaved(page);

      // Open workspace overflow menu
      await page.locator('summary[aria-label="Workspace actions"]').click();
      await page
        .getByRole("button", { name: "History", exact: true })
        .click();

      // Verify drawer opens with checkpoint(s)
      await expect(page.locator(".history-drawer")).toBeVisible();
      await capture(page, "history-drawer");
    } finally {
      await request.delete(`/api/projects/${id}`);
    }
  });

  test("history: restore brings back previous state via API", async ({
    request,
  }) => {
    let id = "";
    try {
      const createRes = await request.post("/api/projects", {
        data: { title: "Restore Test" },
      });
      const project = await createRes.json();
      id = project.id;

      const histRes = await request.get(`/api/projects/${id}/history`);
      const entries = await histRes.json();
      expect(entries.length).toBeGreaterThanOrEqual(1);
      const initialHistoryId = entries[0].id;

      const restoreRes = await request.post(
        `/api/projects/${id}/history/${initialHistoryId}/restore`,
      );
      expect(restoreRes.ok()).toBeTruthy();
      const restored = await restoreRes.json();
      expect(restored).toHaveProperty("document");
      expect(restored).toHaveProperty("version");
    } finally {
      if (id) await request.delete(`/api/projects/${id}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

test.describe("Export", () => {
  test("export: produces valid ZIP via API", async ({ request }) => {
    let id = "";
    try {
      const createRes = await request.post("/api/projects", {
        data: { title: "Export Test" },
      });
      const project = await createRes.json();
      id = project.id;

      const exportRes = await request.get(`/api/projects/${id}/export`);
      expect(exportRes.status()).toBe(200);

      const contentType = exportRes.headers()["content-type"];
      expect(contentType).toContain("application/zip");

      const contentDisp = exportRes.headers()["content-disposition"];
      expect(contentDisp).toContain("attachment");

      const body = await exportRes.body();
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]).toBe(0x50); // P
      expect(body[1]).toBe(0x4b); // K
    } finally {
      if (id) await request.delete(`/api/projects/${id}`);
    }
  });

  test("export: link accessible from workspace menu", async ({
    page,
    request,
  }) => {
    const id = await createWorkspace(page, `Export Menu ${Date.now()}`);
    try {
      await page.locator('summary[aria-label="Workspace actions"]').click();

      const exportLink = page.getByRole("link", { name: "Export", exact: true });
      await expect(exportLink).toBeVisible();

      await capture(page, "export-menu-visible");
    } finally {
      await request.delete(`/api/projects/${id}`);
    }
  });
});
