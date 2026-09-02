import { useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { FileText, Layers, Pencil, Plus } from "lucide-react";
import { Sidebar } from "../../app/Sidebar";
import { ThemeToggle } from "../../app/theme";
import type { CategorySummary, ProjectSummary } from "../../domain/project/project";
import { createCategory, createProject, deleteProject, updateCategory } from "../../domain/project/api";

function editedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

type CreateTarget = { kind: "category" } | { kind: "workspace"; category: CategorySummary };

export function Dashboard({ categories, workspaces }: { categories: CategorySummary[]; workspaces: ProjectSummary[] }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [renaming, setRenaming] = useState<CategorySummary | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const router = useRouter();

  function beginCreate(target: CreateTarget) {
    setError("");
    setTitle("");
    setCreateTarget(target);
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!createTarget || busy || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (createTarget.kind === "category") {
        await createCategory(title.trim());
        setCreateTarget(null);
        await router.invalidate();
        return;
      }
      const workspace = await createProject(title.trim(), createTarget.category.id);
      setCreateTarget(null);
      await router.invalidate();
      await navigate({ to: "/projects/$projectId", params: { projectId: workspace.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create this item.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteProject(deleting.id);
      setDeleting(null);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete workspace.");
    } finally {
      setBusy(false);
    }
  }

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    if (!renaming || busy || !title.trim()) return;
    setBusy(true); setError("");
    try {
      await updateCategory(renaming.id, title.trim());
      setRenaming(null);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename this category.");
    } finally { setBusy(false); }
  }

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <Sidebar categories={categories} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />
      <main className="dashboard">
        <header className="topbar dashboard-header"><div><span className="dashboard-label">LIBRARY</span><span className="dashboard-context">Categories &nbsp;·&nbsp; Workspaces</span></div><ThemeToggle /></header>
        <div className="dashboard-content">
          <div className="page-heading category-page-heading">
            <div><p className="eyebrow">YOUR KNOWLEDGE, ORGANIZED</p><h1>Make space for your thinking.</h1><p>Organize workspaces by category. Each workspace holds one document and canvas.</p></div>
            <button className="primary" onClick={() => beginCreate({ kind: "category" })}><Plus size={17} /> New category</button>
          </div>
          {!categories.length ? (
            <section className="empty-state category-empty"><span className="empty-mark"><Layers size={24} /></span><h2>Start with a category</h2><p>Group the workspaces you return to together.</p><button className="primary" onClick={() => beginCreate({ kind: "category" })}><Plus size={17} /> Create category</button></section>
          ) : (
            <div className="category-list">
              {categories.map((category) => {
                const categoryWorkspaces = workspaces.filter((workspace) => workspace.categoryId === category.id);
                return <section id={`category-section-${category.id}`} className={category.title.toLowerCase() === "uncategorized" ? "category-card category-card-system" : "category-card"} key={category.id} aria-labelledby={`category-${category.id}`}>
                  <div className="category-card-header">
                    <div className="category-title"><span className="category-mark"><Layers size={16} /></span><div><h2 id={`category-${category.id}`}>{category.title}</h2><p>{categoryWorkspaces.length} workspace{categoryWorkspaces.length === 1 ? "" : "s"} <span className="category-dot">·</span> updated {editedAt(category.updatedAt)}</p></div></div>
                    <div className="category-actions"><button className="secondary compact-action" onClick={() => beginCreate({ kind: "workspace", category })}><Plus size={15} /> New workspace</button><button className="icon-button" aria-label={`Rename ${category.title}`} title="Rename category" onClick={() => { setTitle(category.title); setError(""); setRenaming(category); }}><Pencil size={15} /></button></div>
                  </div>
                  <div className="workspace-list">
                    {categoryWorkspaces.map((workspace) => <div className="workspace-row" key={workspace.id}>
                      <Link to="/projects/$projectId" params={{ projectId: workspace.id }} className="workspace-link">
                        <span className="workspace-icon"><FileText size={16} /></span><span className="workspace-name">{workspace.title}</span><span className="workspace-surfaces"><FileText size={13} /><Layers size={13} /></span><time dateTime={workspace.updatedAt}>Edited {editedAt(workspace.updatedAt)}</time>
                      </Link>
                      <button className="quiet-delete" aria-label={`Delete ${workspace.title}`} onClick={() => { setError(""); setDeleting(workspace); }}>Delete</button>
                    </div>)}
                    {!categoryWorkspaces.length && <button className="workspace-empty" onClick={() => beginCreate({ kind: "workspace", category })}><Plus size={15} /> Create the first workspace in this category</button>}
                  </div>
                </section>;
              })}
            </div>
          )}
        </div>
      </main>
      <Dialog.Root open={!!createTarget} onOpenChange={(open) => { if (!open && !busy) setCreateTarget(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content create-dialog"><Dialog.Title>{createTarget?.kind === "category" ? "Name this category" : "Name this workspace"}</Dialog.Title><Dialog.Description>{createTarget?.kind === "category" ? "Use a category for a body of work you want to return to." : `This workspace will live in ${createTarget?.kind === "workspace" ? createTarget.category.title : "this category"}.`}</Dialog.Description><form onSubmit={create}><input className="seamless-input" aria-label={createTarget?.kind === "category" ? "Category title" : "Workspace title"} autoFocus autoComplete="off" placeholder={createTarget?.kind === "category" ? "e.g. Computer Science" : "e.g. Distributed Systems"} maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} /><p className="form-error" role="alert">{error}</p><div className="dialog-actions"><Dialog.Close className="secondary" disabled={busy}>Cancel</Dialog.Close><button className="primary" disabled={busy || !title.trim()}>{busy ? "Creating…" : createTarget?.kind === "category" ? "Create category" : "Create workspace"}</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>
      <Dialog.Root open={!!deleting} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><Dialog.Title>Delete this workspace?</Dialog.Title><Dialog.Description>“{deleting?.title}” and its document and canvas will be permanently deleted.</Dialog.Description><p className="form-error" role="alert">{error}</p><div className="dialog-actions"><Dialog.Close className="secondary" disabled={busy}>Keep workspace</Dialog.Close><button className="danger" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete workspace"}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
      <Dialog.Root open={!!renaming} onOpenChange={(open) => { if (!open && !busy) setRenaming(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content create-dialog"><Dialog.Title>Rename category</Dialog.Title><Dialog.Description>Use a short name that helps you find this group again.</Dialog.Description><form onSubmit={rename}><input className="seamless-input" aria-label="Category title" autoFocus autoComplete="off" maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} /><p className="form-error" role="alert">{error}</p><div className="dialog-actions"><Dialog.Close className="secondary" disabled={busy}>Cancel</Dialog.Close><button className="primary" disabled={busy || !title.trim()}>{busy ? "Saving…" : "Save category"}</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>
    </div>
  );
}
