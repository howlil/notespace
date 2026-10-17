import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { beginDesktopQuiescence, flushDesktopState, isTauriRuntime, sealDesktopWrites } from "../../adapters/browser/desktop-lifecycle";
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

export function DesktopRecoveryTools() {
  const [native, setNative] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState<Point[]>([]);
  const [migrations, setMigrations] = useState<Point[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  useEffect(() => {
    setNative(isTauriRuntime());
  }, []);

  if (!native) return null;

  async function refresh() {
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
  }

  async function backup() {
    if (busy) return;
    setBusy(true);
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
    }
  }

  return (
    <>
      {busy && <div className="fixed inset-0 z-[190] bg-black/10" aria-hidden="true" />}
      <aside className={`fixed left-4 bottom-4 text-xs ${busy ? "z-[191]" : "z-[99]"}`} aria-label="Desktop backup and recovery">
      {!expanded ? (
        <button type="button" className="rounded-full border border-line bg-surface px-3 py-2 text-ink" onClick={() => { setExpanded(true); void refresh(); }}>
          Backups
        </button>
      ) : (
        <section className="w-[min(390px,calc(100vw-2rem))] max-h-[min(75vh,620px)] overflow-auto rounded-xl border border-line bg-surface p-4 text-ink shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Backup &amp; recovery</h2>
            <button type="button" className="rounded-full border border-line px-3 py-1" onClick={() => setExpanded(false)} disabled={busy}>Close</button>
          </div>
          <p className="mt-2 text-muted">
            Your SQLite library stays on this device. Backups are stored next to it;
            copy them to a separate drive for protection from disk failure.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="rounded-full bg-ink px-3 py-2 text-surface disabled:opacity-50" disabled={busy} onClick={() => void backup()}>
              {busy ? "Creating verified backup…" : "Create backup"}
            </button>
            <button type="button" className="rounded-full border border-line px-3 py-2" disabled={busy} onClick={() => void refresh()}>Refresh</button>
          </div>
          {message && <p className="mt-3 whitespace-pre-wrap text-muted" role="status">{message}</p>}
          <h3 className="mt-4 font-medium">Manual SQLite backups ({manual.length})</h3>
          <div className="mt-1 space-y-2">
            {manual.length === 0 && <p className="text-muted">No manual backups yet.</p>}
            {manual.map((point) => <BackupPoint key={point.name} point={point} />)}
          </div>
          <h3 className="mt-4 font-medium">Pre-upgrade snapshots ({migrations.length})</h3>
          <div className="mt-1 space-y-2">
            {migrations.length === 0 && <p className="text-muted">No schema migration snapshots yet.</p>}
            {migrations.map((point) => <BackupPoint key={point.name} point={point} />)}
          </div>
          <p className="mt-4 text-muted">
            Restoration is deliberately offline and manual: quit Notespace, preserve the original
            database and WAL files, and follow the recovery runbook. Nothing is replaced automatically.
          </p>
          {diagnostics && (
            <details className="mt-3 border-t border-line pt-2">
              <summary className="cursor-pointer">Safe diagnostics</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-muted">{JSON.stringify(diagnostics, null, 2)}</pre>
            </details>
          )}
        </section>
      )}
      </aside>
    </>
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
