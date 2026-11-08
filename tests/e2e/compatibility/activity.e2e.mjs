/* Retired Activity surface: the dock is gone, the legacy API still reads. */
import { after, before, test } from "node:test";
import { apiResponse, assert, expectCount, goto, role, start, stop, visible } from "../support/harness.mjs";

before(start);
after(stop);

test("critical: retired Activity surface stays hidden while the legacy API remains readable", async () => {
  await goto("/");
  await visible(role("complementary", "Category explorer"));
  await expectCount(role("dialog", "Activity"), 0);
  await expectCount(role("button", /^Activity, today/), 0);

  const response = await apiResponse("/api/activity/sessions?limit=100");
  assert.equal(response.ok, true);
  const sessions = await response.json();
  assert.equal(Array.isArray(sessions), true);
});
