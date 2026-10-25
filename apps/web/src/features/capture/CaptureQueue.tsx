import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Inbox, LoaderCircle, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, Input } from "../../shared/ui";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import { useToast } from "../../shared/ui/toast-provider";
import { notifyLibraryChanged } from "../../adapters/browser/library-change";
import { createCapture, deleteCapture, getCapture, listCaptures, organizeCapture, updateCapture } from "../../adapters/http/capture-api";
import { listAllWorkspaces } from "../../adapters/http/workspace-api";
import { markdownToSnapshot } from "../../domain/document/markdown";
import { validCaptureContent } from "../../domain/capture/capture";
import { CAPTURE_QUEUE_CHANGED_EVENT } from "../../shared/browser/shell-events";
import type { CaptureItem } from "../../domain/capture/capture";
import type { WorkspaceSummary } from "../../domain/workspace/workspace";
import { workspaceOptionLabel } from "../../domain/workspace/workspace-option-label";
import { APIError } from "../../adapters/http/client";

async function loadAllWorkspaceOptions(): Promise<WorkspaceSummary[]> {
  const results: WorkspaceSummary[] = [];
  let offset = 0;
  while (true) {
    const page = await listAllWorkspaces({ offset, limit: 100 });
    results.push(...page.items);
    if (page.nextOffset == null || page.nextOffset <= offset) return results;
    offset = page.nextOffset;
  }
}

/**
 * The server owns durable capture items. Existing unassigned Tasks retain their
 * original IDs and appear as Tasks to organize within this destination.
 */
export function CaptureQueue() {
  const { showToast } = useToast();
  const [items, setItems] = useState<CaptureItem[]>([]);
  const writeRevision = useRef(0);
  const readSequence = useRef(0);
  const organizerRequest = useRef(0);
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [target, setTarget] = useState<CaptureItem | null>(null);
  const [mode, setMode] = useState<"organize" | "edit">("organize");
  const [editBody, setEditBody] = useState("");
  const [editConflict, setEditConflict] = useState<string | null>(null);
  const [kind, setKind] = useState<"note" | "task">("note");
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [search, setSearch] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CaptureItem | null>(null);

  const options = useMemo(() => workspaces.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase())), [search, workspaces]);

  const refresh = useCallback(async () => {
    const revision = writeRevision.current;
    const readId = ++readSequence.current;
    setRefreshing(true);
    try {
      const current = await listCaptures();
      if (readId === readSequence.current && revision === writeRevision.current) {
        setItems(current);
        setLoadError(false);
        setLoaded(true);
      } else if (readId === readSequence.current) {
        // A mutation superseded this fetch; fetch the complete authoritative
        // queue again instead of rendering only the optimistic new item.
        window.dispatchEvent(new Event(CAPTURE_QUEUE_CHANGED_EVENT));
      }
    } catch (error) {
      if (readId === readSequence.current && revision === writeRevision.current) {
        setLoadError(true);
        setLoaded(true);
        showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not refresh captures." });
      }
    } finally { if (readId === readSequence.current) setRefreshing(false); }
  }, [showToast]);

  useEffect(() => {
    const onChange = () => { void refresh(); };
    window.addEventListener(CAPTURE_QUEUE_CHANGED_EVENT, onChange);
    void refresh();
    return () => window.removeEventListener(CAPTURE_QUEUE_CHANGED_EVENT, onChange);
  }, [refresh]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validCaptureContent(body) || creating) return;
    setCreating(true);
    try {
      const created = await createCapture(body);
      writeRevision.current++;
      setItems((current) => [created, ...current]);
      setLoaded(true);
      setBody("");
      showToast({ kind: "success", message: "Saved to Capture Queue." });
    } catch {
      // The server might have committed before the response failed. Keep the
      // user's exact draft and never issue an automatic duplicate POST.
      showToast({ kind: "error", message: "Save not confirmed. Refresh the queue before submitting again; your draft is preserved." });
    } finally { setCreating(false); }
  }

  async function open(item: CaptureItem, nextMode: "organize" | "edit") {
    const requestId = ++organizerRequest.current;
    setTarget(item);
    setMode(nextMode);
    setEditBody(item.content);
    setEditConflict(null);
    setKind("note");
    setWorkspaceId("");
    setSearch("");
    setWorkspaceError(false);
    if (nextMode !== "organize") return;
    setWorkspaceLoading(true);
    try {
      const all = await loadAllWorkspaceOptions();
      if (organizerRequest.current !== requestId) return;
      setWorkspaces(all);
      setWorkspaceId("");
    } catch {
      if (organizerRequest.current !== requestId) return;
      setWorkspaceError(true);
      showToast({ kind: "error", message: "Unable to load workspaces. Retry before organizing." });
    } finally { if (organizerRequest.current === requestId) setWorkspaceLoading(false); }
  }

  async function saveEdit() {
    if (!target || !validCaptureContent(editBody) || submitting) return;
    setSubmitting(true);
    try {
      const updated = await updateCapture(target.id, target.version, editBody);
      writeRevision.current++;
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      setTarget(null);
      setEditConflict(null);
      showToast({ kind: "success", message: "Capture updated." });
    } catch (error) {
      if (error instanceof APIError && error.status === 409) {
        try {
          const latest = await getCapture(target.id);
          if (latest.status !== "pending") {
            setTarget(null);
            void refresh();
            showToast({ kind: "error", message: "Capture was organized elsewhere. Your local draft was not saved." });
            return;
          }
          // Keep the user's unsaved text; a second explicit click is required
          // before overwriting the now-current server version.
          setTarget(latest);
          setEditConflict(latest.content);
          showToast({ kind: "error", message: "Capture changed in another session. Review both versions before choosing Overwrite latest." });
          return;
        } catch {
          showToast({ kind: "error", message: "Could not reload the conflicting capture. Your draft is preserved." });
          return;
        }
      }
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Update failed. Your edit is preserved." });
    } finally { setSubmitting(false); }
  }

  async function organize() {
    if (!target || !options.some((item) => item.id === workspaceId) || submitting || workspaceLoading || workspaceError) return;
    const current = target;
    const requestedKind = kind;
    const destination = workspaceId;
    setSubmitting(true);
    try {
      const result = await organizeCapture(current.id, {
        version: current.version,
        workspaceId: destination,
        kind: requestedKind,
        ...(requestedKind === "note" ? { document: markdownToSnapshot(current.content) } : {}),
      });
      if (result.status !== "converted") throw new Error("Capture conversion was not confirmed.");
      writeRevision.current++;
      setItems((previous) => previous.filter((item) => item.id !== current.id));
      setTarget(null);
      notifyLibraryChanged();
      showToast({ kind: "success", message: `Organized as ${requestedKind} in Workspace.` });
    } catch (error) {
      // Resolve the authoritative receipt after a possible lost commit response.
      try {
        const actual = await getCapture(current.id);
        if (actual.status === "converted" && actual.targetWorkspaceId === destination && actual.targetKind === requestedKind) {
          writeRevision.current++;
          setItems((previous) => previous.filter((item) => item.id !== current.id));
          setTarget(null);
          notifyLibraryChanged();
          showToast({ kind: "success", message: "Capture already organized. No duplicate was created." });
          return;
        }
        if (actual.status === "converted") {
          setTarget(null);
          void refresh();
          showToast({ kind: "error", message: "Capture was organized elsewhere. Queue refreshed." });
          return;
        }
        setTarget(actual);
      } catch {
        showToast({ kind: "error", message: "Unable to confirm conversion. Refresh before retrying; Capture is not discarded." });
        return;
      }
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Conversion failed. Capture remains in queue." });
    } finally { setSubmitting(false); }
  }

  async function remove() {
    if (!deleteTarget || submitting) return;
    const selected = deleteTarget;
    setSubmitting(true);
    try {
      await deleteCapture(selected.id, selected.version);
      writeRevision.current++;
      setItems((previous) => previous.filter((item) => item.id !== selected.id));
      setDeleteTarget(null);
      showToast({ kind: "success", message: "Capture deleted." });
    } catch {
      // A DELETE can have committed even when its response was lost.
      try {
        await getCapture(selected.id);
        showToast({ kind: "error", message: "Delete not confirmed. Refresh and try again." });
      } catch {
        await refresh();
        setDeleteTarget(null);
      }
    } finally { setSubmitting(false); }
  }

  return (
    <section aria-labelledby="capture-queue-title" className="mx-auto w-full max-w-[820px] px-6 pt-8 max-[800px]:px-5 max-[560px]:p-4 max-[560px]:pt-5">
      <header className="mb-5 border-b border-line pb-4">
        <div className="flex items-center gap-2 text-accent"><Inbox size={15} aria-hidden="true" />
          <p className="m-0 text-[10px] font-medium uppercase tracking-[.12em]">Unorganized</p></div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h1 id="capture-queue-title" className="m-0 text-[28px] font-medium tracking-[-.7px] text-ink">Capture Queue</h1>
          <Button type="button" size="sm" variant="secondary" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw size={13} aria-hidden="true" />{refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        <p className="mt-2 mb-0 text-[11px] text-muted">Capture first, assign a Workspace when you're ready. Items here are not Tasks or Notes yet.</p>
      </header>
      <form className="mb-5 flex items-center gap-2 border-b border-line pb-4" onSubmit={(event) => void add(event)}>
        <Plus size={16} className="shrink-0 text-muted" aria-hidden="true" />
        <Input aria-label="Capture an unorganized thought" className="min-h-9 flex-1 rounded-none border-0 bg-transparent px-0 text-[12px] focus:border-transparent"
          value={body} onChange={(event) => setBody(event.target.value)} placeholder="Capture an idea, task, or Markdown…" disabled={creating} />
        <Button size="sm" className="!min-h-8 px-3 text-[10px]" disabled={!validCaptureContent(body) || creating}>
          {creating ? "Saving…" : "Capture"}
        </Button>
      </form>
      {body.trim() && !validCaptureContent(body) && <p role="alert" className="mb-3 text-xs text-danger">Use nonempty content no larger than 64 KiB.</p>}
      {loadError && <p role="alert" className="mb-3 text-xs text-danger">Queue may be out of date. Refresh to reconcile the server state.</p>}
      <div className="mb-2 flex items-center justify-between"><h2 className="m-0 text-[11px] font-semibold text-ink">Waiting to organize</h2>
        <span className="text-[10px] text-muted">{items.length} items</span></div>
      {!loaded ? <p role="status" aria-live="polite" className="border-t border-line py-6 text-center text-xs text-muted">Loading Capture Queue…</p> : loadError && items.length === 0
        ? <div role="alert" className="border-t border-line py-6 text-center text-xs text-danger">Queue could not be loaded. Use Refresh to retry.</div> : items.length === 0
        ? <div className="rounded-lg border border-dashed border-line p-7 text-center">
            <Inbox size={24} className="mx-auto text-muted" aria-hidden="true" />
            <p className="mt-2 text-[12px] font-medium text-ink">Queue is clear</p>
            <p className="mt-1 text-[11px] text-muted">Capture an idea here or via global Quick Capture.</p>
          </div>
        : <div className="border-t border-line">
            {items.map((item) => <div key={item.id} className="group flex items-start gap-3 border-b border-line py-3">
              <div className="min-w-0 flex-1"><p className="m-0 whitespace-pre-wrap break-words text-[12px] text-ink">{item.content.length > 280 ? item.content.slice(0, 280) + "…" : item.content}</p>
                <span className="mt-1 block text-[10px] text-muted">Unassigned · {new Date(item.createdAt).toLocaleDateString()}</span></div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <Button size="sm" variant="secondary" onClick={() => void open(item, "organize")}><ArrowRight size={13} aria-hidden="true" />Organize</Button>
                <Button size="sm" variant="ghost" aria-label={`Edit capture ${item.id}`} onClick={() => void open(item, "edit")}><Pencil size={13} aria-hidden="true" /></Button>
                <Button size="sm" variant="ghost" aria-label={`Delete capture ${item.id}`} onClick={() => setDeleteTarget(item)}><Trash2 size={13} aria-hidden="true" /></Button>
              </div>
            </div>)}
          </div>}
      <Dialog open={target !== null} onOpenChange={(next) => { if (!next && !submitting) { organizerRequest.current++; setTarget(null); setEditConflict(null); } }}>
        <DialogContent className="w-[min(94vw,520px)]">
          <DialogTitle>{mode === "edit" ? "Edit capture" : "Organize capture"}</DialogTitle>
          <DialogDescription>{mode === "edit" ? "Save the revised intake item." : "Convert to a Note or Task owned by a Workspace."}</DialogDescription>
          {mode === "edit"
            ? <label className="mt-4 grid gap-1 text-[11px] font-medium">Captured content
                <textarea autoFocus value={editBody} onChange={(event) => setEditBody(event.target.value)}
                  className="min-h-36 resize-y rounded-md border border-line bg-background p-3 text-xs leading-5 outline-none focus:border-accent" />
              </label>
            : <>
                <p className="mt-3 max-h-20 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-canvas p-3 text-xs">{target?.content}</p>
                <label className="mt-3 grid gap-1.5 text-[11px] font-medium">Save as
                  <select value={kind} onChange={(event) => setKind(event.target.value as "note" | "task")} disabled={submitting}
                    className="min-h-9 rounded-md border border-line bg-background px-3 text-xs">
                    <option value="note">Note</option><option value="task">Task</option>
                  </select>
                </label>
                <label className="mt-3 grid gap-1.5 text-[11px] font-medium">Find Workspace
                  <Input type="search" placeholder="Filter workspaces…" className="min-h-9 text-xs" value={search} onChange={(event) => { setSearch(event.target.value); setWorkspaceId(""); }} disabled={submitting} />
                </label>
                <label className="mt-3 grid gap-1.5 text-[11px] font-medium">Workspace (required)
                  <select value={options.some((item) => item.id === workspaceId) ? workspaceId : ""} onChange={(event) => setWorkspaceId(event.target.value)}
                    disabled={workspaceLoading || submitting || workspaceError}
                    className="min-h-9 rounded-md border border-line bg-background px-3 text-xs">
                    <option value="">{workspaceLoading ? "Loading workspaces…" : options.length === 0 ? "No matching Workspace" : "Select Workspace"}</option>
                    {options.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspaceOptionLabel(workspace, workspaces)}</option>)}
                  </select>
                </label>
                {workspaceError && <Button className="mt-3" variant="secondary" onClick={() => { if (target) void open(target, "organize"); }}>Retry loading Workspaces</Button>}
                {kind === "task" && target && [...target.content].length > 4000 &&
                  <p className="mt-2 text-xs text-danger" role="alert">Task descriptions are limited to 4,000 characters. Edit this capture first or save it as a Note.</p>}
              </>}
          {mode === "edit" && editConflict !== null && <div role="alert" className="mt-3 grid gap-2 text-xs text-danger">
            <p>This Capture changed in another session. Your unsaved draft is still above.</p>
            <p className="whitespace-pre-wrap rounded-md border border-line bg-canvas p-2 text-ink">Latest saved: {editConflict}</p>
            <Button type="button" size="sm" variant="secondary" onClick={() => { setEditBody(editConflict); setEditConflict(null); }}>Use latest saved version</Button>
          </div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { organizerRequest.current++; setTarget(null); setEditConflict(null); }} disabled={submitting}>Cancel</Button>
            <Button onClick={() => void (mode === "edit" ? saveEdit() : organize())}
              disabled={submitting || (mode === "edit" ? !validCaptureContent(editBody) : !options.some((item) => item.id === workspaceId) || workspaceLoading || workspaceError || (kind === "task" && [...(target?.content ?? "")].length > 4000))}>
              {submitting ? <LoaderCircle className="animate-spin" size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
              {submitting ? "Saving…" : mode === "edit" ? editConflict !== null ? "Overwrite latest" : "Save changes" : "Organize"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={deleteTarget !== null} title="Delete capture?" description="This removes the unorganized item. Converted Notes and Tasks cannot be removed from this queue."
        confirmLabel="Delete capture" onOpenChange={(open) => { if (!open && !submitting) setDeleteTarget(null); }} onConfirm={() => void remove()} />
    </section>
  );
}
