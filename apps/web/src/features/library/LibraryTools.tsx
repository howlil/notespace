import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArchiveRestore, Download, FolderUp, RotateCcw, Trash2, Upload } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, IconButton } from "../../components/ui";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { contentOf } from "../../domain/project/project";
import type { CategorySummary } from "../../domain/project/project";
import {
  createProject,
  deleteTrashedWorkspace,
  exportLibraryBackup,
  listCategories,
  listTrash,
  restoreLibraryBackup,
  restoreTrashedWorkspace,
  saveProject,
} from "../../domain/project/api";
import type { TrashWorkspace } from "../../domain/project/api";
import { createLocalAssetId, storeImageAsset } from "../../domain/assets/local-image-assets";
import { useToast } from "../../providers/toast-provider";
import { importedDocumentTitle, markdownWithVaultImages, normalizeVaultPath, resolveVaultReference } from "./vault-import";

function filePath(file: File) {
  return normalizeVaultPath(file.webkitRelativePath || file.name);
}

function findVaultFile(files: Map<string, File>, sourcePath: string) {
  const direct = files.get(sourcePath);
  if (direct) return direct;
  const basename = sourcePath.split("/").pop();
  if (!basename) return null;
  const matches = [...files.entries()].filter(([path]) => path.split("/").pop() === basename);
  return matches.length === 1 ? matches[0][1] : null;
}

export function LibraryTools() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [trash, setTrash] = useState<TrashWorkspace[]>([]);
  const [permanentTarget, setPermanentTarget] = useState<TrashWorkspace | null>(null);
  const [sidebarActions, setSidebarActions] = useState<Element | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const vaultInput = useRef<HTMLInputElement | null>(null);

  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.title])), [categories]);

  useEffect(() => {
    if (pathname.startsWith("/workspaces/") || pathname.startsWith("/projects/")) {
      setSidebarActions(null);
      return;
    }

    const syncSidebarActions = () => {
      const next = document.querySelector('[aria-label="Library actions"]');
      setSidebarActions((current) => current === next ? current : next);
    };

    syncSidebarActions();
    const observer = new MutationObserver(syncSidebarActions);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    void Promise.all([listCategories(), listTrash()])
      .then(([nextCategories, nextTrash]) => {
        if (!active) return;
        setCategories(nextCategories);
        setTrash(nextTrash);
        setCategoryId((current) => current || nextCategories.find((category) => category.id !== "legacy")?.id || nextCategories[0]?.id || "");
      })
      .catch((error) => {
        if (active) showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not load library tools." });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, showToast]);

  async function restoreBackup(file: File | null) {
    if (!file) return;
    setLoading(true);
    try {
      await restoreLibraryBackup(file);
      showToast({ kind: "success", message: "Library restored from backup." });
      window.location.assign("/");
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not restore this backup." });
    } finally {
      setLoading(false);
      if (restoreInput.current) restoreInput.current.value = "";
    }
  }

  async function restoreWorkspace(item: TrashWorkspace) {
    setLoading(true);
    try {
      await restoreTrashedWorkspace(item.id);
      setTrash((current) => current.filter((candidate) => candidate.id !== item.id));
      showToast({ kind: "success", message: `Restored ${item.title}.` });
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not restore workspace." });
    } finally {
      setLoading(false);
    }
  }

  async function permanentlyDelete() {
    const item = permanentTarget;
    if (!item) return;
    setPermanentTarget(null);
    setLoading(true);
    try {
      await deleteTrashedWorkspace(item.id);
      setTrash((current) => current.filter((candidate) => candidate.id !== item.id));
      showToast({ kind: "success", message: `Permanently deleted ${item.title}.` });
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not permanently delete workspace." });
    } finally {
      setLoading(false);
    }
  }

  async function importVault(fileList: FileList | null) {
    if (!fileList || !categoryId) return;
    const selected = Array.from(fileList);
    const markdownFiles = selected.filter((file) => /\.(?:md|markdown)$/i.test(file.name));
    const filesByPath = new Map(selected.map((file) => [filePath(file), file]));
    if (!markdownFiles.length) {
      showToast({ kind: "error", message: "No Markdown files were found in this selection." });
      return;
    }

    setLoading(true);
    let imported = 0;
    let failed = 0;
    for (const markdownFile of markdownFiles) {
      try {
        const path = filePath(markdownFile);
        const markdown = await markdownFile.text();
        const plannedAssets = new Map<string, { id: string; file: File }>();
        const document = markdownWithVaultImages(markdown, (source) => {
          const resolvedPath = resolveVaultReference(path, source);
          if (!resolvedPath) return null;
          const imageFile = findVaultFile(filesByPath, resolvedPath);
          if (!imageFile || !imageFile.type.startsWith("image/")) return null;
          let planned = plannedAssets.get(resolvedPath);
          if (!planned) {
            planned = { id: createLocalAssetId(), file: imageFile };
            plannedAssets.set(resolvedPath, planned);
          }
          return { assetId: planned.id, src: `notespace-asset://${planned.id}` };
        });
        const title = importedDocumentTitle(path, markdown);
        const workspace = await createProject(title, categoryId);
        for (const asset of plannedAssets.values()) {
          await storeImageAsset(workspace.id, asset.id, asset.file);
        }
        const content = contentOf(workspace);
        const now = new Date().toISOString();
        const seedNote = content.notes[0];
        await saveProject(workspace.id, {
          ...content,
          title,
          document,
          notes: [{ ...seedNote, title, document, updatedAt: now }],
        }, workspace.version);
        imported += 1;
      } catch {
        failed += 1;
      }
    }
    setLoading(false);
    if (vaultInput.current) vaultInput.current.value = "";
    showToast({
      kind: failed ? "error" : "success",
      message: failed ? `Imported ${imported} Markdown file${imported === 1 ? "" : "s"}; ${failed} failed.` : `Imported ${imported} Markdown file${imported === 1 ? "" : "s"}.`,
    });
    if (imported) window.location.assign("/");
  }

  if (pathname.startsWith("/workspaces/") || pathname.startsWith("/projects/")) return null;

  return (
    <>
      {sidebarActions ? createPortal(
        <IconButton
          type="button"
          className="size-[30px] text-muted hover:bg-tint hover:text-accent focus-visible:bg-tint focus-visible:text-accent"
          onClick={() => setOpen(true)}
          aria-label="Library tools"
          title="Library tools"
        >
          <ArchiveRestore size={16} aria-hidden="true" />
        </IconButton>,
        sidebarActions,
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(94vw,620px)]">
          <DialogTitle>Library tools</DialogTitle>
          <DialogDescription>Recover deleted work, own a complete backup, or migrate an existing Markdown vault.</DialogDescription>

          <div className="mt-4 grid gap-0 border-y border-line">
            <section className="flex items-center justify-between gap-4 border-b border-line py-3">
              <div><h3 className="m-0 text-xs font-medium text-ink">Full-library backup</h3><p className="mt-1 mb-0 text-[10px] leading-4 text-muted">Categories, workspaces, Trash, history, images, and study sessions.</p></div>
              <div className="flex shrink-0 gap-1.5">
                <Button asChild variant="secondary" size="sm"><a href={exportLibraryBackup()} download><Download size={13} /> Backup</a></Button>
                <Button variant="secondary" size="sm" onClick={() => restoreInput.current?.click()} disabled={loading}><Upload size={13} /> Restore</Button>
              </div>
              <input ref={restoreInput} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void restoreBackup(event.target.files?.[0] ?? null)} />
            </section>

            <section className="grid gap-2 border-b border-line py-3">
              <div className="flex items-center justify-between gap-4">
                <div><h3 className="m-0 text-xs font-medium text-ink">Import Markdown vault</h3><p className="mt-1 mb-0 text-[10px] leading-4 text-muted">One Markdown file becomes one native Workspace. Referenced selected images are copied in.</p></div>
                <Button variant="secondary" size="sm" onClick={() => vaultInput.current?.click()} disabled={loading || !categoryId}><FolderUp size={13} /> Choose folder</Button>
              </div>
              <select className="h-8 max-w-[260px] rounded-md border border-line bg-background px-2 text-[11px] text-ink outline-none focus:border-accent" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={loading}>
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
                  <Button variant="ghost" size="sm" onClick={() => void restoreWorkspace(item)} disabled={loading}><RotateCcw size={12} /> Restore</Button>
                  <Button variant="ghost" size="icon" className="text-danger" aria-label={`Permanently delete ${item.title}`} onClick={() => setPermanentTarget(item)} disabled={loading}><Trash2 size={13} /></Button>
                </div>)}
              </div> : <p className="m-0 border-t border-line py-4 text-[10px] text-muted">Trash is empty.</p>}
            </section>
          </div>

          <DialogFooter><Button variant="secondary" onClick={() => setOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={permanentTarget !== null}
        title="Delete permanently?"
        description={permanentTarget ? `${permanentTarget.title} and its recoverable authored history/images will be permanently removed. Study history remains as historical activity.` : ""}
        confirmLabel="Delete permanently"
        onOpenChange={(next) => { if (!next) setPermanentTarget(null); }}
        onConfirm={() => void permanentlyDelete()}
      />
    </>
  );
}
