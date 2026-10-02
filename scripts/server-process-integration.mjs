/* global clearTimeout, console, fetch, setTimeout */

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const serverRoot = join(root, "apps", "server");
const testRoot = mkdtempSync(join(tmpdir(), "notespace-server-process-"));
const binary = process.env.NOTESPACE_SERVER_BINARY
  ? resolve(root, process.env.NOTESPACE_SERVER_BINARY)
  : join(testRoot, process.platform === "win32" ? "notespace-server.exe" : "notespace-server");
const webDir = join(testRoot, "web");
const dbPath = join(testRoot, "notespace.db");

mkdirSync(webDir, { recursive: true });
writeFileSync(join(webDir, "index.html"), "<!doctype html><title>Notespace</title>", "utf8");

if (!process.env.NOTESPACE_SERVER_BINARY) {
  execFileSync("go", ["build", "-o", binary, "./cmd/notespace"], {
    cwd: serverRoot,
    stdio: "inherit",
  });
}

async function startServer() {
  const child = spawn(binary, [], {
    cwd: root,
    env: {
      ...process.env,
      NOTESPACE_ADDR: "127.0.0.1:0",
      NOTESPACE_DB: dbPath,
      NOTESPACE_WEB_DIR: webDir,
      NOTESPACE_PASSWORD: "",
      NOTESPACE_PARENT_LIFECYCLE: "1",
      NOTESPACE_READY_STDOUT: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  const address = await new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(() => {
      rejectReady(new Error(`server did not become ready:\n${output}`));
    }, 15_000);
    const onData = () => {
      const match = output.match(/NOTESPACE_READY=(http:\/\/127\.0\.0\.1:\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      resolveReady(match[1]);
    };
    const onExit = (code, signal) => {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      rejectReady(new Error(`server exited before readiness (${code}, ${signal}):\n${output}`));
    };
    child.stdout.on("data", onData);
    child.once("exit", onExit);
  });

  return { child, address, getOutput: () => output };
}

async function waitForExit(child, output, timeoutMs = 12_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return [child.exitCode, child.signalCode];
  }
  return Promise.race([
    new Promise((resolveExit) => child.once("exit", (code, signal) => resolveExit([code, signal]))),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`server did not exit:\n${output()}`)), timeoutMs)),
  ]);
}

async function request(address, path, options = {}) {
  const response = await fetch(`${address}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body };
}

async function run() {
  const first = await startServer();
  try {
    const health = await request(first.address, "/api/health");
    assert.equal(health.response.status, 200);

    const created = await request(first.address, "/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ title: "Process integration 🧪" }),
    });
    assert.equal(created.response.status, 201);
    const workspace = created.body;
    assert.ok(workspace?.id, "server must return a Workspace id");

    const note = workspace.notes[0];
    const noteUpdate = await request(first.address, `/api/workspaces/${workspace.id}/notes/${note.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: "Durable note",
        document: {
          format: "tiptap",
          version: 1,
          data: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "persisted across process restart" }] }] },
        },
        version: note.version,
      }),
    });
    assert.equal(noteUpdate.response.status, 200);

    const canvasUpdate = await request(first.address, `/api/workspaces/${workspace.id}/canvas`, {
      method: "PATCH",
      body: JSON.stringify({
        canvas: {
          format: "excalidraw",
          version: 1,
          data: { elements: [{ id: "process-shape", type: "rectangle" }], appState: {}, files: {} },
        },
        version: workspace.canvasVersion,
      }),
    });
    assert.equal(canvasUpdate.response.status, 200);

    const beforeShutdown = await request(first.address, `/api/workspaces/${workspace.id}`);
    assert.equal(beforeShutdown.response.status, 200);
    assert.equal(beforeShutdown.body.notes[0].title, "Durable note");
  } finally {
    first.child.stdin.write("shutdown\n");
    const [code, signal] = await waitForExit(first.child, first.getOutput);
    assert.equal(code, 0, `server must exit cleanly (signal=${signal})`);
  }

  const second = await startServer();
  try {
    const restored = await request(second.address, "/api/workspaces");
    assert.equal(restored.response.status, 200);
    assert.equal(restored.body.items.length, 1);
    assert.equal(restored.body.items[0].title, "Process integration 🧪");

    const workspaceId = restored.body.items[0].id;
    const durable = await request(second.address, `/api/workspaces/${workspaceId}`);
    assert.equal(durable.response.status, 200);
    assert.equal(durable.body.notes[0].title, "Durable note");
    assert.match(JSON.stringify(durable.body.notes[0].document.data), /persisted across process restart/);
    assert.match(JSON.stringify(durable.body.canvas.data), /process-shape/);
  } finally {
    second.child.stdin.end();
    const [code, signal] = await waitForExit(second.child, second.getOutput);
    assert.equal(code, 0, `server must exit cleanly on stdin EOF (signal=${signal})`);
  }
}

try {
  await run();
  console.log("Server process integration passed: readiness, HTTP, SQLite durability, shutdown, relaunch");
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}
