import { useCodeRunner, type LiveRunnableCode } from "./execution/use-code-runner";

export type { CodeRunView } from "./execution/use-code-runner";

export function useCanvasCodeRunner(liveBlocks: readonly LiveRunnableCode[]) {
  return useCodeRunner(liveBlocks);
}
