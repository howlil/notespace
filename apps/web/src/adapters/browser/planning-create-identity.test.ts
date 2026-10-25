import assert from "node:assert/strict";
import { test } from "node:test";
import { APIError } from "../http/client.ts";
import { confirmCreation, confirmKeyedPost, creationIdentity, pendingCreation } from "./planning-create-identity.ts";

function installMemorySessionStorage() {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  };
}

test("pending keyed creation survives remount, keeps same request identity and clears on confirmation", () => {
  const restore = installMemorySessionStorage();
  try {
    const draft = JSON.stringify({ title: "Draft", destination: "workspace-1" });
    const first = creationIdentity("task:workspace-1", draft);
    assert.equal(first, creationIdentity("task:workspace-1", draft));
    assert.deepEqual(pendingCreation("task:workspace-1"), { key: first, payload: draft });
    // A changed payload represents a new intention, not a retry.
    const second = creationIdentity("task:workspace-1", JSON.stringify({ title: "Changed" }));
    assert.notEqual(second, first);
    confirmCreation("task:workspace-1", first);
    assert.equal(pendingCreation("task:workspace-1")?.key, second);
    confirmCreation("task:workspace-1", second);
    assert.equal(pendingCreation("task:workspace-1"), null);
  } finally { restore(); }
});

test("lost HTTP response retries the exact same keyed POST instead of creating a new intention", async () => {
  let requests = 0;
  const result = await confirmKeyedPost(async () => {
    requests++;
    if (requests === 1) throw Error("response lost after server commit");
    return { id: "original-record" };
  });
  assert.deepEqual(result, { id: "original-record" });
  assert.equal(requests, 2);
});

test("deterministic 409 does not retry with a conflicting key or show false success", async () => {
  let requests = 0;
  await assert.rejects(
    () => confirmKeyedPost(async () => {
      requests++;
      throw new APIError(409, "key already used for different intent", "planning_conflict");
    }),
    (error: unknown) => error instanceof APIError && error.status === 409,
  );
  assert.equal(requests, 1);
});

test("blocked session storage still preserves the same identity for repeated manual submissions", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    },
  });
  try {
    const scope = "task:storage-blocked";
    const draft = JSON.stringify({ title: "Ambiguous save" });
    const key = creationIdentity(scope, draft);
    assert.equal(creationIdentity(scope, draft), key);
    assert.equal(pendingCreation(scope)?.key, key);
    confirmCreation(scope, key);
    assert.notEqual(creationIdentity(scope, draft), key);
  } finally {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
