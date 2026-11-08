import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DatabaseBackup, RefreshCw, ShieldCheck } from "lucide-react";
import { beginDesktopQuiescence, flushDesktopState, sealDesktopWrites } from "../../../adapters/desktop/desktop-lifecycle";
import { createDesktopBackupWith } from "./create-desktop-backup";
import { Button } from "../../../shared/ui";

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
    <section className="py-1" aria-label="Desktop backup and recovery">
      <div className="flex items-start gap-2">
        <DatabaseBackup size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <h4 className="font-medium text-ink">Device recovery</h4>
          <p className="mt-1 text-[10px] leading-4 text-muted">Windows snapshots recover this installation. They are not portable backups.</p>
        </div>
      </div>
      <div className="mt-2 divide-y divide-line border-y border-line">
        <div className="py-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h5 className="font-medium text-ink">Verified SQLite snapshot</h5>
              <p className="mt-1 text-[10px] leading-4 text-muted">Creates a safe copy without replacing the live library. Copy it to another drive for protection against device failure.</p>
            </div>
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void backup()}>
              {busy ? "Creating verified backup…" : "Create SQLite backup"}
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void refresh()}><RefreshCw size={13} /> Refresh list</Button>
          </div>
          {message && <p className="mt-2 whitespace-pre-wrap text-[10px] leading-4 text-muted" role="status">{message}</p>}
        </div>
        <div className="py-2">
          <h5 className="font-medium text-ink">Manual snapshots ({manual.length})</h5>
          <p className="mt-1 text-[10px] leading-4 text-muted">Snapshots you created from this device.</p>
          <div className="mt-2">
            {manual.length === 0 && <p className="text-[10px] text-muted">No manual SQLite snapshots yet.</p>}
            {manual.map((point) => <BackupPoint key={point.name} point={point} />)}
          </div>
        </div>
        <div className="py-2">
          <h5 className="font-medium text-ink">Automatic recovery points ({migrations.length})</h5>
          <p className="mt-1 text-[10px] leading-4 text-muted">Created before database upgrades so the previous state can be recovered offline.</p>
          <div className="mt-2">
            {migrations.length === 0 && <p className="text-[10px] text-muted">No automatic recovery points yet.</p>}
            {migrations.map((point) => <BackupPoint key={point.name} point={point} />)}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-muted">Recovery is manual and offline: quit Notespace, preserve the original database and WAL files, then follow the recovery runbook.</p>
      {diagnostics && (
        <details className="mt-2 border-t border-line pt-2">
          <summary className="cursor-pointer text-[10px] font-medium">Safe diagnostics</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-muted">{JSON.stringify(diagnostics, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}

function BackupPoint({ point }: { point: Point }) {
  return (
    <div className="border-b border-line py-2 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[10px] font-medium text-ink" title={point.name}>{point.name}</p>
        <p className="shrink-0 text-[10px] text-muted">{(point.bytes / (1024 * 1024)).toFixed(2)} MiB</p>
      </div>
      <p className="mt-1 select-text break-all text-[9px] text-muted">{point.path}</p>
    </div>
  );
}
