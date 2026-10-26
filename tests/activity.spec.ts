import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

type ActivitySessionRecord = {
  id: string;
  title: string;
  activityType: string;
  workspaceId?: string;
  taskId?: string;
  endedAt?: string | null;
  activeSeconds?: number;
};

function localDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function createActivityWorkspace(request: APIRequestContext) {
  const response = await request.post("/api/workspaces", { data: { title: `Activity context ${Date.now()}` } });
  expect(response.status()).toBe(201);
  return await response.json() as { id: string };
}
async function chooseActivityWorkspace(page: Page, workspaceId: string) {
  await page.getByRole("combobox", { name: "Activity Workspace" }).selectOption(workspaceId);
}

test("Activity starts in a Workspace or from a Workspace Task with context preserved", async ({ page, request }) => {
  const date = localDateKey();
  const suffix = Date.now();
  const workspaceResponse = await request.post("/api/workspaces", {
    data: { title: `Activity workspace ${suffix}` },
  });
  expect(workspaceResponse.status()).toBe(201);
  const workspace = await workspaceResponse.json();

  const taskResponse = await request.post(`/api/workspaces/${workspace.id}/tasks`, {
    data: { title: `Ship activity slice ${suffix}` },
  });
  expect(taskResponse.status()).toBe(201);
  const task = await taskResponse.json();

  const plannedResponse = await request.patch(
    `/api/workspaces/${workspace.id}/tasks/${task.id}`,
    { data: { plannedFor: date, version: task.version } },
  );
  expect(plannedResponse.status()).toBe(200);
  const plannedTask = await plannedResponse.json() as { version: number };

  const standaloneTitle = `Read systems paper ${suffix}`;

  try {
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();

    const quickActivity = page.getByRole("textbox", { name: "Quick activity" });
    const activityType = page.getByRole("combobox", { name: "Activity type" });
    await expect(quickActivity).toBeVisible();

    await quickActivity.fill(standaloneTitle);
    await chooseActivityWorkspace(page, workspace.id);
    await activityType.selectOption("read");
    await page.getByRole("button", { name: "Start", exact: true }).click();

    await expect(page.getByText(standaloneTitle, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause activity" })).toBeVisible();
    await page.getByRole("button", { name: "End activity" }).click();
    await expect(quickActivity).toBeVisible();
    await expect(page.getByRole("status", { name: "Task completion handoff" })).toHaveCount(0);

    await expect.poll(async () => {
      const response = await request.get("/api/activity/sessions?limit=20");
      if (!response.ok()) return null;
      const sessions = await response.json();
      const session = (sessions as ActivitySessionRecord[]).find((item) => item.title === standaloneTitle);
      if (!session) return null;
      return {
        title: session.title,
        activityType: session.activityType,
        workspaceId: session.workspaceId ?? "",
        taskId: session.taskId ?? "",
      };
    }).toEqual({
      title: standaloneTitle,
      activityType: "read",
      workspaceId: workspace.id,
      taskId: "",
    });

    await expect(activityType).toHaveValue("read");
    await page.getByRole("button", { name: `Start activity for ${task.title}` }).click();
    const taskActivityMenu = page.getByRole("menu", { name: "Choose activity type" });
    await expect(taskActivityMenu).toBeVisible();
    await taskActivityMenu.getByRole("menuitem", { name: "Build" }).click();

    await expect(page.getByText(task.title, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "End activity" })).toBeVisible();

    const renamedTaskTitle = `Ship refreshed activity slice ${suffix}`;
    const renameResponse = await request.patch(`/api/tasks/${task.id}`, {
      data: { title: renamedTaskTitle, version: plannedTask.version },
    });
    expect(renameResponse.status()).toBe(200);

    await page.getByRole("button", { name: "End activity" }).click();

    const handoff = page.getByRole("status", { name: "Task completion handoff" });
    await expect(handoff).toContainText(renamedTaskTitle);
    await expect(handoff).toContainText("Mark task done?");
    await expect(quickActivity).toBeEnabled();
    await expect(page.getByRole("button", { name: `Start activity for ${renamedTaskTitle}` })).toBeEnabled();

    await page.reload();
    await expect(page.getByRole("status", { name: "Task completion handoff" })).toContainText(renamedTaskTitle);
    await expect(quickActivity).toBeEnabled();

    const completionUrl = `**/api/tasks/${task.id}`;
    await page.route(completionUrl, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic response failure after commit" }),
      });
    });

    await handoff.getByRole("button", { name: "Mark done" }).click();
    await expect(page.getByRole("button", { name: `Mark ${renamedTaskTitle} incomplete` })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.unroute(completionUrl);
    await expect(handoff).toHaveCount(0);
    await expect(quickActivity).toBeEnabled();

    await expect.poll(async () => {
      const response = await request.get("/api/activity/sessions?limit=20");
      if (!response.ok()) return null;
      const sessions = await response.json();
      return (sessions as ActivitySessionRecord[]).find((session) => session.taskId === task.id) ?? null;
    }).toMatchObject({
      title: task.title,
      activityType: "build",
      workspaceId: workspace.id,
      taskId: task.id,
    });
  } finally {
    const sessionsResponse = await request.get("/api/activity/sessions?limit=100");
    if (sessionsResponse.ok()) {
      const sessions = await sessionsResponse.json();
      for (const session of sessions) {
        if (
          session.title === standaloneTitle
          || session.taskId === task.id
        ) {
          await request.delete(`/api/activity/sessions/${session.id}`).catch(() => undefined);
        }
      }
    }
    await deleteWorkspace(request, workspace.id).catch(() => undefined);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});


test("activity End retries after the final heartbeat fails before server commit", async ({ page, request }) => {
  const workspace = await createActivityWorkspace(request);
  const suffix = Date.now();
  const title = `Recover uncommitted activity ${suffix}`;
  const heartbeatUrl = "**/api/activity/sessions/*";

  try {
    await page.goto("/today");
    const input = page.getByRole("textbox", { name: "Quick activity" });
    await input.fill(title);
    await chooseActivityWorkspace(page, workspace.id);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("status", { name: "Active activity" })).toContainText(title);

    await page.route(heartbeatUrl, async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as { finish?: boolean };
      if (!body.finish) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic final heartbeat failure before commit" }),
      });
    });

    await page.getByRole("button", { name: "End activity" }).click();
    await expect(page.getByRole("status", { name: "Activity sync" })).toBeVisible();
    await page.unroute(heartbeatUrl);

    await page.reload();
    await expect.poll(async () => {
      const response = await request.get("/api/activity/sessions?limit=100");
      if (!response.ok()) return null;
      const sessions = await response.json() as ActivitySessionRecord[];
      const session = sessions.find((item) => item.title === title);
      return session?.endedAt ?? null;
    }).not.toBeNull();
    await expect(page.getByRole("status", { name: "Activity sync" })).toHaveCount(0);
  } finally {
    await deleteWorkspace(request, workspace.id).catch(() => undefined);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
    await page.unroute(heartbeatUrl).catch(() => undefined);
    const response = await request.get("/api/activity/sessions?limit=100");
    if (response.ok()) {
      const sessions = await response.json() as ActivitySessionRecord[];
      for (const session of sessions) {
        if (session.title === title) {
          await request.delete(`/api/activity/sessions/${session.id}`).catch(() => undefined);
        }
      }
    }
  }
});

test("@critical activity End reconciles when server commits but the response is lost", async ({ page, request }) => {
  const workspace = await createActivityWorkspace(request);
  const suffix = Date.now();
  const title = `Recover committed activity ${suffix}`;
  const heartbeatUrl = "**/api/activity/sessions/*";

  try {
    await page.goto("/today");
    const input = page.getByRole("textbox", { name: "Quick activity" });
    await input.fill(title);
    await chooseActivityWorkspace(page, workspace.id);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("status", { name: "Active activity" })).toContainText(title);

    // Intercept the browser's final PUT, commit its exact body through the
    // real HTTP API, and only then return 503 to the browser. This proves
    // durable server commit plus lost client response without the route.fetch()
    // interception race seen in the full Playwright suite.
    // Wait until the synthetic response has been sent before unroute/reload.
    let resolveResponseLost!: () => void;
    let rejectResponseLost!: (reason?: unknown) => void;
    const responseLost = new Promise<void>((resolve, reject) => {
      resolveResponseLost = resolve;
      rejectResponseLost = reject;
    });
    await page.route(heartbeatUrl, async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as { finish?: boolean };
      if (!body.finish) {
        await route.continue();
        return;
      }
      try {
        const committed = await request.put(route.request().url(), {
          data: body,
        });
        expect(committed.status()).toBe(200);
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Synthetic response loss after final heartbeat commit" }),
        });
        resolveResponseLost();
      } catch (error) {
        rejectResponseLost(error);
        throw error;
      }
    });

    await page.getByRole("button", { name: "End activity" }).click();
    await responseLost;
    await expect(page.getByRole("status", { name: "Activity sync" })).toBeVisible();

    await expect.poll(async () => {
      const response = await request.get("/api/activity/sessions?limit=100");
      if (!response.ok()) return null;
      const sessions = await response.json() as ActivitySessionRecord[];
      return sessions.find((item) => item.title === title)?.endedAt ?? null;
    }).not.toBeNull();

    await page.unroute(heartbeatUrl);
    await page.reload();
    await expect(page.getByRole("status", { name: "Activity sync" })).toHaveCount(0);

    await expect.poll(async () => {
      const response = await request.get("/api/activity/sessions?limit=100");
      if (!response.ok()) return -1;
      const sessions = await response.json() as ActivitySessionRecord[];
      return sessions.filter((item) => item.title === title && item.endedAt).length;
    }).toBe(1);
  } finally {
    await deleteWorkspace(request, workspace.id).catch(() => undefined);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
    await page.unroute(heartbeatUrl).catch(() => undefined);
    const response = await request.get("/api/activity/sessions?limit=100");
    if (response.ok()) {
      const sessions = await response.json() as ActivitySessionRecord[];
      for (const session of sessions) {
        if (session.title === title) {
          await request.delete(`/api/activity/sessions/${session.id}`).catch(() => undefined);
        }
      }
    }
  }
});


test("blocked tab can retry the global activity lease after the owner ends", async ({ page, context, request }) => {
  const workspace = await createActivityWorkspace(request);
  const suffix = Date.now();
  const firstTitle = `Owner activity ${suffix}`;
  const secondTitle = `Retry activity ${suffix}`;
  const secondPage = await context.newPage();

  try {
    await page.goto("/today");
    const firstInput = page.getByRole("textbox", { name: "Quick activity" });
    await firstInput.fill(firstTitle);
    await chooseActivityWorkspace(page, workspace.id);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText(firstTitle, { exact: true })).toBeVisible();

    await secondPage.goto("/today");
    const secondInput = secondPage.getByRole("textbox", { name: "Quick activity" });
    await expect(secondInput).toBeEnabled();

    await page.getByRole("button", { name: "End activity" }).click();
    await expect(firstInput).toBeVisible();

    await secondInput.fill(secondTitle);
    await chooseActivityWorkspace(secondPage, workspace.id);
    await secondPage.getByRole("button", { name: "Start", exact: true }).click();
    await expect(secondPage.getByText(secondTitle, { exact: true })).toBeVisible();
    await secondPage.getByRole("button", { name: "End activity" }).click();

    await expect.poll(async () => {
      const response = await request.get("/api/activity/sessions?limit=100");
      if (!response.ok()) return false;
      const sessions = await response.json() as ActivitySessionRecord[];
      return sessions.some((session) => session.title === secondTitle);
    }).toBe(true);
  } finally {
    await deleteWorkspace(request, workspace.id).catch(() => undefined);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
    await secondPage.close().catch(() => undefined);
    const response = await request.get("/api/activity/sessions?limit=100");
    if (response.ok()) {
      const sessions = await response.json() as ActivitySessionRecord[];
      for (const session of sessions) {
        if (session.title === firstTitle || session.title === secondTitle) {
          await request.delete(`/api/activity/sessions/${session.id}`).catch(() => undefined);
        }
      }
    }
  }
});

test("Today Quick Activity requires a Workspace before starting", async ({ page, request }) => {
  const workspace = await createActivityWorkspace(request);
  try {
    await page.goto("/today");
    const input = page.getByRole("textbox", { name: "Quick activity" });
    await input.fill("Unassigned activity must not run");
    const start = page.getByRole("button", { name: "Start", exact: true });
    await expect(start).toBeDisabled();
    await chooseActivityWorkspace(page, workspace.id);
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page.getByRole("status", { name: "Active activity" })).toBeVisible();
    await page.getByRole("button", { name: "End activity" }).click();
    await expect(page.getByRole("status", { name: "Active activity" })).toHaveCount(0);
    await expect.poll(async () => {
      const response = await request.get("/api/activity/sessions?limit=100");
      if (!response.ok()) return "";
      const sessions = await response.json() as ActivitySessionRecord[];
      return sessions.find((item) => item.title === "Unassigned activity must not run")?.workspaceId ?? "";
    }).toBe(workspace.id);
  } finally {
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});

test("Global Activity rail requires Workspace and preserves dock controls", async ({ page, request }) => {
  const workspace = await createActivityWorkspace(request);
  const title = `Global M5 activity ${Date.now()}`;
  try {
    await page.goto("/");
    const rail = page.getByRole("navigation", { name: "Primary navigation" });
    await rail.getByRole("button", { name: /^Activity, today/ }).click();
    const panel = page.getByRole("dialog", { name: "Activity" });
    await expect(panel).toBeVisible();
    await panel.getByRole("textbox", { name: "Activity title" }).fill(title);
    const button = panel.getByRole("button", { name: "Start activity" });
    await expect(button).toBeDisabled();
    await panel.getByRole("combobox", { name: "Global Activity Workspace" }).selectOption(workspace.id);
    await expect(button).toBeEnabled();
    await button.click();
    await page.getByRole("menu", { name: "Choose activity type" }).getByRole("menuitem", { name: "Build" }).click();
    const active = page.getByRole("status", { name: "Active activity" });
    await expect(active).toContainText(title);
    await page.getByRole("button", { name: "End activity" }).click();
    await expect(active).toHaveCount(0);
    await expect.poll(async () => {
      const response = await request.get("/api/activity/sessions?limit=100");
      if (!response.ok()) return "";
      const sessions = await response.json() as ActivitySessionRecord[];
      return sessions.find((item) => item.title === title)?.workspaceId ?? "";
    }).toBe(workspace.id);
  } finally {
    const response = await request.get("/api/activity/sessions?limit=100");
    if (response.ok()) {
      const sessions = await response.json() as ActivitySessionRecord[];
      for (const item of sessions.filter((row) => row.title === title)) {
        await request.delete(`/api/activity/sessions/${item.id}`).catch(() => undefined);
      }
    }
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});

test("@critical another open tab retries a newly persisted Activity finalization", async ({ page, context, request }) => {
  const stamp = Date.now();
  const created = await request.post("/api/workspaces", { data: { title: `Outbox recovery ${stamp}` } });
  expect(created.status()).toBe(201);
  const workspace = await created.json() as { id: string };
  const sessionId = `outbox-${stamp}:2026-10-26`;
  const title = `Cross-tab recovery ${stamp}`;
  const otherTab = await context.newPage();
  try {
    // Only the receiving tab has an active ActivityRuntimeProvider at enqueue.
    await page.goto("/today");
    await expect(page.getByRole("textbox", { name: "Quick activity" })).toBeVisible();
    await otherTab.goto("/today");
    await otherTab.evaluate(({ sessionId, title, workspaceId }) => {
      localStorage.setItem("notespace.activity-recovery:v1", JSON.stringify({
        finalizations: [{
          sessionId,
          heartbeat: {
            activityDate: "2026-10-26", activeSeconds: 17, finish: true,
            title, activityType: "build", workspaceId,
          },
        }],
        handoffTaskIds: [],
      }));
    }, { sessionId, title, workspaceId: workspace.id });
    // The writing tab dispatches no local event; the receiving tab must
    // respond to the real cross-document storage event, without navigation.
    await expect.poll(async () => {
      const response = await request.get("/api/activity/sessions?limit=100");
      if (!response.ok()) return null;
      const sessions = await response.json() as ActivitySessionRecord[];
      return sessions.find((item) => item.id === sessionId.split(":")[0])?.endedAt ?? null;
    }).not.toBeNull();
    await expect.poll(async () => page.evaluate(() =>
      localStorage.getItem("notespace.activity-recovery:v1")
    )).toBeNull();
  } finally {
    await otherTab.close();
    await request.delete(`/api/activity/sessions/${sessionId.split(":")[0]}`).catch(() => undefined);
    await deleteWorkspace(request, workspace.id).catch(() => undefined);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
