import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FolderUp, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button } from "../../shared/ui";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import { UNCATEGORIZED_CATEGORY_ID, type CategorySummary } from "../../domain/workspace/workspace";
import {
  APIError,
  createWorkspace,
  deleteWorkspace,
  deleteTrashedWorkspace,
  exportLibraryBackup,
  getWorkspace,
  listCategories,
  listTrash,
  restoreLibraryBackup,
  restoreTrashedWorkspace,
} from "../../adapters/http/workspace-api";
import type { TrashWorkspace } from "../../adapters/http/workspace-api";
import { createLocalAssetId, storeImageAsset } from "../../adapters/assets/image-store";
import { saveWorkspace } from "./save-workspace";
import { useToast } from "../../shared/ui/toast-provider";
import { notifyLibraryChanged } from "../../adapters/browser/library-change";
import { importVaultFiles } from "./vault-import-workflow";

export function LibraryTools({ onBusyChange, disabled = false }: {
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
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
  const [categoryId, setCategoryId] = useState("");
  const [trash, setTrash] = useState<TrashWorkspace[]>([]);
  const [permanentTarget, setPermanentTarget] = useState<TrashWorkspace | null>(null);
  const [pendingBackupRestore, setPendingBackupRestore] = useState<File | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const vaultInput = useRef<HTMLInputElement | null>(null);

  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.title])), [categories]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([listCategories(), listTrash()])
      .then(([nextCategories, nextTrash]) => {
        if (!active) return;
        setCategories(nextCategories);
        setTrash(nextTrash);
        setCategoryId((current) => current || nextCategories.find((category) => category.id !== UNCATEGORIZED_CATEGORY_ID)?.id || nextCategories[0]?.id || "");
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
      await restoreLibraryBackup(file);
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
      setTrash((current) => current.filter((candidate) => candidate.id !== item.id));
      showToast({ kind: "success", message: `Permanently deleted ${item.title}.` });
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not permanently delete workspace." });
    } finally {
      setLoading(false);
      setMutationBusy(false);
    }
  }

  async function importVault(fileList: FileList | null) {
    if (!fileList || !categoryId || loading || disabled) return;
    const selected = Array.from(fileList);
    if (!selected.some((file) => /\.(?:md|markdown)$/i.test(file.name))) {
      showToast({ kind: "error", message: "No Markdown files were found in this selection." });
      return;
    }

    setMutationBusy(true);
    setLoading(true);
    try {
      const { imported, failed, cleanupFailed } = await importVaultFiles(selected, categoryId, {
        createWorkspace,
        getWorkspace: async (id) => {
          try {
            return await getWorkspace(id);
          } catch (error) {
            if (error instanceof APIError && error.status === 404) return null;
            throw error;
          }
        },
        deleteWorkspace,
        deleteTrashedWorkspace,
        saveWorkspace,
        createLocalAssetId,
        storeImageAsset,
      });
      showToast({
        kind: failed ? "error" : "success",
        message: failed
          ? `Imported ${imported} Markdown file${imported === 1 ? "" : "s"}; ${failed} failed${cleanupFailed ? `; ${cleanupFailed} partial workspace${cleanupFailed === 1 ? "" : "s"} need manual cleanup` : " and were rolled back"}.`
          : `Imported ${imported} Markdown file${imported === 1 ? "" : "s"}.`,
      });
      if (imported) {
        notifyLibraryChanged();
        window.location.assign("/");
      }
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not import Markdown vault." });
    } finally {
      setLoading(false);
      setMutationBusy(false);
      if (vaultInput.current) vaultInput.current.value = "";
    }
  }

  return (
    <>
      <div className="grid gap-0 border-y border-line" aria-label="Portable library tools">
            <section className="flex items-center justify-between gap-4 border-b border-line py-3">
              <div><h3 className="m-0 text-xs font-medium text-ink">Full-library backup</h3><p className="mt-1 mb-0 text-[10px] leading-4 text-muted">Categories, workspaces, Trash, history, images, and activity sessions.</p></div>
              <div className="flex shrink-0 gap-1.5">
                <Button asChild variant="secondary" size="sm"><a href={exportLibraryBackup()} download aria-disabled={mutationBusy || disabled} onClick={(event) => { if (mutationBusy || disabled) event.preventDefault(); }}><Download size={13} /> Export ZIP</a></Button>
                <Button variant="secondary" size="sm" onClick={() => restoreInput.current?.click()} disabled={loading || disabled}><Upload size={13} /> Restore</Button>
              </div>
              <input ref={restoreInput} className="hidden" type="file" accept=".zip,.json,application/zip,application/x-zip-compressed,application/json" onChange={(event) => setPendingBackupRestore(event.target.files?.[0] ?? null)} />
            </section>

            <section className="grid gap-2 border-b border-line py-3">
              <div className="flex items-center justify-between gap-4">
                <div><h3 className="m-0 text-xs font-medium text-ink">Import Markdown vault</h3><p className="mt-1 mb-0 text-[10px] leading-4 text-muted">One Markdown file becomes one native Workspace. Referenced selected images are copied in.</p></div>
                <Button variant="secondary" size="sm" onClick={() => vaultInput.current?.click()} disabled={loading || disabled || !categoryId}><FolderUp size={13} /> Choose folder</Button>
              </div>
              <select className="h-8 max-w-[260px] rounded-md border border-line bg-background px-2 text-[11px] text-ink outline-none focus:border-accent" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={loading || disabled}>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}
              </select>
              <input
                ref={(node) => { vaultInput.current = node; node?.setAttribute("webkitdirectory", ""); }}
                className="hidden"
                type="file"
                multiple
                onChange={(event) => void importVault(event.target.files)}
              />
            </section>

            <section className="py-3">
              <div className="mb-2 flex items-center justify-between"><div><h3 className="m-0 text-xs font-medium text-ink">Trash</h3><p className="mt-1 mb-0 text-[10px] text-muted">Restore a Workspace or delete it permanently.</p></div><span className="text-[10px] text-muted">{loading ? "…" : trash.length}</span></div>
              {trash.length ? <div className="max-h-52 overflow-auto border-t border-line">
                {trash.map((item) => <div key={item.id} className="flex min-h-11 items-center gap-3 border-b border-line py-2">
                  <div className="min-w-0 flex-1"><strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium text-ink">{item.title}</strong><span className="text-[9px] text-muted">{categoryNames.get(item.categoryId) ?? "Category unavailable"} · deleted {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(item.deletedAt))}</span></div>
                  <Button variant="ghost" size="sm" onClick={() => void restoreWorkspace(item)} disabled={loading || disabled}><RotateCcw size={12} /> Restore</Button>
                  <Button variant="ghost" size="icon" className="text-danger" aria-label={`Permanently delete ${item.title}`} onClick={() => setPermanentTarget(item)} disabled={loading || disabled}><Trash2 size={13} /></Button>
                </div>)}
              </div> : <p className="m-0 border-t border-line py-4 text-[10px] text-muted">Trash is empty.</p>}
            </section>
      </div>

      <ConfirmDialog
        open={pendingBackupRestore !== null}
        title="Replace the entire library?"
        description={pendingBackupRestore
          ? `Restoring "${pendingBackupRestore.name}" will replace your current categories, workspaces, notes, canvas, tasks, activity history and Trash. Download a backup of your current library first. This cannot be undone.`
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
