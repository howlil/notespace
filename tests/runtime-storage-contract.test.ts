import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

test("task dev server uses an isolated repository SQLite database", () => {
  assert.match(
    source("Taskfile.yml"),
    /^[ ]{2}dev:server:\r?\n[ ]{4}internal: true\r?\n[ ]{4}dir: apps\/server\r?\n[ ]{4}env:\r?\n[ ]{6}NOTESPACE_DB: \.\.\/\.\.\/data\/dev\/notespace\.db\r?\n/m,
  );
});

test("Docker keeps its production SQLite database on the durable volume", () => {
  const compose = source("compose.yaml");
  assert.match(compose, /NOTESPACE_DB: \/data\/notespace\.db/);
  assert.match(compose, /notespace-data:\/data/);
});
