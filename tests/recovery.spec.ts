import { expect, test } from "@playwright/test";

test("workspace trash restores the same authored workspace", async ({ request }) => {
  const title = `Trash recovery ${Date.now()}`;
  const createdResponse = await request.post("/api/workspaces", { data: { title } });
  expect(createdResponse.status()).toBe(201);
  const workspace = await createdResponse.json();

  try {
    expect((await request.delete(`/api/workspaces/${workspace.id}`)).status()).toBe(204);
    const trash = await (await request.get("/api/trash")).json();
    expect(trash.some((item: { id: string }) => item.id === workspace.id)).toBe(true);

    const restored = await request.post(`/api/trash/${workspace.id}`);
    expect(restored.status()).toBe(200);
    expect((await restored.json()).title).toBe(title);

    const read = await request.get(`/api/workspaces/${workspace.id}`);
    expect(read.status()).toBe(200);
    expect((await read.json()).title).toBe(title);
  } finally {
    const active = await request.get(`/api/workspaces/${workspace.id}`);
    if (active.ok()) await request.delete(`/api/workspaces/${workspace.id}`);
    const trashed = await request.get("/api/trash");
    if (trashed.ok() && (await trashed.json()).some((item: { id: string }) => item.id === workspace.id)) {
      await request.delete(`/api/trash/${workspace.id}`);
    }
  }
});

test("full-library ZIP backup restores an active workspace", async ({ request }) => {
  const title = `Backup recovery ${Date.now()}`;
  const createdResponse = await request.post("/api/workspaces", { data: { title } });
  expect(createdResponse.status()).toBe(201);
  const workspace = await createdResponse.json();

  const backupResponse = await request.get("/api/backup");
  expect(backupResponse.status()).toBe(200);
  expect(backupResponse.headers()["content-type"]).toContain("application/zip");
  const backup = await backupResponse.body();

  try {
    expect((await request.delete(`/api/workspaces/${workspace.id}`)).status()).toBe(204);
    expect((await request.delete(`/api/trash/${workspace.id}`)).status()).toBe(204);
    expect((await request.get(`/api/workspaces/${workspace.id}`)).status()).toBe(404);

    const restore = await request.fetch("/api/backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      data: backup,
    });
    expect(restore.status()).toBe(204);

    const read = await request.get(`/api/workspaces/${workspace.id}`);
    expect(read.status()).toBe(200);
    expect((await read.json()).title).toBe(title);
  } finally {
    const active = await request.get(`/api/workspaces/${workspace.id}`);
    if (active.ok()) await request.delete(`/api/workspaces/${workspace.id}`);
    const trashResponse = await request.get("/api/trash");
    if (trashResponse.ok() && (await trashResponse.json()).some((item: { id: string }) => item.id === workspace.id)) {
      await request.delete(`/api/trash/${workspace.id}`);
    }
  }
});
