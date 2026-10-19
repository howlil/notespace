type FlushDesktopState = () => Promise<void>;

let registeredFlush: FlushDesktopState | null = null;
const pendingMutations = new Set<Promise<unknown>>();
const failedMutations: unknown[] = [];
let quiescenceActive = false;
let sealed = false;

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function registerDesktopFlush(flush: FlushDesktopState) {
  registeredFlush = flush;
  return () => {
    if (registeredFlush === flush) registeredFlush = null;
  };
}

// Every HTTP adapter mutation joins the global durability barrier, including
// activity/task writes that run outside the active Workspace editor.
export function trackDesktopMutation<T>(operation: () => Promise<T>): Promise<T> {
  if (!isTauriRuntime()) return operation();
  if (sealed) return Promise.reject(new Error("Notespace is installing an update; writes are paused"));
  const task = operation();
  pendingMutations.add(task);
  void task.then(() => pendingMutations.delete(task), (error) => {
    pendingMutations.delete(task);
    failedMutations.push(error);
  });
  return task;
}

export async function flushDesktopState() {
  if (registeredFlush) await registeredFlush();
  if (failedMutations.length) throw failedMutations[0];
  // Wait for every in-flight HTTP mutation, not just active editor operations.
  // Settlement matters; rejected writes must fail the flush, not be ignored.
  while (pendingMutations.size) {
    const batch = [...pendingMutations];
    const result = await Promise.allSettled(batch);
    const failed = result.find((value) => value.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    if (failedMutations.length) throw failedMutations[0];
  }
}

// Install/backup must block keyboard and editor input BEFORE awaiting flush.
// Acquiring twice is an error: two quiescing workflows cannot overlap.
export function beginDesktopQuiescence(): () => void {
  if (!isTauriRuntime()) return () => {};
  if (quiescenceActive) throw new Error("A desktop save operation is already in progress");
  quiescenceActive = true;
  sealed = false;
  const block = (event: Event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('[aria-label="Notespace updates"],[data-notespace-settings-root]')) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  };
  const types = ["keydown", "beforeinput", "input", "paste", "drop", "compositionstart", "pointerdown", "click"] as const;
  for (const type of types) window.addEventListener(type, block, true);
  return () => {
    sealed = false;
    quiescenceActive = false;
    for (const type of types) window.removeEventListener(type, block, true);
  };
}

export function sealDesktopWrites() {
  if (!quiescenceActive) throw new Error("Cannot seal editor writes without acquiring quiescence");
  if (pendingMutations.size) throw new Error("Cannot install while HTTP mutations are pending");
  sealed = true;
}

export async function allowDesktopClose() {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("allow_desktop_close");
}

export async function cancelDesktopClose() {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("cancel_desktop_close");
}
