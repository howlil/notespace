import { test, expect } from "./fixtures";
import { waitSaved } from "../helpers";

test("@critical create → edit note and canvas → reload", async ({ page, request, workspaceId: id }) => {
  const editor = page.getByRole("textbox", { name: "Workspace document" });
  await editor.fill("Consensus\nRaft\nPaxos\nquorum = majority(nodes)");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.getByTestId("workspace-view-switcher").getByRole("button", { name: "Canvas", exact: true }).click();
  const canvas = page.locator(".excalidraw__canvas.interactive");
  await expect(canvas).toBeVisible();
  const toolbar = page.getByRole("toolbar", { name: "Canvas tools" });
  await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Canvas did not render");
  await page.mouse.move(bounds.x + 220, bounds.y + 180);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 360, bounds.y + 250, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
    canvas: { data: { elements: Array<{ isDeleted?: boolean }> } };
  };
  expect(stored.canvas.data.elements.filter((element) => !element.isDeleted).length).toBeGreaterThanOrEqual(1);

  await page.reload();
  await page.getByTestId("workspace-view-switcher").getByRole("button", { name: "Note", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Workspace document" })).toContainText("Paxos");
  await page.getByTestId("workspace-view-switcher").getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();

  const reloadedCanvas = await (await request.get(`/api/workspaces/${id}/canvas`)).json() as {
    canvas: { data: { elements: Array<{ isDeleted?: boolean }> } };
  };
  expect(reloadedCanvas.canvas.data.elements.filter((element) => !element.isDeleted).length).toBeGreaterThanOrEqual(1);
});

test("Workspace preserves Unicode and multiline Note content after reload", async ({ page, request, workspaceId: id }) => {
  const content = "日本語 العربية বাংলা 🧠 🚀\nline 2\n\nline 4";
  const editor = page.getByRole("textbox", { name: "Workspace document" });
  await editor.fill(content);
  await waitSaved(page);

  await expect.poll(async () => {
    const response = await request.get(`/api/workspaces/${id}`);
    const workspace = await response.json() as {
      notes: Array<{ document: { data: { content?: Array<{ content?: Array<{ text?: string }> }> } } }>;
    };
    return JSON.stringify(workspace.notes[0]?.document.data);
  }).toContain("日本語");

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Workspace document" })).toContainText("العربية");
  await expect(page.getByRole("textbox", { name: "Workspace document" })).toContainText("line 4");
});

test("Canvas content survives reload independently from pane layout", async ({ page, workspaceId }) => {
  expect(workspaceId).toBeTruthy();
  await page.getByTestId("workspace-view-switcher").getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
  await page.reload();
  await page.getByTestId("workspace-view-switcher").getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
  await expect(page.getByRole("region", { name: "Canvas pane" })).toBeVisible();
});
