import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const targetTriple = execFileSync("rustc", ["--print", "host-tuple"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const extension = process.platform === "win32" ? ".exe" : "";
const binary = join(
  root,
  "apps",
  "desktop",
  "src-tauri",
  "binaries",
  `notespace-server-${targetTriple}${extension}`,
);
const webDir = join(root, "apps", "web", "dist", "client");
const tempDir = mkdtempSync(join(tmpdir(), "notespace-desktop-smoke-"));
const database = join(tempDir, "notespace.db");

const child = spawn(binary, [], {
  cwd: root,
  env: {
    ...process.env,
    NOTESPACE_ADDR: "127.0.0.1:0",
    NOTESPACE_DB: database,
    NOTESPACE_WEB_DIR: webDir,
    NOTESPACE_PASSWORD: "",
    NOTESPACE_READY_STDOUT: "1",
    NOTESPACE_PARENT_LIFECYCLE: "1",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let stdoutBuffer = "";
let stderr = "";

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

function readyUrl() {
  return new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(() => {
      rejectReady(new Error(`Timed out waiting for desktop runtime readiness. stderr: ${stderr}`));
    }, 15_000);

    const onExit = (code, signal) => {
      clearTimeout(timeout);
      rejectReady(new Error(`Desktop runtime exited before readiness (code=${code}, signal=${signal}). stderr: ${stderr}`));
    };

    child.once("exit", onExit);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("NOTESPACE_READY=")) continue;
        const value = line.slice("NOTESPACE_READY=".length);
        let url;
        try {
          url = new URL(value);
        } catch (error) {
          clearTimeout(timeout);
          child.off("exit", onExit);
          rejectReady(new Error(`Invalid readiness URL ${JSON.stringify(value)}: ${error}`));
          return;
        }
        if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
          clearTimeout(timeout);
          child.off("exit", onExit);
          rejectReady(new Error(`Readiness escaped loopback HTTP: ${url}`));
          return;
        }
        clearTimeout(timeout);
        child.off("exit", onExit);
        resolveReady(url);
        return;
      }
    });
  });
}

async function shutdown() {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  child.kill();
  await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Desktop runtime did not stop after termination.")), 10_000),
    ),
  ]);
}

try {
  const base = await readyUrl();

  const privateHealth = new URL("/api/health", base);
  const anonymous = await fetch(privateHealth, { signal: AbortSignal.timeout(5_000) });
  if (anonymous.status !== 401) {
    throw new Error(`Unauthenticated local API responded HTTP ${anonymous.status}; expected 401`);
  }
  const bootstrap = await fetch(base, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
  if (bootstrap.status !== 303 || bootstrap.headers.get("location") !== "/") {
    throw new Error("Desktop one-use session bootstrap failed");
  }
  const rawCookie = bootstrap.headers.get("set-cookie") ?? "";
  if (!rawCookie.includes("HttpOnly") || !rawCookie.includes("SameSite=Strict")) {
    throw new Error("Desktop session cookie lacks browser-access restrictions");
  }
  const cookie = rawCookie.split(";")[0];
  const reused = await fetch(base, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
  if (reused.status !== 403) throw new Error("Desktop bootstrap token can be replayed");
  const health = await fetch(privateHealth, {
    headers: { Cookie: cookie }, signal: AbortSignal.timeout(5_000),
  });
  if (!health.ok) {
    throw new Error(`Authenticated desktop health returned HTTP ${health.status}.`);
  }
  const healthBody = await health.json();
  if (healthBody?.status !== "ok") {
    throw new Error(`Desktop runtime health payload was unexpected: ${JSON.stringify(healthBody)}`);
  }

  const rootResponse = await fetch(new URL("/", base), {
    headers: { Cookie: cookie }, signal: AbortSignal.timeout(5_000),
  });
  const rootBody = await rootResponse.text();
  if (!rootResponse.ok || !/<html[\s>]/i.test(rootBody)) {
    throw new Error(`Desktop runtime did not serve the existing SPA shell (HTTP ${rootResponse.status}).`);
  }

  console.log(`Desktop runtime smoke passed at ${base.origin}`);
} finally {
  try {
    await shutdown();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
