import { useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  FileText,
  Layers,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Sidebar } from "../../app/Sidebar";
import { ThemeToggle } from "../../app/theme";
import type { ProjectSummary } from "../../domain/project/project";
import { createProject, deleteProject } from "../../domain/project/api";

function editedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function Dashboard({ projects }: { projects: ProjectSummary[] }) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const router = useRouter();
  const filtered = projects.filter((project) =>
    project.title.toLowerCase().includes(query.toLowerCase().trim()),
  );
  const startCreate = () => {
    setError("");
    setTitle("");
    setCreating(true);
  };

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const project = await createProject(title.trim());
      setCreating(false);
      await router.invalidate();
      await navigate({
        to: "/projects/$projectId",
        params: { projectId: project.id },
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create project.",
      );
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
      setError(
        err instanceof Error ? err.message : "Could not delete project.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar projects={projects} onCreate={startCreate} />
      <main className="dashboard">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <span>/</span> <strong>Projects</strong>
          </span>
          <ThemeToggle />
        </header>
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">A LITTLE ROOM FOR BIG IDEAS</p>
              <h1>Your projects</h1>
              <p>Pick up a thought. Make room for the next one.</p>
            </div>
            <button className="primary" onClick={startCreate}>
              <Plus size={17} />
              New project
            </button>
          </div>
          {!projects.length ? (
            <section className="empty-state">
              <div className="empty-symbol">
                <FileText size={30} />
                <span>+</span>
                <Layers size={30} />
              </div>
              <h2>One project. Two ways to think.</h2>
              <p>
                Write your notes and map your ideas on a canvas,
                <br />
                together in one workspace.
              </p>
              <button className="primary" onClick={startCreate}>
                <Plus size={17} />
                Create your first project
              </button>
              <span className="empty-footnote">
                Your content stays on your instance.
              </span>
            </section>
          ) : (
            <>
              {!query && (
                <section aria-labelledby="recent-heading">
                  <div className="section-heading">
                    <h2 id="recent-heading">Pick up where you left off</h2>
                    <span>{Math.min(projects.length, 3)} recent</span>
                  </div>
                  <div className="project-grid">
                    {projects.slice(0, 3).map((project, index) => (
                      <Link
                        key={project.id}
                        className="project-card"
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                      >
                        <div className={`project-cover cover-${index}`}>
                          <div className="cover-letter">
                            {project.title.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="cover-caption">
                            <FileText size={15} />
                            <span>Document</span>
                            <span className="cover-plus">+</span>
                            <Layers size={15} />
                            <span>Canvas</span>
                          </div>
                        </div>
                        <div className="card-details">
                          <h3>{project.title}</h3>
                          <ArrowRight size={17} />
                          <p>Edited {editedAt(project.updatedAt)}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              <section aria-labelledby="all-heading">
                <div className="section-heading all-heading">
                  <h2 id="all-heading">
                    All projects{" "}
                    <span className="count">{filtered.length}</span>
                  </h2>
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Search projects"
                      placeholder="Search projects…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    {query && (
                      <button
                        className="icon-button"
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                </div>
                {filtered.length ? (
                  <div className="project-table">
                    <div className="table-heading">
                      <span>PROJECT NAME</span>
                      <span>LAST EDITED</span>
                      <span />
                    </div>
                    {filtered.map((project) => (
                      <div className="project-row" key={project.id}>
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: project.id }}
                          className="project-name"
                        >
                          <span className="file-icon">
                            <FileText size={18} />
                          </span>
                          <span className="truncate">{project.title}</span>
                        </Link>
                        <time dateTime={project.updatedAt}>
                          {editedAt(project.updatedAt)}
                        </time>
                        <button
                          className="icon-button delete-button"
                          aria-label={`Delete ${project.title}`}
                          onClick={() => {
                            setError("");
                            setDeleting(project);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="search-empty">
                    <Search size={25} />
                    <h3>No matching projects</h3>
                    <p>Try another title or clear your search.</p>
                    <button className="secondary" onClick={() => setQuery("")}>
                      Clear search
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>Ideas are better with a little space.</span>
            <span>Notespace / 01</span>
          </footer>
        </div>
      </main>
      <Dialog.Root
        open={creating}
        onOpenChange={(value) => {
          if (!busy) setCreating(value);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>Start a new project</Dialog.Title>
            <Dialog.Description>
              A document and a canvas. One place for your idea.
            </Dialog.Description>
            <form onSubmit={create}>
              <label htmlFor="project-title">Project title</label>
              <input
                id="project-title"
                autoComplete="off"
                placeholder="e.g. Distributed Systems"
                maxLength={160}
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <p className="form-error" role="alert">
                {error}
              </p>
              <div className="dialog-actions">
                <Dialog.Close className="secondary" disabled={busy}>
                  Cancel
                </Dialog.Close>
                <button className="primary" disabled={busy || !title.trim()}>
                  {busy ? "Creating…" : "Create project"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={!!deleting}
        onOpenChange={(value) => {
          if (!value && !busy) setDeleting(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>Delete this project?</Dialog.Title>
            <Dialog.Description>
              “{deleting?.title}” and its document and canvas will be
              permanently deleted. This cannot be undone.
            </Dialog.Description>
            <p className="form-error" role="alert">
              {error}
            </p>
            <div className="dialog-actions">
              <Dialog.Close className="secondary" disabled={busy}>
                Keep project
              </Dialog.Close>
              <button
                className="danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? "Deleting…" : "Delete project"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
