import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button } from "../../../shared/ui";
import { ConfirmDialog } from "../../../shared/ui/overlays/confirm-dialog";
import type { CategorySummary } from "../../../domain/workspace/workspace";
import {
  deleteTrashedWorkspace,
  exportLibraryBackup,
  listCategories,
  listTrash,
  restoreLibraryBackup,
  restoreTrashedWorkspace,
} from "../../../adapters/http/workspace-api";
import type { TrashWorkspace } from "../../../adapters/http/workspace-api";
import { flushDesktopState } from "../../../adapters/desktop/desktop-lifecycle";
import { useToast } from "../../../shared/ui/feedback/toast-provider";
import { notifyLibraryChanged } from "../../../adapters/browser/library-change";
import { clearImageCache } from "../../../adapters/assets/image-store";

export function LibraryTools({ onBusyChange, disabled = false, deviceRecovery }: {
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
  deviceRecovery: ReactNode;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  // Listing categories/Trash is read-only: a slow or failed fetch must never
  // trap the user inside Settings. Only mutations lock modal dismissal.
  const [mutationBusy, setMutationBusy] = useState(false);
  useEffect(() => {
    onBusyChange(mutationBusy);
    return () => onBusyChange(false);
  }, [mutationBusy, onBusyChange]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [trash, setTrash] = useState<TrashWorkspace[]>([]);
  const [permanentTarget, setPermanentTarget] = useState<TrashWorkspace | null>(null);
  const [pendingBackupRestore, setPendingBackupRestore] = useState<File | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.title])), [categories]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([listCategories(), listTrash()])
      .then(([nextCategories, nextTrash]) => {
        if (!active) return;
        setCategories(nextCategories);
        setTrash(nextTrash);
      })
      .catch((error) => {
        if (active) showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not load library tools." });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [showToast]);

  async function restoreBackup(file: File | null) {
    if (!file || loading) return;
    setMutationBusy(true);
    setLoading(true);
    try {
      await flushDesktopState();
      await restoreLibraryBackup(file);
      await clearImageCache();
      showToast({ kind: "success", message: "Library restored from backup." });
      window.location.assign("/");
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not restore this backup." });
    } finally {
      setLoading(false);
      setMutationBusy(false);
      if (restoreInput.current) restoreInput.current.value = "";
    }
  }

  async function restoreWorkspace(item: TrashWorkspace) {
    if (loading || disabled) return;
    setMutationBusy(true);
    setLoading(true);
    try {
      await restoreTrashedWorkspace(item.id);
      setTrash((current) => current.filter((candidate) => candidate.id !== item.id));
      notifyLibraryChanged();
      showToast({ kind: "success", message: `Restored ${item.title}.` });
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not restore workspace." });
    } finally {
      setLoading(false);
      setMutationBusy(false);
    }
  }

  async function permanentlyDelete() {
    const item = permanentTarget;
    if (!item || loading || disabled) return;
    setPermanentTarget(null);
    setMutationBusy(true);
    setLoading(true);
    try {
      await deleteTrashedWorkspace(item.id);
      await clearImageCache(item.id);
      setTrash((current) => current.filter((candidate) => candidate.id !== item.id));
      showToast({ kind: "success", message: `Permanently deleted ${item.title}.` });
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not permanently delete workspace." });
    } finally {
      setLoading(false);
      setMutationBusy(false);
    }
  }

  return (
    <>
      <div className="divide-y divide-line border-y border-line" aria-label="Library data tools">
        <section className="py-2.5" aria-label="Portable library backup">
          <div className="grid gap-2">
            <div>
              <h3 className="m-0 text-xs font-medium text-ink">Portable library backup</h3>
              <p className="mt-1 mb-0 text-[10px] leading-4 text-muted">Use a ZIP to move your library to another device or keep a copy you can restore later.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button asChild variant="secondary" size="sm"><a href={exportLibraryBackup()} download aria-disabled={mutationBusy || disabled} onClick={(event) => { if (mutationBusy || disabled) event.preventDefault(); }}><Download size={13} /> Export ZIP</a></Button>
              <Button variant="secondary" size="sm" aria-label="Restore library backup" onClick={() => restoreInput.current?.click()} disabled={loading || disabled}><Upload size={13} /> Restore backup</Button>
            </div>
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-muted">Includes Workspaces, Canvas content, images, Trash, and history.</p>
          <p className="mt-1 text-[10px] leading-4 text-muted">Restoring a backup replaces your current library.</p>
          <input ref={restoreInput} className="hidden" type="file" accept=".zip,.json,application/zip,application/x-zip-compressed,application/json" onChange={(event) => setPendingBackupRestore(event.target.files?.[0] ?? null)} />
        </section>

        <div className="py-2.5">{deviceRecovery}</div>

        <section className="py-2.5" aria-label="Trash">
          <div className="mb-1.5 flex items-center justify-between"><div><h3 className="m-0 text-xs font-medium text-ink">Trash</h3><p className="mt-1 mb-0 text-[10px] leading-4 text-muted">Restore a Workspace or delete it permanently.</p></div><span className="text-[10px] tabular-nums text-muted">{loading ? "…" : trash.length}</span></div>
          {trash.length ? <div className="max-h-52 overflow-auto border-t border-line">
            {trash.map((item) => <div key={item.id} className="flex min-h-11 items-center gap-3 border-b border-line py-2">
              <div className="min-w-0 flex-1"><strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium text-ink">{item.title}</strong><span className="text-[9px] text-muted">{categoryNames.get(item.categoryId) ?? "Category unavailable"} · deleted {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(item.deletedAt))}</span></div>
              <Button variant="ghost" size="sm" aria-label={`Restore ${item.title}`} onClick={() => void restoreWorkspace(item)} disabled={loading || disabled}><RotateCcw size={12} /> Restore</Button>
              <Button variant="ghost" size="icon" className="text-danger" aria-label={`Permanently delete ${item.title}`} onClick={() => setPermanentTarget(item)} disabled={loading || disabled}><Trash2 size={13} /></Button>
            </div>)}
          </div> : <p className="m-0 border-t border-line py-2 text-[10px] text-muted">{loading ? "Loading deleted Workspaces…" : "No deleted Workspaces."}</p>}
        </section>
      </div>

      <ConfirmDialog
        open={pendingBackupRestore !== null}
        title="Replace the entire library?"
        description={pendingBackupRestore
          ? `Restoring "${pendingBackupRestore.name}" will replace your current categories, workspaces, canvas, tasks, activity history and Trash. Download a backup of your current library first. This cannot be undone.`
          : ""}
        confirmLabel="Replace library"
        onOpenChange={(next) => {
          if (!next && !loading) {
            setPendingBackupRestore(null);
            if (restoreInput.current) restoreInput.current.value = "";
          }
        }}
        onConfirm={() => {
          if (!pendingBackupRestore || loading || disabled) return;
          const selected = pendingBackupRestore;
          setPendingBackupRestore(null);
          void restoreBackup(selected);
        }}
      />
      <ConfirmDialog
        open={permanentTarget !== null}
        title="Delete permanently?"
        description={permanentTarget ? `${permanentTarget.title} and its recoverable authored history/images will be permanently removed. Activity history remains available as historical activity.` : ""}
        confirmLabel="Delete permanently"
        onOpenChange={(next) => { if (!next) setPermanentTarget(null); }}
        onConfirm={() => void permanentlyDelete()}
      />
    </>
  );
}
