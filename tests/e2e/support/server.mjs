import { execFileSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
const serverRoot = join(root, "apps", "server");
const webDir = join(root, "apps", "web", "dist", "client");

function serverBinary(workDir) {
  if (process.env.NOTESPACE_SERVER_BINARY) return resolve(root, process.env.NOTESPACE_SERVER_BINARY);
  const binary = join(workDir, process.platform === "win32" ? "notespace-server.exe" : "notespace-server");
  execFileSync("go", ["build", "-o", binary, "./cmd/notespace"], { cwd: serverRoot, stdio: "inherit" });
  return binary;
}

export async function startServer(workDir) {
  const binary = serverBinary(workDir);
  const child = spawn(binary, [], {
    cwd: root,
    env: {
      ...process.env,
      NOTESPACE_ADDR: "127.0.0.1:0",
      NOTESPACE_DB: join(workDir, "notespace.db"),
      NOTESPACE_WEB_DIR: webDir,
      NOTESPACE_PASSWORD: "",
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

  try {
    const origin = await new Promise((ready, fail) => {
      let poll;
      const cleanup = () => {
        clearInterval(poll);
        clearTimeout(timeout);
        child.off("exit", onExit);
        child.off("error", onError);
      };
      const finish = (callback, value) => {
        cleanup();
        callback(value);
      };
      const onExit = (code) => finish(fail, new Error(`server exited before readiness (${code}):\n${output}`));
      const onError = (error) => finish(fail, error);
      const timeout = setTimeout(
        () => finish(fail, new Error(`server did not report readiness:\n${output}`)),
        60_000,
      );
      poll = setInterval(() => {
        const match = output.match(/NOTESPACE_READY=(http:\/\/127\.0\.0\.1:\d+)/);
        if (!match) return;
        finish(ready, match[1]);
      }, 25);
      child.once("exit", onExit);
      child.once("error", onError);
    });

    return { child, origin, getOutput: () => output };
  } catch (error) {
    await stopServer({ child });
    throw error;
  }
}

export async function stopServer(server) {
  if (!server) return;
  const { child } = server;
  const hasExited = () => child.exitCode !== null || child.signalCode !== null || child.pid === undefined;
  if (hasExited()) return;

  const waitForExit = (timeoutMs) => new Promise((resolve) => {
    if (hasExited()) return resolve(true);
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      resolve(child.exitCode !== null);
    }, timeoutMs);
    child.once("exit", onExit);
  });

  child.kill("SIGTERM");
  if (await waitForExit(5_000)) return;
  child.kill("SIGKILL");
  if (!(await waitForExit(5_000))) {
    throw new Error(`server process ${child.pid} did not exit after SIGKILL`);
  }
}
