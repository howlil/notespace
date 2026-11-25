import { createStore } from "../../shared/lib/store.ts";

export type DesktopCloseState = "idle" | "flushing" | "error";

export interface DesktopCloseSnapshot {
  state: DesktopCloseState;
  message: string | null;
}

const initialCloseSnapshot: DesktopCloseSnapshot = {
  state: "idle",
  message: null,
};

export const desktopCloseStore = createStore<DesktopCloseSnapshot>(initialCloseSnapshot);

export function setDesktopCloseStatus(state: DesktopCloseState, message: string | null = null) {
  desktopCloseStore.setState((current) => (
    current.state === state && current.message === message
      ? current
      : { state, message }
  ));
}

export function resetDesktopCloseStore() {
  desktopCloseStore.setState(initialCloseSnapshot);
}

type UpdateCheckHandler = () => void;

const desktopUpdaterStore = createStore<{ checkHandler: UpdateCheckHandler | null }>({
  checkHandler: null,
});

export function registerDesktopUpdateChecker(handler: UpdateCheckHandler): () => void {
  desktopUpdaterStore.setState({ checkHandler: handler });
  return () => {
    desktopUpdaterStore.setState((current) => (
      current.checkHandler === handler ? { checkHandler: null } : current
    ));
  };
}

export function requestDesktopUpdateCheck(): boolean {
  const handler = desktopUpdaterStore.getSnapshot().checkHandler;
  if (!handler) return false;
  handler();
  return true;
}

export function resetDesktopUpdaterStore() {
  desktopUpdaterStore.setState({ checkHandler: null });
}
