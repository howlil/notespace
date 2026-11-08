import { useCodeRunner } from "./execution/use-code-runner";

export type { CodeRunView } from "./execution/use-code-runner";

export function useCanvasCodeRunner(liveElementIds: readonly string[]) {
  return useCodeRunner(liveElementIds);
}
