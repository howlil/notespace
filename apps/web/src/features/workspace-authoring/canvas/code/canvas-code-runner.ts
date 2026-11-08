import { canRunCode } from "./execution/code-runner.ts";

export {
  DEFAULT_CODE_RUN_TIMEOUT_MS,
  CODE_RUNNER_WORKER_CSP,
  CODE_RUNNER_WORKER_URL,
  MAX_CODE_RUN_OUTPUT_CHARS,
  MAX_CODE_RUN_OUTPUT_LINES,
  MAX_CODE_RUN_OUTPUT_LINE_CHARS,
  createCodeRunOutputBuffer,
  parseWorkerMessage,
  startJavaScriptRun,
  type CodeRunOutputBuffer,
  type JavaScriptRunHandle,
  type JavaScriptRunResult,
  type JavaScriptRunStatus,
} from "./execution/code-runner.ts";

export const canRunCanvasCode = canRunCode;
