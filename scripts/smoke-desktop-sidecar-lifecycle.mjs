import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const targetTriple = execFileSync("rustc", ["--print", "host-tuple"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const extension = process.platform === "win32" ? ".exe" : "";
const binary = join(root, "apps", "desktop", "src-tauri", "binaries", `notespace-server-${targetTriple}${extension}`);
const webDir = join(root, "apps", "web", "dist", "client");

async function runScenario(command) {
  const tempDir = mkdtempSync(join(tmpdir(), "notespace-desktop-lifecycle-"));
  const child = spawn(binary, [], {
    cwd: root,
    env: {
      ...process.env,
      NOTESPACE_ADDR: "127.0.0.1:0",
      NOTESPACE_DB: join(tempDir, "notespace.db"),
      NOTESPACE_WEB_DIR: webDir,
      NOTESPACE_PASSWORD: "",
      NOTESPACE_PARENT_LIFECYCLE: "1",
      NOTESPACE_READY_STDOUT: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { output += chunk; });

  try {
    await new Promise((resolveReady, rejectReady) => {
      const timeout = setTimeout(() => rejectReady(new Error(`sidecar did not become ready: ${output}`)), 15_000);
      const onExit = (code, signal) => {
        clearTimeout(timeout);
        rejectReady(new Error(`sidecar exited before readiness (${code}, ${signal}): ${output}`));
      };
      child.once("exit", onExit);
      const onData = () => {
        if (!output.includes("NOTESPACE_READY=http://127.0.0.1:")) return;
        clearTimeout(timeout);
        child.off("exit", onExit);
        resolveReady();
      };
      child.stdout.on("data", onData);
    });

    const exited = new Promise((resolveExit) => child.once("exit", (code, signal) => resolveExit([code, signal])));
    if (command === "shutdown") child.stdin.write("shutdown\n");
    else child.stdin.end();
    const [code, signal] = await Promise.race([
      exited,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`sidecar did not stop after ${command}`)), 10_000)),
    ]);
    assert.equal(code, 0, `sidecar ${command} should exit cleanly (signal=${signal})`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

await runScenario("shutdown");
await runScenario("eof");
console.log("Desktop sidecar lifecycle smoke passed: shutdown + EOF");
