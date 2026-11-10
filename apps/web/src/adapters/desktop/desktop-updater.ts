import { isTauriRuntime } from "./desktop-lifecycle.ts";

export async function isDesktopUpdaterEnabled(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("desktop_updater_enabled");
}
