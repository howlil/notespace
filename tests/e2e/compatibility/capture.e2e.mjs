/* Retired global Quick Capture: the UI and shortcut are gone, records remain. */
import { after, before, test } from "node:test";
import {
  apiResponse, assert, execute, expectCount, goto, press, role, start, stop, visible,
} from "../support/harness.mjs";

before(start);
after(stop);

test("critical: Global Quick Capture UI and shortcut are retired without deleting Capture API records", async () => {
  await goto("/");
  await visible(role("complementary", "Category explorer"));
  await expectCount(role("dialog", "Quick capture"), 0);

  await press("Control+Shift+N");
  await expectCount(role("dialog", "Quick capture"), 0);

  await execute(() => window.dispatchEvent(new Event("notespace:open-quick-capture")));
  await expectCount(role("dialog", "Quick capture"), 0);

  const content = `Retained legacy capture ${Date.now()}`;
  const response = await apiResponse("/api/captures", { method: "POST", body: { content } });
  assert.equal(response.status, 201);
  const captured = await response.json();
  try {
    const fetched = await apiResponse(`/api/captures/${captured.id}`);
    assert.equal(fetched.status, 200);
    const item = await fetched.json();
    assert.equal(item.id, captured.id);
    assert.equal(item.content, content);
    assert.equal(item.status, "pending");
  } finally {
    const result = await apiResponse(`/api/captures/${captured.id}`);
    if (result.ok) {
      const item = await result.json();
      if (item.status === "pending") {
        await apiResponse(`/api/captures/${captured.id}`, {
          method: "DELETE",
          headers: { "If-Match": `"${item.version}"` },
        });
      }
    }
  }
});
