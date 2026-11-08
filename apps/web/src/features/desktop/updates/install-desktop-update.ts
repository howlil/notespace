// The install boundary is deliberately separate from UI and updater transport.
// Rejecting an autosave prevents invocation of the native installer.
export async function installDesktopUpdateWith(ports: {
  flush: () => Promise<void>;
  install: () => Promise<void>;
}): Promise<void> {
  await ports.flush();
  await ports.install();
}
