import { canRunCode } from "../code/code-runner.ts";

export {
  DEFAULT_CODE_RUN_TIMEOUT_MS,
  MAX_CODE_RUN_OUTPUT_LINES,
  javascriptWorkerSource,
  startJavaScriptRun,
  type JavaScriptRunHandle,
  type JavaScriptRunResult,
  type JavaScriptRunStatus,
} from "../code/code-runner.ts";

export const canRunCanvasCode = canRunCode;
