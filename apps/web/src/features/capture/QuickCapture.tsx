import { CAPTURE_QUEUE_CHANGED_EVENT, OPEN_QUICK_CAPTURE_EVENT } from "../../shared/browser/shell-events";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Search, SquarePen } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, IconButton, Input } from "../../shared/ui";
import type { CategorySummary, WorkspaceSummary } from "../../domain/workspace/workspace";
import { createWorkspaceNote, getWorkspace, listAllWorkspaces, listCategories, listRecentWorkspaces } from "../../adapters/http/workspace-api";
import { captureTitle, markdownToSnapshot } from "../../domain/document/markdown";
import { useToast } from "../../shared/ui/toast-provider";
import { createCapture } from "../../adapters/http/capture-api";
import { validCaptureContent } from "../../domain/capture/capture";
import { readLocalStorage, writeLocalStorage } from "../../shared/browser/local-storage";
import { notifyLibraryChanged } from "../../adapters/browser/library-change";
import { workspaceOptions } from "./workspace-options";
import type { CaptureWorkspaceOption } from "./workspace-options";

const lastWorkspaceKey = "notespace.quick-capture.workspace";
const recentWorkspaceLimit = 20;

export function QuickCapture({ showTrigger = true }: { showTrigger?: boolean } = {}) {
  const { showToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [searchWorkspaces, setSearchWorkspaces] = useState<CaptureWorkspaceOption[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [destination, setDestination] = useState<"workspace" | "queue">("workspace");
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    const onOpen = (event: Event) => {
      setDestination(event instanceof CustomEvent && event.detail === "queue" ? "queue" : "workspace");
      setOpen(true);
    };
    window.addEventListener(OPEN_QUICK_CAPTURE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_QUICK_CAPTURE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setDestination("workspace");
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open || destination !== "workspace") {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setWorkspaceQuery("");
    setSearchWorkspaces([]);
    void Promise.all([listRecentWorkspaces(recentWorkspaceLimit), listCategories()])
      .then(async ([recentWorkspaces, nextCategories]) => {
        if (!active) return;
        const preferred = readLocalStorage(lastWorkspaceKey);
        let nextWorkspaces = recentWorkspaces;
        if (preferred && !recentWorkspaces.some((item) => item.id === preferred)) {
          try {
            const remembered = await getWorkspace(preferred);
            nextWorkspaces = [remembered, ...recentWorkspaces];
          } catch {
            // The remembered workspace may have been deleted; fall back to recents.
          }
        }
        if (!active) return;
        setWorkspaces(nextWorkspaces);
        setCategories(nextCategories);
        const selected = nextWorkspaces.find((item) => item.id === preferred)?.id ?? nextWorkspaces[0]?.id ?? "";
        setWorkspaceId(selected);
      })
      .catch((error) => {
        if (active) showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not load workspaces." });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [destination, open, showToast]);

  useEffect(() => {
    if (!open) return;
    const query = workspaceQuery.trim();
    if (!query) {
      setSearching(false);
      setSearchWorkspaces([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void listAllWorkspaces({ query, limit: recentWorkspaceLimit })
        .then((page) => { if (active) setSearchWorkspaces(workspaceOptions(page.items, categories)); })
        .catch((error) => {
          if (active) showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not search workspaces." });
        })
        .finally(() => { if (active) setSearching(false); });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [categories, open, showToast, workspaceQuery]);

  const recentOptions = useMemo(() => workspaceOptions(workspaces, categories), [categories, workspaces]);
  const options = workspaceQuery.trim() ? searchWorkspaces : recentOptions;
  const effectiveWorkspaceId = options.some((option) => option.id === workspaceId) ? workspaceId : options[0]?.id ?? "";

  async function capture() {
    const value = body.trim();
    if (!validCaptureContent(body) || (destination === "workspace" && !effectiveWorkspaceId) || saving) return;
    setSaving(true);
    try {
      if (destination === "queue") {
        await createCapture(body);
        setBody("");
        setOpen(false);
        window.dispatchEvent(new Event(CAPTURE_QUEUE_CHANGED_EVENT));
        showToast({ kind: "success", message: "Saved to Capture Queue." });
        return;
      }
      const workspace = await getWorkspace(effectiveWorkspaceId);
      const document = markdownToSnapshot(value);
      await createWorkspaceNote(workspace.id, {
        id: crypto.randomUUID(),
        title: captureTitle(value),
        document,
      });
      writeLocalStorage(lastWorkspaceKey, workspace.id);
      setWorkspaceId(workspace.id);
      setBody("");
      setOpen(false);
      notifyLibraryChanged();
      showToast({ kind: "success", message: `Captured to ${workspace.title}.` });
    } catch (error) {
      showToast({ kind: "error", message: destination === "queue" ? "Save status unconfirmed. Check Capture Queue before retrying; draft retained." : error instanceof Error ? error.message : "Could not save this capture." });
    } finally {
      setSaving(false);
    }
  }

  async function importMarkdown(file: File | null) {
    if (!file) return;
    try {
      setBody(await file.text());
    } catch {
      showToast({ kind: "error", message: "Could not read this Markdown file." });
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <>
      {showTrigger && <IconButton
        type="button"
        className="size-[30px] text-muted hover:bg-tint hover:text-accent focus-visible:bg-tint focus-visible:text-accent"
        onClick={() => { setDestination("workspace"); setOpen(true); }}
        aria-label="Quick capture"
        title="Quick capture (Ctrl/Cmd + Shift + N)"
      >
        <SquarePen size={16} aria-hidden="true" />
      </IconButton>}
      <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
        <DialogContent className="w-[min(94vw,520px)]">
          <DialogTitle>Quick capture</DialogTitle>
          <DialogDescription>Save a Note to a Workspace, or capture it for organizing later. Shortcut: Ctrl/Cmd + Shift + N.</DialogDescription>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1.5 text-[11px] font-medium text-ink">Destination
              <select className="h-9 rounded-md border border-line bg-background px-2.5 text-xs text-ink outline-none focus:border-accent"
                value={destination} onChange={(event) => setDestination(event.target.value as "workspace" | "queue")} disabled={saving}>
                <option value="workspace">Save Note in Workspace</option>
                <option value="queue">Capture Queue · Organize later</option>
              </select>
            </label>
            {destination === "workspace" && <div className="grid gap-1.5 text-[11px] font-medium text-ink">
              <span>Workspace</span>
              <span className="relative block">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                <Input
                  type="search"
                  aria-label="Search workspaces"
                  className="h-9 bg-background pl-8 pr-2.5 text-xs"
                  placeholder={`Search, or choose from ${recentWorkspaceLimit} recent workspaces`}
                  value={workspaceQuery}
                  onChange={(event) => setWorkspaceQuery(event.target.value)}
                  disabled={loading || saving}
                />
              </span>
              <select
                aria-label="Capture Workspace"
                className="h-9 rounded-md border border-line bg-background px-2.5 text-xs text-ink outline-none focus:border-accent"
                value={effectiveWorkspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                disabled={loading || searching || saving || options.length === 0}
              >
                {options.length === 0 ? <option value="">{loading ? "Loading…" : searching ? "Searching…" : workspaceQuery.trim() ? "No matching workspace" : "No workspace available"}</option> : null}
                {options.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.categoryTitle ? `${workspace.categoryTitle} / ` : ""}{workspace.title}
                  </option>
                ))}
              </select>
            </div>}

            <label className="grid gap-1.5 text-[11px] font-medium text-ink">
              {destination === "queue" ? "Capture" : "Note"}
              <textarea
                autoFocus
                className="min-h-44 resize-y rounded-md border border-line bg-background px-3 py-2.5 text-sm leading-6 text-ink outline-none placeholder:text-muted focus:border-accent"
                placeholder="Write a thought, or paste Markdown…"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void capture();
                  }
                }}
              />
            </label>

            <input
              ref={fileInput}
              className="hidden"
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              onChange={(event) => void importMarkdown(event.target.files?.[0] ?? null)}
            />
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()} disabled={saving}>
                <FileUp size={14} aria-hidden="true" />
                Import Markdown
              </Button>
            </div>
          </div>

          {body.trim() && !validCaptureContent(body) && <p role="alert" className="text-xs text-danger">Content must fit within 64 KiB.</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={() => void capture()} disabled={saving || !validCaptureContent(body) || (destination === "workspace" && (loading || searching || !effectiveWorkspaceId))}>
              {saving ? "Saving…" : destination === "queue" ? "Save to Queue" : "Capture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
