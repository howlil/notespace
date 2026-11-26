import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, FileText, Folder, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button, IconButton, SettingRow, SettingSection } from "../../../shared/ui";
import { ConfirmDialog } from "../../../shared/ui/overlays/confirm-dialog";
import {
  deleteTrashedWorkspace,
  exportLibraryBackup,
  listTrash,
  restoreLibraryBackup,
  restoreTrashedWorkspace,
} from "../../../platform/api/workspace-api";
import type { TrashWorkspace } from "../../../platform/api/workspace-api";
import { deleteTrashedNote, listTrashedNotes, restoreTrashedNote, type TrashedNote } from "../../../platform/api/note-api";
import { flushDesktopState } from "../../../platform/runtime/durability-barrier";
import { useToast } from "../../../shared/ui/feedback/toast-provider";
import { notifyLibraryChanged } from "../../../platform/api/library-invalidation";
import { clearImageCache } from "../../../platform/assets/image-store";

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
  const [trash, setTrash] = useState<TrashWorkspace[]>([]);
  const [permanentTarget, setPermanentTarget] = useState<TrashWorkspace | null>(null);
  const [trashedNotes, setTrashedNotes] = useState<TrashedNote[]>([]);
  const [permanentNoteTarget, setPermanentNoteTarget] = useState<TrashedNote | null>(null);
  const [pendingBackupRestore, setPendingBackupRestore] = useState<File | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([listTrash(), listTrashedNotes()])
      .then(([nextTrash, nextTrashedNotes]) => {
        if (!active) return;
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
      const restored = await restoreTrashedWorkspace(item.id);
      setTrash((current) => current.filter((candidate) => candidate.id !== item.id));
      notifyLibraryChanged();
      showToast({
        kind: "success",
        message: restored.restoredToRoot
          ? `Restored ${item.title} to top level (original parent was removed).`
          : `Restored ${item.title}.`,
      });
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

  const trashCount = trash.length + trashedNotes.length;

  return (
    <>
      <div className="divide-y divide-line" aria-label="Library data tools">
        <SettingSection title="Portable library backup" className="pb-3">
          <div className="space-y-2.5">
            <SettingRow
              title="Export library"
              description="Download a ZIP of workspaces, images, and Trash."
              control={(
                <Button asChild variant="primary" size="xs" className="shrink-0">
                  <a href={exportLibraryBackup()} download aria-disabled={mutationBusy || disabled} onClick={(event) => { if (mutationBusy || disabled) event.preventDefault(); }}>
                    <Download size={12} /> Export ZIP
                  </a>
                </Button>
              )}
            />
            <SettingRow
              title="Restore backup"
              description="Replace your current library after confirmation."
              control={(
                <Button variant="secondary" size="xs" className="shrink-0" aria-label="Restore library backup" onClick={() => restoreInput.current?.click()} disabled={loading || disabled}>
                  <Upload size={12} /> Restore
                </Button>
              )}
            />
          </div>
          <input ref={restoreInput} className="hidden" type="file" accept=".zip,.json,application/zip,application/x-zip-compressed,application/json" onChange={(event) => setPendingBackupRestore(event.target.files?.[0] ?? null)} />
        </SettingSection>

        <div className="pb-3">{deviceRecovery}</div>

        <SettingSection
          title="Trash"
          count={loading ? "…" : trashCount}
          countAriaLabel={`${loading ? 0 : trashCount} deleted items`}
          aside={trashCount > 0 ? "Restore or delete permanently" : undefined}
          className="pt-3"
        >
          {trashCount > 0 ? (
            <ul className="max-h-48 divide-y divide-line overflow-y-auto no-scrollbar">
              {trashedNotes.map((item) => (
                <li key={`note-${item.id}`} className="flex items-center gap-2 py-1.5">
                  <FileText size={13} className="shrink-0 text-muted" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm font-medium text-ink">{noteTitle(item)}</strong>
                    <span className="text-xs text-muted">Note · on {item.placementCount} {item.placementCount === 1 ? "canvas" : "canvases"} · deleted {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(item.deletedAt))}</span>
                  </div>
                  <Button variant="secondary" size="xs" aria-label={`Restore ${noteTitle(item)}`} onClick={() => void restoreNote(item)} disabled={loading || disabled}><RotateCcw size={11} /> Restore</Button>
                  <IconButton variant="ghost" size="xs" className="text-muted hover:text-danger" aria-label={`Permanently delete ${noteTitle(item)}`} title={`Permanently delete ${noteTitle(item)}`} onClick={() => setPermanentNoteTarget(item)} disabled={loading || disabled}><Trash2 size={12} /></IconButton>
                </li>
              ))}
              {trash.map((item) => (
                <li key={item.id} className="flex items-center gap-2 py-1.5">
                  <Folder size={13} className="shrink-0 text-muted" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm font-medium text-ink">{item.title}</strong>
                    <span className="text-xs text-muted">{item.parentTitle || (item.parentId ? "Original parent removed" : "Top level")} · deleted {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(item.deletedAt))}</span>
                  </div>
                  <Button variant="secondary" size="xs" aria-label={`Restore ${item.title}`} onClick={() => void restoreWorkspace(item)} disabled={loading || disabled}><RotateCcw size={11} /> Restore</Button>
                  <IconButton variant="ghost" size="xs" className="text-muted hover:text-danger" aria-label={`Permanently delete ${item.title}`} title={`Permanently delete ${item.title}`} onClick={() => setPermanentTarget(item)} disabled={loading || disabled}><Trash2 size={12} /></IconButton>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-1.5 py-1 text-xs text-muted">
              <Trash2 size={12} className="shrink-0 opacity-70" aria-hidden="true" />
              <span>{loading ? "Loading deleted items…" : "Trash is empty."}</span>
            </div>
          )}
        </SettingSection>
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
