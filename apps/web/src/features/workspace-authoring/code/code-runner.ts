import { normalizeCodeLanguage } from "../../../domain/code/code-language.ts";

export type JavaScriptRunStatus = "success" | "error" | "timeout" | "cancelled";

export type JavaScriptRunResult = {
  status: JavaScriptRunStatus;
  stdout: string[];
  stderr: string[];
  result?: string;
  durationMs: number;
};

export type JavaScriptRunHandle = {
  result: Promise<JavaScriptRunResult>;
  stop: () => void;
};

export const DEFAULT_CODE_RUN_TIMEOUT_MS = 2_000;
export const MAX_CODE_RUN_OUTPUT_LINES = 100;

export function canRunCode(language: string) {
  return normalizeCodeLanguage(language) === "javascript";
}

export function javascriptWorkerSource() {
  return `
const MAX_LINES = ${MAX_CODE_RUN_OUTPUT_LINES};
let lineCount = 0;
let truncated = false;

function inspect(value) {
  if (typeof value === "string") return value.slice(0, 4000);
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "function") return "[Function " + (value.name || "anonymous") + "]";
  try {
    const seen = new WeakSet();
    const encoded = JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") return String(item) + "n";
      if (typeof item === "function") return "[Function " + (item.name || "anonymous") + "]";
      if (item && typeof item === "object") {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }
      return item;
    });
    return (encoded ?? String(value)).slice(0, 4000);
  } catch {
    return String(value).slice(0, 4000);
  }
}

function emit(type, values) {
  if (lineCount >= MAX_LINES) {
    if (!truncated) {
      truncated = true;
      self.postMessage({ type: "stderr", text: "[output truncated]" });
    }
    return;
  }
  lineCount += 1;
  self.postMessage({ type, text: values.map(inspect).join(" ") });
}

const networkError = () => new Error("Network access is disabled in the local code runner.");
try { self.fetch = () => Promise.reject(networkError()); } catch {}
try { self.XMLHttpRequest = undefined; } catch {}
try { self.WebSocket = undefined; } catch {}
try { self.EventSource = undefined; } catch {}
try { self.importScripts = () => { throw networkError(); }; } catch {}

self.onmessage = async (event) => {
  const code = typeof event.data?.code === "string" ? event.data.code : "";
  const runnerConsole = {
    log: (...values) => emit("stdout", values),
    info: (...values) => emit("stdout", values),
    debug: (...values) => emit("stdout", values),
    warn: (...values) => emit("stderr", values),
    error: (...values) => emit("stderr", values),
  };
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction("console", '"use strict";\\n' + code);
    const value = await fn(runnerConsole);
    self.postMessage({ type: "done", result: typeof value === "undefined" ? undefined : inspect(value) });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? (error.stack || error.message) : inspect(error),
    });
  }
};
`;
}

type WorkerMessage =
  | { type: "stdout"; text: string }
  | { type: "stderr"; text: string }
  | { type: "done"; result?: string }
  | { type: "error"; error: string };

export function startJavaScriptRun(
  code: string,
  timeoutMs = DEFAULT_CODE_RUN_TIMEOUT_MS,
): JavaScriptRunHandle {
  const source = javascriptWorkerSource();
  const blobUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const worker = new Worker(blobUrl, { name: "notespace-code-runner" });
  const stdout: string[] = [];
  const stderr: string[] = [];
  const startedAt = performance.now();
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolveResult: (result: JavaScriptRunResult) => void = () => {};

  const finish = (status: JavaScriptRunStatus, result?: string) => {
    if (finished) return;
    finished = true;
    if (timer) clearTimeout(timer);
    worker.terminate();
    URL.revokeObjectURL(blobUrl);
    resolveResult({
      status,
      stdout: [...stdout],
      stderr: [...stderr],
      ...(result === undefined ? {} : { result }),
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
  };

  const result = new Promise<JavaScriptRunResult>((resolve) => {
    resolveResult = resolve;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "stdout") {
        stdout.push(message.text);
        return;
      }
      if (message.type === "stderr") {
        stderr.push(message.text);
        return;
      }
      if (message.type === "done") {
        finish("success", message.result);
        return;
      }
      if (message.type === "error") {
        stderr.push(message.error);
        finish("error");
      }
    };
    worker.onerror = (event) => {
      stderr.push(event.message || "JavaScript worker failed.");
      finish("error");
    };
    timer = setTimeout(() => {
      stderr.push(`Execution exceeded ${timeoutMs} ms and was stopped.`);
      finish("timeout");
    }, Math.max(100, timeoutMs));
    worker.postMessage({ code });
  });

  return {
    result,
    stop: () => {
      stderr.push("Execution stopped.");
      finish("cancelled");
    },
  };
}
