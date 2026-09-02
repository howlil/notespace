import { Link } from "@tanstack/react-router";
import { LayoutGrid, PanelLeftClose, PanelLeftOpen, Plus, Tag } from "lucide-react";
import type { CategorySummary } from "../domain/project/project";

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
  categories,
  collapsed,
  onToggle,
  onCreateCategory,
}: {
  categories: CategorySummary[];
  collapsed: boolean;
  onToggle: () => void;
  onCreateCategory: () => void;
}) {
  return (
    <aside className={collapsed ? "sidebar is-collapsed" : "sidebar"}>
      <Link to="/" className="brand-link" aria-label="Notespace home">
        <Brand />
      </Link>
      <button className="sidebar-toggle icon-button" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
      </button>
      {!collapsed && (
        <button className="primary new-sidebar" onClick={onCreateCategory}>
          <Plus size={17} />
          New category
        </button>
      )}
      <nav aria-label="Main navigation">
        <Link to="/" className="nav-item active">
          <LayoutGrid size={17} />
          {!collapsed && <>All categories <span className="count">{categories.length}</span></>}
        </Link>
      </nav>
      {!collapsed && <>
        <div className="sidebar-section">CATEGORIES</div>
        <nav aria-label="Categories" className="recent-nav">
          {categories.map((category) => (
            <span className="nav-item" key={category.id}>
              <Tag size={15} />
              <span className="truncate">{category.title}</span>
              <span className="count">{category.workspaceCount}</span>
            </span>
          ))}
        </nav>
      </>}
    </aside>
  );
}
