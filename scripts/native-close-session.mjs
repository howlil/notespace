// WebView2 may tear down EdgeDriver's DevTools connection when the ONLY
// Tauri webview closes. This is an expected transport outcome *only during a
// requested native close*. Callers must still prove sidecar shutdown and
// persisted data independently; never use this for a general WebDriver error.
export function isExpectedNativeCloseDisconnect(error) {
  const message = String(error?.message ?? error);
  return /\bno such window\b|\binvalid session id\b|\btarget window already closed\b/i.test(message)
    || (/disconnected:\s*not connected to DevTools/i.test(message)
      && /failed to check if window was closed/i.test(message));
}
