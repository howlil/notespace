/* Workspace creation edge input: whitespace-only stays disabled, oversized is rejected. */
import { after, before, test } from "node:test";
import {
  api, assert, click, expectCount, fill, goto, press, role, start, stop, visible, waitAny,
} from "../support/harness.mjs";

before(start);
after(stop);

async function openCreateForm() {
  await goto("/");
  const firstRun = role("button", "Create Workspace", { exact: true });
  const card = role("button", "New workspace", { exact: true, scope: role("group", "All workspaces", { exact: true }) });
  const which = await waitAny([firstRun, card]);
  if (which === 0) {
    await click(firstRun);
    return role("textbox", "Workspace name");
  }
  await click(card);
  return role("textbox", "New workspace name");
}

test("Workspace creation keeps whitespace-only input disabled", async () => {
  const input = await openCreateForm();
  await fill(input, "   \n  ");
  await press("Enter");
  await visible(input);
});

test("Workspace creation rejects an oversized title without creating partial state", async () => {
  const title = `oversized-${"x".repeat(161)}`;
  const input = await openCreateForm();
  await fill(input, title);
  await press("Enter");

  await visible(role("alert", null, { index: 0 }));
  await visible(input);
  await expectCount(role("heading", title), 0);

  const workspaces = await api("/api/workspaces?limit=100");
  assert.equal(workspaces.items.some((item) => item.title === title), false);
});
