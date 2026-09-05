import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, SquarePen } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, IconButton } from "../../components/ui";
import { contentOf } from "../../domain/project/project";
import type { CategorySummary, ProjectSummary } from "../../domain/project/project";
import { getProject, listCategories, listProjects, saveProject } from "../../domain/project/api";
import { captureTitle, markdownToSnapshot } from "../../domain/document/markdown";
import { useToast } from "../../providers/toast-provider";

const lastWorkspaceKey = "notespace.quick-capture.workspace";

export function QuickCapture() {
  const { showToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workspaces, setWorkspaces] = useState<ProjectSummary[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
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
    void Promise.all([listProjects(), listCategories()])
      .then(([nextWorkspaces, nextCategories]) => {
        if (!active) return;
        setWorkspaces(nextWorkspaces);
        setCategories(nextCategories);
        const preferred = localStorage.getItem(lastWorkspaceKey);
        const selected = nextWorkspaces.find((item) => item.id === preferred)?.id ?? nextWorkspaces[0]?.id ?? "";
        setWorkspaceId(selected);
      })
      .catch((error) => {
        if (active) showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not load workspaces." });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, showToast]);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category.title])), [categories]);

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
              <select
                className="h-9 rounded-md border border-line bg-background px-2.5 text-xs text-ink outline-none focus:border-accent"
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                disabled={loading || saving || workspaces.length === 0}
              >
                {workspaces.length === 0 ? <option value="">{loading ? "Loading…" : "No workspace available"}</option> : null}
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {categoryById.get(workspace.categoryId) ? `${categoryById.get(workspace.categoryId)} / ` : ""}{workspace.title}
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
            <Button type="button" onClick={() => void capture()} disabled={saving || loading || !body.trim() || !workspaceId}>
              {saving ? "Saving…" : "Capture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
