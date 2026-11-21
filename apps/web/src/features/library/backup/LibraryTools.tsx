import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Archive, Download, Info, RotateCcw, Trash2, Upload } from "lucide-react";
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
import { deleteTrashedNote, listTrashedNotes, restoreTrashedNote, type TrashedNote } from "../../../adapters/http/note-api";
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
  const [trashedNotes, setTrashedNotes] = useState<TrashedNote[]>([]);
  const [permanentNoteTarget, setPermanentNoteTarget] = useState<TrashedNote | null>(null);
  const [pendingBackupRestore, setPendingBackupRestore] = useState<File | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.title])), [categories]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([listCategories(), listTrash(), listTrashedNotes()])
      .then(([nextCategories, nextTrash, nextTrashedNotes]) => {
        if (!active) return;
        setCategories(nextCategories);
        setTrash(nextTrash);
        setTrashedNotes(nextTrashedNotes);
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

  const noteTitle = (item: TrashedNote) => item.label.trim() || "Untitled Note";

  async function restoreNote(item: TrashedNote) {
    if (loading || disabled) return;
    setMutationBusy(true);
    setLoading(true);
    try {
      await restoreTrashedNote(item.id);
      setTrashedNotes((current) => current.filter((candidate) => candidate.id !== item.id));
      notifyLibraryChanged();
      showToast({ kind: "success", message: `Restored ${noteTitle(item)}.` });
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not restore note." });
    } finally {
      setLoading(false);
      setMutationBusy(false);
    }
  }

  async function permanentlyDeleteNote() {
    const item = permanentNoteTarget;
    if (!item || loading || disabled) return;
    setPermanentNoteTarget(null);
    setMutationBusy(true);
    setLoading(true);
    try {
      await deleteTrashedNote(item.id);
      setTrashedNotes((current) => current.filter((candidate) => candidate.id !== item.id));
      notifyLibraryChanged();
      showToast({ kind: "success", message: `Permanently deleted ${noteTitle(item)}.` });
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not permanently delete note." });
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
      <div className="grid gap-3" aria-label="Library data tools">
        <section className="rounded-lg border border-line bg-surface p-3" aria-label="Portable library backup">
          <div className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-tint text-accent" aria-hidden="true"><Archive size={15} /></span>
            <div className="min-w-0">
              <h3 className="m-0 text-xs font-medium text-ink">Portable library backup</h3>
              <p className="mt-0.5 mb-0 text-[11px] leading-4 text-muted">Move your library to another device or keep a copy you can restore later.</p>
            </div>
          </div>
          <p className="mt-2.5 mb-0 text-[11px] leading-4 text-muted">Includes Workspaces, Canvas content, images, Trash, and history.</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Button asChild variant="primary" size="sm"><a href={exportLibraryBackup()} download aria-disabled={mutationBusy || disabled} onClick={(event) => { if (mutationBusy || disabled) event.preventDefault(); }}><Download size={13} /> Export ZIP</a></Button>
            <Button variant="secondary" size="sm" aria-label="Restore library backup" onClick={() => restoreInput.current?.click()} disabled={loading || disabled}><Upload size={13} /> Restore backup</Button>
          </div>
          <p className="mt-2.5 mb-0 flex items-start gap-1.5 rounded-md bg-tint px-2 py-1.5 text-[11px] leading-4 text-muted"><Info size={12} className="mt-px shrink-0" aria-hidden="true" /><span>Restoring a backup replaces your current library.</span></p>
          <input ref={restoreInput} className="hidden" type="file" accept=".zip,.json,application/zip,application/x-zip-compressed,application/json" onChange={(event) => setPendingBackupRestore(event.target.files?.[0] ?? null)} />
        </section>

        {deviceRecovery}

        <section className="rounded-lg border border-line bg-surface p-3" aria-label="Trash">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-tint text-muted" aria-hidden="true"><Trash2 size={15} /></span>
              <div className="min-w-0">
                <h3 className="m-0 text-xs font-medium text-ink">Trash</h3>
                <p className="mt-0.5 mb-0 text-[11px] leading-4 text-muted">Restore a Workspace or Note, or delete it permanently.</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-tint px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted" aria-label={`${loading ? 0 : trash.length + trashedNotes.length} deleted items`}>{loading ? "…" : trash.length + trashedNotes.length}</span>
          </div>
          {trash.length || trashedNotes.length ? <ul className="mt-2.5 grid max-h-52 gap-1 overflow-auto">
            {trashedNotes.map((item) => <li key={`note-${item.id}`} className="flex min-h-11 items-center gap-2 rounded-md border border-line px-2.5 py-1.5">
              <div className="min-w-0 flex-1"><strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium text-ink">{noteTitle(item)}</strong><span className="text-[11px] text-muted">Note · on {item.placementCount} {item.placementCount === 1 ? "canvas" : "canvases"} · deleted {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(item.deletedAt))}</span></div>
              <Button variant="secondary" size="sm" aria-label={`Restore ${noteTitle(item)}`} onClick={() => void restoreNote(item)} disabled={loading || disabled}><RotateCcw size={12} /> Restore</Button>
              <Button variant="ghost" size="icon" className="text-danger" aria-label={`Permanently delete ${noteTitle(item)}`} onClick={() => setPermanentNoteTarget(item)} disabled={loading || disabled}><Trash2 size={13} /></Button>
            </li>)}
            {trash.map((item) => <li key={item.id} className="flex min-h-11 items-center gap-2 rounded-md border border-line px-2.5 py-1.5">
              <div className="min-w-0 flex-1"><strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium text-ink">{item.title}</strong><span className="text-[11px] text-muted">{categoryNames.get(item.categoryId) ?? "Category unavailable"} · deleted {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(item.deletedAt))}</span></div>
              <Button variant="secondary" size="sm" aria-label={`Restore ${item.title}`} onClick={() => void restoreWorkspace(item)} disabled={loading || disabled}><RotateCcw size={12} /> Restore</Button>
              <Button variant="ghost" size="icon" className="text-danger" aria-label={`Permanently delete ${item.title}`} onClick={() => setPermanentTarget(item)} disabled={loading || disabled}><Trash2 size={13} /></Button>
            </li>)}
          </ul> : <p className="mt-2.5 mb-0 rounded-md border border-dashed border-line px-2.5 py-3 text-center text-[11px] text-muted">{loading ? "Loading deleted items…" : "Trash is empty."}</p>}
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
      <ConfirmDialog
        open={permanentNoteTarget !== null}
        title="Delete Note permanently?"
        description={permanentNoteTarget ? `${noteTitle(permanentNoteTarget)} will be permanently removed. Canvas cards that showed it will report it as no longer available.` : ""}
        confirmLabel="Delete permanently"
        onOpenChange={(next) => { if (!next) setPermanentNoteTarget(null); }}
        onConfirm={() => void permanentlyDeleteNote()}
      />
    </>
  );
}
