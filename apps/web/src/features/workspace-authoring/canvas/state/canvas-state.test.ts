import assert from "node:assert/strict";
import test from "node:test";
import type { StructuredDiagram } from "../../../../domain/diagram/diagram.ts";
import { mergeDiagramSets } from "./canvas-state.ts";

const diagram = (id: string, title: string): StructuredDiagram => ({ id, title, kind: "architecture", nodes: [], edges: [], groups: [] });

test("remote diagram sets replace matching identities without dropping local-only diagrams or mutating inputs", () => {
  const localA = diagram("a", "old");
  const localB = diagram("b", "local only");
  const remoteA = diagram("a", "new");
  const remoteC = diagram("c", "remote only");
  const local = Object.freeze([localA, localB]);
  const remote = Object.freeze([remoteA, remoteC]);
  const merged = mergeDiagramSets(local, remote);
  assert.deepEqual(merged.map(({ id }) => id), ["a", "b", "c"]);
  assert.equal(merged[0], remoteA);
  assert.equal(merged[1], localB);
  assert.equal(merged[2], remoteC);
  assert.equal(local[0], localA);
  assert.equal(localA.title, "old");
  assert.deepEqual(mergeDiagramSets([], []), []);
});
