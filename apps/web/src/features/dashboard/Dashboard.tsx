import { useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { FileText, Layers, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Brand } from "../../app/Sidebar";
import { ThemeToggle } from "../../app/theme";
import type { CategorySummary, ProjectSummary } from "../../domain/project/project";
import { createCategory, createProject, deleteProject, updateCategory } from "../../domain/project/api";

function editedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

type CreateTarget = { kind: "category" } | { kind: "workspace"; category: CategorySummary };

export function Dashboard({ categories, workspaces }: { categories: CategorySummary[]; workspaces: ProjectSummary[] }) {
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
    setBusy(true);
    setError("");
    try {
      await updateCategory(renaming.id, title.trim());
      setRenaming(null);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename this category.");
    } finally {
      setBusy(false);
    }
  }

  const workspaceCount = workspaces.length;
  return (
    <div className="dashboard-shell">
      <main className="dashboard">
        <header className="topbar dashboard-header"><Link to="/" className="dashboard-brand" aria-label="Notespace home"><Brand /></Link><ThemeToggle /></header>
        <div className="dashboard-content">
          <div className="dashboard-heading">
            <div><h1>Categories</h1><p>{categories.length} categor{categories.length === 1 ? "y" : "ies"} <span>·</span> {workspaceCount} workspace{workspaceCount === 1 ? "" : "s"}</p></div>
            {createTarget?.kind === "category" ? <form className="quick-create" onSubmit={create}><input aria-label="Category title" autoFocus autoComplete="off" placeholder="Category name" maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setCreateTarget(null); }} /><button className="primary" disabled={busy || !title.trim()}>{busy ? "Adding…" : "Add"}</button><button type="button" className="icon-button" aria-label="Cancel new category" onClick={() => setCreateTarget(null)}><span aria-hidden="true">×</span></button>{error && <span className="quick-create-error" role="alert">{error}</span>}</form> : <button className="primary" onClick={() => beginCreate({ kind: "category" })}><Plus size={17} /> New category</button>}
          </div>
          {!categories.length ? (
            <section className="empty-state category-empty"><span className="empty-mark"><Layers size={22} /></span><h2>No categories yet</h2><p>Create one to start organizing workspaces.</p></section>
          ) : (
            <div className="category-list">
              {categories.map((category) => {
                const categoryWorkspaces = workspaces.filter((workspace) => workspace.categoryId === category.id);
                const systemCategory = category.title.toLowerCase() === "uncategorized";
                return <section id={`category-section-${category.id}`} className={systemCategory ? "category-card category-card-system" : "category-card"} key={category.id} aria-labelledby={`category-${category.id}`}>
                  <div className="category-card-header">
                    <div className="category-title"><span className="category-mark"><Layers size={16} /></span><div><h2 id={`category-${category.id}`}>{category.title}</h2><p>{categoryWorkspaces.length} workspace{categoryWorkspaces.length === 1 ? "" : "s"} <span className="category-dot">·</span> updated {editedAt(category.updatedAt)}</p></div></div>
                    <div className="category-actions"><button className="secondary compact-action" onClick={() => beginCreate({ kind: "workspace", category })}><Plus size={15} /> New workspace</button><button className="icon-button" aria-label={`Rename ${category.title}`} title="Rename category" onClick={() => { setTitle(category.title); setError(""); setRenaming(category); }}><Pencil size={15} /></button></div>
                  </div>
                  {createTarget?.kind === "workspace" && createTarget.category.id === category.id && <form className="quick-create workspace-quick-create" onSubmit={create}><input aria-label="Workspace title" autoFocus autoComplete="off" placeholder="Workspace name" maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setCreateTarget(null); }} /><button className="primary" disabled={busy || !title.trim()}>{busy ? "Adding…" : "Add"}</button><button type="button" className="icon-button" aria-label="Cancel new workspace" onClick={() => setCreateTarget(null)}><span aria-hidden="true">×</span></button>{error && <span className="quick-create-error" role="alert">{error}</span>}</form>}
                  <div className="workspace-list">
                    {categoryWorkspaces.map((workspace) => <div className="workspace-row" key={workspace.id}>
                      <Link to="/projects/$projectId" params={{ projectId: workspace.id }} className="workspace-link"><span className="workspace-icon"><FileText size={16} /></span><span className="workspace-name">{workspace.title}</span><time dateTime={workspace.updatedAt}>Edited {editedAt(workspace.updatedAt)}</time></Link>
                      <details className="workspace-menu"><summary className="icon-button" aria-label={`Actions for ${workspace.title}`} title="Workspace actions"><MoreHorizontal size={17} /></summary><div className="workspace-menu-popover workspace-menu-right"><button className="menu-item menu-item-danger" onClick={() => { setError(""); setDeleting(workspace); }}><Trash2 size={14} /> Delete workspace</button></div></details>
                    </div>)}
                    {!categoryWorkspaces.length && <button className="workspace-empty" onClick={() => beginCreate({ kind: "workspace", category })}><Plus size={15} /> Create the first workspace in this category</button>}
                  </div>
                </section>;
              })}
            </div>
          )}
        </div>
      </main>
      <Dialog.Root open={!!deleting} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><Dialog.Title>Delete this workspace?</Dialog.Title><Dialog.Description>“{deleting?.title}” and its document and canvas will be permanently deleted.</Dialog.Description><p className="form-error" role="alert">{error}</p><div className="dialog-actions"><Dialog.Close className="secondary" disabled={busy}>Keep workspace</Dialog.Close><button className="danger" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete workspace"}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
      <Dialog.Root open={!!renaming} onOpenChange={(open) => { if (!open && !busy) setRenaming(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content create-dialog"><Dialog.Title>Rename category</Dialog.Title><Dialog.Description>Choose a new name.</Dialog.Description><form onSubmit={rename}><input className="seamless-input" aria-label="Category title" autoFocus autoComplete="off" maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} /><p className="form-error" role="alert">{error}</p><div className="dialog-actions"><Dialog.Close className="secondary" disabled={busy}>Cancel</Dialog.Close><button className="primary" disabled={busy || !title.trim()}>{busy ? "Saving…" : "Save category"}</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>
    </div>
  );
}
