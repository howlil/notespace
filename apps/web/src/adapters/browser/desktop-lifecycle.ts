type FlushDesktopState = () => Promise<void>;

let registeredFlush: FlushDesktopState | null = null;

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function registerDesktopFlush(flush: FlushDesktopState) {
  registeredFlush = flush;
  return () => {
    if (registeredFlush === flush) registeredFlush = null;
  };
}

export async function flushDesktopState() {
  await registeredFlush?.();
}

export async function allowDesktopClose() {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("allow_desktop_close");
}

export async function cancelDesktopClose() {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("cancel_desktop_close");
}
