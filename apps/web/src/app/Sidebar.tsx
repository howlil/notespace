import { Link } from "@tanstack/react-router";
import { ArrowUpRight, FileText, LayoutGrid, Plus } from "lucide-react";
import type { ProjectSummary } from "../domain/project/project";

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        n<span>·</span>
      </span>
      notespace<span className="brand-dot">.</span>
    </span>
  );
}

export function Sidebar({
  projects,
  selected,
  onCreate,
}: {
  projects: ProjectSummary[];
  selected?: string;
  onCreate?: () => void;
}) {
  return (
    <aside className="sidebar">
      <Link to="/" className="brand-link" aria-label="Notespace home">
        <Brand />
      </Link>
      {onCreate && (
        <button className="primary new-sidebar" onClick={onCreate}>
          <Plus size={17} />
          New project
        </button>
      )}
      <nav aria-label="Main navigation">
        <Link to="/" className={!selected ? "nav-item active" : "nav-item"}>
          <LayoutGrid size={17} />
          All projects
          {!selected && <span className="count">{projects.length}</span>}
        </Link>
      </nav>
      <div className="sidebar-section">RECENT PROJECTS</div>
      <nav aria-label="Recent projects" className="recent-nav">
        {projects.slice(0, 7).map((project) => (
          <Link
            key={project.id}
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className={selected === project.id ? "nav-item active" : "nav-item"}
          >
            <FileText size={16} />
            <span className="truncate">{project.title}</span>
          </Link>
        ))}
        {!projects.length && (
          <p className="sidebar-hint">Your ideas will live here.</p>
        )}
      </nav>
      <div className="sidebar-footer">
        <div className="instance-label">
          YOUR THINKING SPACE
          <ArrowUpRight size={14} />
        </div>
        <p>Write. Draw. Understand.</p>
        <span className="instance-tag">Self-hosted</span>
      </div>
    </aside>
  );
}
