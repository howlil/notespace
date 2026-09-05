import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Search, SquarePen } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, IconButton } from "../../components/ui";
import { contentOf } from "../../domain/project/project";
import type { CategorySummary, ProjectSummary } from "../../domain/project/project";
import { getProject, listCategories, listRecentWorkspaces, saveProject, searchNotespace } from "../../domain/project/api";
import type { SearchResult } from "../../domain/project/api";
import { captureTitle, markdownToSnapshot } from "../../domain/document/markdown";
import { useToast } from "../../providers/toast-provider";

const lastWorkspaceKey = "notespace.quick-capture.workspace";
const recentWorkspaceLimit = 20;

type CaptureWorkspaceOption = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle?: string;
};

function searchWorkspaceOptions(results: SearchResult[]): CaptureWorkspaceOption[] {
  const seen = new Set<string>();
  const options: CaptureWorkspaceOption[] = [];
  for (const result of results) {
    if (!result.workspaceId || seen.has(result.workspaceId)) continue;
    seen.add(result.workspaceId);
    options.push({
      id: result.workspaceId,
      title: result.workspaceTitle || "Untitled",
      categoryId: result.categoryId ?? "",
      categoryTitle: result.categoryTitle,
    });
  }
  return options;
}

export function QuickCapture() {
  const { showToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workspaces, setWorkspaces] = useState<ProjectSummary[]>([]);
  const [searchWorkspaces, setSearchWorkspaces] = useState<CaptureWorkspaceOption[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setWorkspaceQuery("");
    setSearchWorkspaces([]);
    void Promise.all([listRecentWorkspaces(recentWorkspaceLimit), listCategories()])
      .then(async ([recentWorkspaces, nextCategories]) => {
        if (!active) return;
        const preferred = localStorage.getItem(lastWorkspaceKey);
        let nextWorkspaces = recentWorkspaces;
        if (preferred && !recentWorkspaces.some((item) => item.id === preferred)) {
          try {
            const remembered = await getProject(preferred);
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
  }, [open, showToast]);

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
      void searchNotespace(query)
        .then((results) => {
          if (!active) return;
          const options = searchWorkspaceOptions(results);
          setSearchWorkspaces(options);
          if (options.length && !options.some((option) => option.id === workspaceId)) setWorkspaceId(options[0].id);
        })
        .catch((error) => {
          if (active) showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not search workspaces." });
        })
        .finally(() => { if (active) setSearching(false); });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, showToast, workspaceId, workspaceQuery]);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category.title])), [categories]);
  const options = useMemo<CaptureWorkspaceOption[]>(() => {
    if (workspaceQuery.trim()) return searchWorkspaces;
    return workspaces.map((workspace) => ({
      id: workspace.id,
      title: workspace.title,
      categoryId: workspace.categoryId,
      categoryTitle: categoryById.get(workspace.categoryId),
    }));
  }, [categoryById, searchWorkspaces, workspaceQuery, workspaces]);

  async function capture() {
    const value = body.trim();
    if (!value || !workspaceId || saving) return;
    setSaving(true);
    try {
      const workspace = await getProject(workspaceId);
      const content = contentOf(workspace);
      const document = markdownToSnapshot(value);
      const now = new Date().toISOString();
      const note = {
        id: crypto.randomUUID(),
        title: captureTitle(value),
        document,
        createdAt: now,
        updatedAt: now,
      };
      await saveProject(workspace.id, {
        ...content,
        notes: [...content.notes, note],
        document,
      }, workspace.version);
      localStorage.setItem(lastWorkspaceKey, workspace.id);
      setBody("");
      setOpen(false);
      showToast({ kind: "success", message: `Captured to ${workspace.title}.` });
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not save this capture." });
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
      <IconButton
        type="button"
        className="size-[30px] text-muted hover:bg-tint hover:text-accent focus-visible:bg-tint focus-visible:text-accent"
        onClick={() => setOpen(true)}
        aria-label="Quick capture"
        title="Quick capture (Ctrl/Cmd + Shift + N)"
      >
        <SquarePen size={16} aria-hidden="true" />
      </IconButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(94vw,520px)]">
          <DialogTitle>Quick capture</DialogTitle>
          <DialogDescription>Capture a note without opening a workspace first. Shortcut: Ctrl/Cmd + Shift + N.</DialogDescription>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1.5 text-[11px] font-medium text-ink">
              Workspace
              <span className="relative block">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input
                  type="search"
                  className="h-9 w-full rounded-md border border-line bg-background pl-8 pr-2.5 text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
                  placeholder={`Search, or choose from ${recentWorkspaceLimit} recent workspaces`}
                  value={workspaceQuery}
                  onChange={(event) => setWorkspaceQuery(event.target.value)}
                  disabled={loading || saving}
                />
              </span>
              <select
                className="h-9 rounded-md border border-line bg-background px-2.5 text-xs text-ink outline-none focus:border-accent"
                value={options.some((option) => option.id === workspaceId) ? workspaceId : ""}
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
            </label>

            <label className="grid gap-1.5 text-[11px] font-medium text-ink">
              Note
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

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={() => void capture()} disabled={saving || loading || searching || !body.trim() || !workspaceId}>
              {saving ? "Saving…" : "Capture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
