import { normalizeCodeLanguage } from "../../../../../domain/code/code-language.ts";

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
export const MAX_CODE_RUN_OUTPUT_CHARS = 256_000;
export const MAX_CODE_RUN_OUTPUT_LINE_CHARS = 4_000;
export const CODE_RUNNER_WORKER_URL = "/code-runner-worker.js";
export const CODE_RUNNER_WORKER_CSP = "frame-ancestors 'none'; default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'";

export function canRunCode(language: string) {
  return normalizeCodeLanguage(language) === "javascript";
}

export type WorkerMessage =
  | { type: "stdout"; text: string }
  | { type: "stderr"; text: string }
  | { type: "done"; result?: string }
  | { type: "error"; error: string };

export function parseWorkerMessage(value: unknown): WorkerMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if ((message.type === "stdout" || message.type === "stderr") && typeof message.text === "string") {
    return { type: message.type, text: message.text.slice(0, MAX_CODE_RUN_OUTPUT_LINE_CHARS) };
  }
  if (message.type === "done" && (message.result === undefined || typeof message.result === "string")) {
    return { type: "done", ...(typeof message.result === "string" ? { result: message.result.slice(0, MAX_CODE_RUN_OUTPUT_LINE_CHARS) } : {}) };
  }
  if (message.type === "error" && typeof message.error === "string") {
    return { type: "error", error: message.error.slice(0, MAX_CODE_RUN_OUTPUT_LINE_CHARS) };
  }
  return null;
}

export type CodeRunOutputBuffer = {
  stdout: string[];
  stderr: string[];
  append: (stream: "stdout" | "stderr", text: string) => void;
};

export function createCodeRunOutputBuffer(): CodeRunOutputBuffer {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let lines = 0;
  let chars = 0;
  let truncated = false;
  const marker = "[output truncated]";
  const append = (stream: "stdout" | "stderr", text: string) => {
    if (truncated) return;
    const contentBudget = MAX_CODE_RUN_OUTPUT_CHARS - marker.length;
    if (lines >= MAX_CODE_RUN_OUTPUT_LINES - 1 || chars >= contentBudget) {
      truncated = true;
      stderr.push(marker);
      lines += 1;
      chars += marker.length;
      return;
    }
    const limit = Math.min(MAX_CODE_RUN_OUTPUT_LINE_CHARS, contentBudget - chars);
    if (limit <= 0) {
      truncated = true;
      stderr.push(marker);
      lines += 1;
      chars += marker.length;
      return;
    }
    const bounded = text.slice(0, limit);
    (stream === "stdout" ? stdout : stderr).push(bounded);
    lines += 1;
    chars += bounded.length;
    if (bounded.length < text.length) {
      truncated = true;
      stderr.push(marker);
      lines += 1;
      chars += marker.length;
    }
  };
  return { stdout, stderr, append };
}

export function startJavaScriptRun(
  code: string,
  timeoutMs = DEFAULT_CODE_RUN_TIMEOUT_MS,
): JavaScriptRunHandle {
  const worker = new Worker(CODE_RUNNER_WORKER_URL, { name: "notespace-code-runner" });
  const output = createCodeRunOutputBuffer();
  const startedAt = performance.now();
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolveResult: (result: JavaScriptRunResult) => void = () => {};

  const finish = (status: JavaScriptRunStatus, result?: string) => {
    if (finished) return;
    finished = true;
    if (timer) clearTimeout(timer);
    worker.terminate();
    resolveResult({
      status,
      stdout: [...output.stdout],
      stderr: [...output.stderr],
      ...(result === undefined ? {} : { result: result.slice(0, MAX_CODE_RUN_OUTPUT_LINE_CHARS) }),
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
  };

  const result = new Promise<JavaScriptRunResult>((resolve) => {
    resolveResult = resolve;
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const message = parseWorkerMessage(event.data);
      if (!message) return;
      if (message.type === "stdout") {
        output.append("stdout", message.text);
        return;
      }
      if (message.type === "stderr") {
        output.append("stderr", message.text);
        return;
      }
      if (message.type === "done") {
        finish("success", message.result);
        return;
      }
      if (message.type === "error") {
        output.append("stderr", message.error);
        finish("error");
      }
    };
    worker.onerror = (event) => {
      output.append("stderr", event.message || "JavaScript worker failed.");
      finish("error");
    };
    timer = setTimeout(() => {
      output.append("stderr", `Execution exceeded ${timeoutMs} ms and was stopped.`);
      finish("timeout");
    }, Math.max(100, timeoutMs));
    worker.postMessage({ code });
  });

  return {
    result,
    stop: () => {
      output.append("stderr", "Execution stopped.");
      finish("cancelled");
    },
  };
}
