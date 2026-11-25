// Durable backup creation must follow the same pending-editor flush boundary
// as desktop close and signed-update installation. No backup is reported if
// the flush rejects or the SQLite snapshot worker fails.
export async function createDesktopBackupWith<T>(ports: {
  flush: () => Promise<void>;
  snapshot: () => Promise<T>;
}): Promise<T> {
  await ports.flush();
  return ports.snapshot();
}
