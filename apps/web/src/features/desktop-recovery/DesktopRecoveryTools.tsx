import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { beginDesktopQuiescence, flushDesktopState, sealDesktopWrites } from "../../adapters/browser/desktop-lifecycle";
import { createDesktopBackupWith } from "./create-desktop-backup";

type Point = { name: string; path: string; bytes: number };
type Diagnostics = {
  appVersion: string;
  platform: string;
  runtimeActive: boolean;
  recoveryPointCount: number;
  summary: string;
};
function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function DesktopRecoveryTools({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState<Point[]>([]);
  const [migrations, setMigrations] = useState<Point[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [backups, recovery, info] = await Promise.all([
        invoke<Point[]>("list_desktop_manual_backups"),
        invoke<Point[]>("list_desktop_recovery_points"),
        invoke<Diagnostics>("desktop_recovery_diagnostics"),
      ]);
      setManual(backups);
      setMigrations(recovery);
      setDiagnostics(info);
      setMessage("");
    } catch (error) {
      setMessage(describeError(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function backup() {
    if (busy) return;
    setBusy(true);
    onBusyChange(true);
    setMessage("Saving pending changes before backup…");
    let release: (() => void) | null = null;
    try {
      release = beginDesktopQuiescence();
      const created = await createDesktopBackupWith({
        flush: async () => {
          await flushDesktopState();
          sealDesktopWrites();
        },
        snapshot: () => invoke<Point>("create_desktop_manual_backup"),
      });
      setMessage(`Verified SQLite backup created: ${created.name}`);
      try {
        setManual(await invoke<Point[]>("list_desktop_manual_backups"));
      } catch {
        // A listing problem must never be reported as failed backup creation.
        setManual((previous) => [created, ...previous]);
        setMessage(`Verified backup created: ${created.name}. The backup list could not refresh.`);
      }
    } catch (error) {
      setMessage(`Backup was not completed: ${describeError(error)}`);
    } finally {
      release?.();
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <section className="mt-5" aria-label="Desktop backup and recovery">
      <h4 className="font-medium text-ink">Local SQLite snapshots</h4>
      <p className="mt-1 leading-5 text-muted">
        Create a verified snapshot of the library stored on this device.
        Snapshots are saved alongside the database; copy them to another drive
        to protect against disk failure.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full bg-ink px-3 py-2 text-surface disabled:opacity-50"
          disabled={busy}
          onClick={() => void backup()}
        >
          {busy ? "Creating verified backup…" : "Create SQLite backup"}
        </button>
        <button
          type="button"
          className="rounded-full border border-line px-3 py-2 disabled:opacity-50"
          disabled={busy}
          onClick={() => void refresh()}
        >Refresh list</button>
      </div>
      {message && <p className="mt-3 whitespace-pre-wrap text-muted" role="status">{message}</p>}
      <h4 className="mt-5 font-medium text-ink">Manual snapshots ({manual.length})</h4>
      <div className="mt-2 space-y-2">
        {manual.length === 0 && <p className="text-muted">No manual SQLite snapshots yet.</p>}
        {manual.map((point) => <BackupPoint key={point.name} point={point} />)}
      </div>
      <h4 className="mt-5 font-medium text-ink">Pre-upgrade snapshots ({migrations.length})</h4>
      <div className="mt-2 space-y-2">
        {migrations.length === 0 && <p className="text-muted">No migration snapshots yet.</p>}
        {migrations.map((point) => <BackupPoint key={point.name} point={point} />)}
      </div>
      <p className="mt-4 leading-5 text-muted">
        SQLite recovery is intentionally manual and offline: quit Notespace,
        preserve the original database and WAL files, then follow the recovery
        runbook. Creating a backup never overwrites the live library.
      </p>
      {diagnostics && (
        <details className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer">Safe diagnostics</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-muted">{JSON.stringify(diagnostics, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}

function BackupPoint({ point }: { point: Point }) {
  return (
    <div className="rounded-lg border border-line p-2">
      <p className="font-medium break-all">{point.name}</p>
      <p className="text-muted">{(point.bytes / (1024 * 1024)).toFixed(2)} MiB</p>
      <p className="mt-1 select-text break-all text-muted">{point.path}</p>
    </div>
  );
}
