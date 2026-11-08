const MAX_LINES = 99;
const MAX_LINE_LENGTH = 4000;
let lineCount = 0;
let truncated = false;

function inspect(value) {
  if (typeof value === "string") return value.slice(0, MAX_LINE_LENGTH);
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
    return (encoded ?? String(value)).slice(0, MAX_LINE_LENGTH);
  } catch {
    return String(value).slice(0, MAX_LINE_LENGTH);
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
  self.postMessage({ type, text: values.map(inspect).join(" ").slice(0, MAX_LINE_LENGTH) });
}

const networkError = () => new Error("Network access is disabled in the local code runner.");
try { self.fetch = () => Promise.reject(networkError()); } catch {}
try { self.XMLHttpRequest = undefined; } catch {}
try { self.WebSocket = undefined; } catch {}
try { self.EventSource = undefined; } catch {}
try { self.WebTransport = undefined; } catch {}
try { self.RTCPeerConnection = undefined; } catch {}
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
    const fn = new AsyncFunction("console", '"use strict";\n' + code);
    const value = await fn(runnerConsole);
    self.postMessage({ type: "done", result: typeof value === "undefined" ? undefined : inspect(value) });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? (error.stack || error.message) : inspect(error),
    });
  }
};
