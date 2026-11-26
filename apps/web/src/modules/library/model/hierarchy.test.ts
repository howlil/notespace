import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceSummary } from "../../../entities/workspace.ts";
import { buildWorkspaceTree, collapseAncestors } from "./hierarchy.ts";

function ws(id: string, title: string, parentId: string | null = null): WorkspaceSummary {
  return {
    id,
    parentId,
    title,
    createdAt: "2026-11-25T00:00:00Z",
    updatedAt: "2026-11-25T00:00:00Z",
    version: 1,
    childCount: 0,
  };
}

test("buildWorkspaceTree orders hierarchy depth-first and tracks descendants", () => {
  const root = ws("root", "Computer Science");
  const net = ws("net", "Networking", "root");
  const tcp = ws("tcp", "TCP", "net");
  const db = ws("db", "Databases", "root");
  const tree = buildWorkspaceTree([tcp, db, net, root]);

  assert.deepEqual(
    tree.map((n) => [n.workspace.id, n.depth, n.ancestorTitles]),
    [
      ["root", 0, []],
      ["db", 1, ["Computer Science"]],
      ["net", 1, ["Computer Science"]],
      ["tcp", 2, ["Computer Science", "Networking"]],
    ],
  );
  assert.deepEqual([...tree[0].descendantIds].sort(), ["db", "net", "tcp"]);
  assert.deepEqual([...tree[2].descendantIds], ["tcp"]);
});

test("collapseAncestors keeps root and immediate parent when chain exceeds limit", () => {
  const a = ws("a", "A");
  const b = ws("b", "B", "a");
  const c = ws("c", "C", "b");
  const d = ws("d", "D", "c");

  const short = collapseAncestors([a, b], 2);
  assert.deepEqual(short.leading, [a, b]);
  assert.deepEqual(short.collapsed, []);

  const long = collapseAncestors([a, b, c, d], 2);
  assert.deepEqual(long.leading, [a]);
  assert.deepEqual(long.collapsed, [b, c]);
  assert.deepEqual(long.trailing, [d]);
});
