import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import { createWorkspace, deleteWorkspace } from "../helpers";

export async function createViaAPI(page: Page, request: APIRequestContext, title: string) {
  const response = await request.post("/api/workspaces", { data: { title } });
  expect(response.status()).toBe(201);
  const workspace = await response.json() as { id: string };
  await page.goto(`/workspaces/${workspace.id}`);
  await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
  return workspace.id;
}

export async function cleanupWorkspace(request: APIRequestContext, id: string) {
  await deleteWorkspace(request, id);
  await request.delete(`/api/trash/${id}`).catch(() => undefined);
}

export async function openPaneMenu(page: Page) {
  const details = page.locator("details.pane-actions").first();
  if ((await details.getAttribute("open")) === null) {
    await page.locator('summary[aria-label^="Actions for"]').first().click();
  }
}

export async function selectView(page: Page, name: "Canvas" | "Note" | "Split") {
  await page.getByTestId("workspace-view-switcher").getByRole("button", { name, exact: true }).click();
}

export function frameCanvasSnapshot() {
  const base = {
    angle: 0,
    strokeColor: "#4f7396",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
  return {
    format: "excalidraw",
    version: 1,
    data: {
      elements: [
        { ...base, id: "frame-architecture", type: "frame", x: 120, y: 90, width: 440, height: 260, frameId: null, index: "a0", name: "Architecture" },
        { ...base, id: "service-box", type: "rectangle", x: 180, y: 145, width: 180, height: 90, frameId: "frame-architecture", index: "a1", backgroundColor: "#e8eef6" },
        { ...base, id: "service-logo", type: "image", x: 390, y: 155, width: 64, height: 64, frameId: "frame-architecture", index: "a2", fileId: "asset-frame-logo", status: "saved", scale: [1, 1], crop: null },
      ],
      appState: { viewBackgroundColor: "#f8f9fc" },
      files: {},
    },
  };
}

export function frameClipboardPayload() {
  const snapshot = frameCanvasSnapshot();
  return JSON.stringify({ type: "excalidraw/clipboard", elements: snapshot.data.elements });
}

type WorkspaceFixtures = {
  workspaceId: string;
};

export const test = base.extend<WorkspaceFixtures>({
  workspaceId: async ({ page, request }, provide, testInfo) => {
    const title = `Workspace ${testInfo.workerIndex}-${testInfo.testId}`;
    const id = await createWorkspace(page, title);

    try {
      await provide(id);
    } finally {
      await cleanupWorkspace(request, id);
    }
  },
});

export { expect };
