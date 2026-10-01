import { isTauriRuntime } from "./desktop-lifecycle.ts";

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function externalUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!EXTERNAL_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Unsupported external URL protocol: ${url.protocol}`);
  }
  return url.toString();
}

/**
 * Opens an external URL without making product code know which host owns it.
 * The browser keeps its normal new-tab behavior; Tauri delegates to the OS.
 */
export async function openExternalUrl(rawUrl: string) {
  const url = externalUrl(rawUrl);
  if (isTauriRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
