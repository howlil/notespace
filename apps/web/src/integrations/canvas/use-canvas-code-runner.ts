import { useCodeRunner } from "../code/use-code-runner";

export type { CodeRunView } from "../code/use-code-runner";

export function useCanvasCodeRunner(liveElementIds: readonly string[]) {
  return useCodeRunner(liveElementIds);
}
